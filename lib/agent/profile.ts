/**
 * Profile build: a tool-calling loop over Qloo, wrapped in deterministic
 * pre/post steps. Every step is streamed to the browser and saved to
 * agent_runs so the "How Encore thought" panel can replay it.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { hasToolCall, isStepCount, streamText } from "ai";
import { db, must } from "../db";
import { decadesLabel } from "../era";
import { DOMAINS, DOMAIN_KEYS, type Domain } from "../domains";
import { resolveMedia } from "../media/resolve";
import { qloo } from "../qloo";
import type { QlooEntity } from "../qloo/types";
import type { AgentStep, Profile, ProfileItem, Why } from "../profiles";
import { loadAgentContext, type AgentContext } from "./context";
import type { AgentEvent } from "./events";
import { newRunState, profileTools, type RunState } from "./tools";

const MAX_STEPS = 12;
const RUN_TIMEOUT_MS = 180_000;

export function domainForType(type: string): Domain {
  if (type === "urn:entity:artist") return "music";
  if (type === "urn:entity:movie") return "film";
  if (type === "urn:entity:tv_show") return "tv";
  if (type === "urn:entity:book") return "book";
  return "place";
}

function snapshot(e: QlooEntity): ProfileItem["data"] {
  return {
    image: e.image,
    description: e.description,
    tags: [...new Set(e.tags.filter((t) => /genre|style|cuisine/.test(t.type)).map((t) => t.name))].slice(0, 6),
    notableSongs: e.notableSongs?.slice(0, 5),
    address: e.address,
    popularity: e.popularity,
    external: Object.fromEntries(Object.entries(e.external).filter(([k]) => ["spotify", "imdb", "wikidata"].includes(k))) as Record<string, string>,
  };
}

function whyFor(e: QlooEntity, ctx: AgentContext): Why[] {
  return e.explain
    .filter((x) => ctx.names.has(x.entityId))
    .slice(0, 3)
    .map((x) => ({ entityId: x.entityId, name: ctx.names.get(x.entityId)!, score: Number(x.score.toFixed(2)) }));
}

export function systemPrompt(ctx: AgentContext, mode: "build" | "expand"): string {
  const p = ctx.profile;
  const seedLines = ctx.signalSeeds.map((s) => `- ${s.name} [${s.type.replace("urn:entity:", "")}${s.year ? ` ${s.year}` : ""}] id=${s.id}`).join("\n");
  const caregiverAvoid = ctx.avoid.filter((a) => a.source === "caregiver" && !a.tag_id && !a.entity_id).map((a) => a.raw_text);
  const learned = ctx.items.filter((i) => i.status === "excluded").map((i) => i.name);

  return `You are Encore's taste-memory agent. You rebuild the cultural world of a person living with dementia from a few things their caregiver says they loved, using Qloo's taste graph. The caregiver will use what you find for short, calm reminiscence sessions.

Person: ${p.first_name}, born ${p.birth_year}, grew up in ${p.hometown}.${p.languages.length ? ` Languages: ${p.languages.join(", ")}.` : ""}
Reminiscence window (ages 10-30, when memories are most vivid): ${ctx.window.start}-${ctx.window.end}, ${decadesLabel(ctx.window)}.
Films and TV mostly from: ${p.film_country ?? "unknown"}.
Seeds (Qloo entity IDs):
${seedLines}
${ctx.foodSeeds.length ? `Food memories (already mapped to Qloo place tags and applied to the food domain automatically): ${ctx.foodSeeds.map((f) => `${f.text}${f.tagId ? ` → ${f.tagId}` : ""}`).join(", ")}.` : "No food memories given; the food domain uses restaurants near home."}
${caregiverAvoid.length ? `Caregiver's avoid list (not yet resolved to tags): ${caregiverAvoid.join("; ")}.` : "No avoid list."}
${learned.length ? `Already excluded after past sessions (never pick similar items): ${learned.join(", ")}.` : ""}
War, horror, disasters, funerals and graphic violence are excluded automatically for film, TV and books.${p.locality_id || (p.lat != null && p.lon != null) ? "" : "\nThe hometown could not be located, so skip the food and place domains."}

How to work:
1. ${caregiverAvoid.length ? "Resolve each avoid-list entry to Qloo tag IDs with qloo_tags_search, then pass the matching IDs as excludeTags in your qloo_insights calls." : "There is no avoid list, so skip tag resolution."}
2. Call qloo_insights for ${mode === "expand" ? "music, film and tv (and others if the profile is thin)" : "every domain: music, film, tv, book, food, place"} in ONE step as parallel tool calls. Era, country, location, age and exclusions are filled in for you; pass fields only to override or broaden. For food, don't pass tags unless the automatic search comes back thin; if you do, use urn:tag:genre:place:restaurant:<cuisine> tags.
3. If a domain returns fewer than 4 results, broaden it once (releaseCountry "any", wider years, or no tags). Never retry a domain more than once.
4. Call save_profile once with a diverse shortlist: about 6-8 music, 4-6 film, 3-4 tv, 2-3 book, 3-4 food, 2-3 place (fewer when results are thin; skip a domain rather than pad it).
   - Diversity: mix close matches with adjacent ones; avoid near-duplicates (not eight male crooners); vary genre and mood.
   - Prefer items from the reminiscence window. Skip anything modern, violent, sad, or wrong for a calm session, and anything like the avoid list.
   - For places and food, prefer long-standing, well-known spots and landmarks over chains and offices.
   - Only use entityIds from qloo_insights results.
   - reason: at most 15 words, concrete, plain English for a caregiver. Ground it in the result's tags, the seeds that drove it, or widely known facts. Never invent.
   - summary: 2-3 warm sentences starting "${p.first_name}'s world:", naming the era, the place and the threads you found. Use ${p.first_name}'s name, never pronouns.
Before each batch of tool calls, write ONE short sentence (max 20 words) telling the caregiver what you are doing. No other prose, no markdown.`;
}

interface RunOptions {
  mode?: "build" | "expand";
  emit: (e: AgentEvent) => void;
}

export async function runProfileAgent(profile: Profile, { mode = "build", emit }: RunOptions): Promise<void> {
  const run = must(await db().from("agent_runs").insert({ profile_id: profile.id, kind: "profile" }).select("id").single(), "agent run") as { id: string };
  emit({ t: "run", runId: run.id });

  const steps: AgentStep[] = [];
  const persist = () => db().from("agent_runs").update({ steps }).eq("id", run.id);
  const upsertStep = (s: AgentStep) => {
    const i = steps.findIndex((x) => x.id === s.id);
    if (i >= 0) steps[i] = s;
    else steps.push(s);
    emit({ t: "step", step: s });
  };

  try {
    const ctx = await loadAgentContext(profile);
    const name = profile.first_name;

    upsertStep({
      id: "era",
      kind: "deterministic",
      tool: "era_window",
      label: "Worked out the reminiscence window",
      input: { birthYear: profile.birth_year },
      status: "done",
      summary: `${ctx.window.start}–${ctx.window.end}: ages 10 to 30, ${decadesLabel(ctx.window)}`,
    });

    // Seeds become profile items too: they are the strongest material for sessions.
    if (mode === "build") {
      const t0 = Date.now();
      const ids = ctx.signalSeeds.map((s) => s.id);
      const r = await qloo.entities(ids);
      const rows = r.data.map((e) => ({
        profile_id: profile.id,
        entity_id: e.id,
        entity_type: ctx.signalSeeds.find((s) => s.id === e.id)?.type ?? e.type,
        domain: domainForType(ctx.signalSeeds.find((s) => s.id === e.id)?.type ?? e.type),
        name: e.name,
        year: e.year ?? null,
        weight: 1,
        status: "promoted",
        reason: "One of the things you told us they loved.",
        why: [],
        data: snapshot(e),
        added_in_version: 1,
      }));
      if (rows.length) must(await db().from("profile_items").upsert(rows, { onConflict: "profile_id,entity_id" }), "seed items");
      upsertStep({
        id: "seeds",
        kind: "deterministic",
        tool: "qloo_entities",
        label: `Loaded ${name}'s ${rows.length} seeds from Qloo`,
        input: { entity_ids: ids },
        status: "done",
        summary: rows.map((x) => x.name).join(", "),
        qloo: [r.trace],
        ms: Date.now() - t0,
      });
    }
    await persist();

    const state = newRunState();
    const tools = profileTools(ctx, state);
    const started = new Map<string, number>();
    const thoughts = new Map<string, string>();

    const result = streamText({
      model: anthropic(process.env.LLM_MODEL ?? "claude-sonnet-5-5"),
      system: systemPrompt(ctx, mode),
      prompt: mode === "build" ? `Build ${name}'s Taste Profile.` : `Expand ${name}'s Taste Profile using the updated seeds and exclusions.`,
      tools,
      stopWhen: [isStepCount(MAX_STEPS), hasToolCall("save_profile")],
      abortSignal: AbortSignal.timeout(RUN_TIMEOUT_MS),
      maxOutputTokens: 4000,
    });

    for await (const part of result.stream) {
      switch (part.type) {
        case "text-start":
          thoughts.set(part.id, "");
          break;
        case "text-delta": {
          const text = (thoughts.get(part.id) ?? "") + part.text;
          thoughts.set(part.id, text);
          emit({ t: "thought", id: `thought-${part.id}`, delta: part.text });
          break;
        }
        case "text-end": {
          const text = thoughts.get(part.id)?.trim();
          if (text) {
            const s: AgentStep = { id: `thought-${part.id}`, kind: "thought", label: text, status: "done" };
            const i = steps.findIndex((x) => x.id === s.id);
            if (i >= 0) steps[i] = s;
            else steps.push(s);
          }
          break;
        }
        case "tool-call":
          started.set(part.toolCallId, Date.now());
          upsertStep({ id: part.toolCallId, kind: "tool", tool: part.toolName, label: toolLabel(part.toolName, part.input, name), input: part.input, status: "running" });
          break;
        case "tool-result":
          upsertStep({
            id: part.toolCallId,
            kind: "tool",
            tool: part.toolName,
            label: toolLabel(part.toolName, part.input, name),
            input: part.input,
            status: "done",
            summary: toolSummary(part.toolName, part.output),
            qloo: state.traces.get(part.toolCallId)?.map((t) => ({ endpoint: t.endpoint, params: t.params, ms: t.ms, cached: t.cached, count: t.count })),
            ms: Date.now() - (started.get(part.toolCallId) ?? Date.now()),
          });
          await persist();
          break;
        case "tool-error":
          upsertStep({
            id: part.toolCallId,
            kind: "tool",
            tool: part.toolName,
            label: toolLabel(part.toolName, part.input, name),
            input: part.input,
            status: "error",
            summary: String((part.error as Error)?.message ?? part.error).slice(0, 300),
            qloo: state.traces.get(part.toolCallId)?.map((t) => ({ endpoint: t.endpoint, params: t.params, ms: t.ms, cached: t.cached, count: t.count })),
          });
          break;
        case "error":
          throw part.error;
      }
    }

    const summary = await saveItems(ctx, state, mode, upsertStep);
    await resolveAllMedia(profile.id, upsertStep);

    const version = profile.version + 1;
    const items = must(await db().from("profile_items").select("id,entity_id,name,status").eq("profile_id", profile.id), "items") as Pick<ProfileItem, "id" | "entity_id" | "name" | "status">[];
    must(await db().from("profiles").update({ version, summary, updated_at: new Date().toISOString() }).eq("id", profile.id), "profile version");
    must(
      await db()
        .from("profile_versions")
        .upsert(
          {
            profile_id: profile.id,
            version,
            summary,
            seeds: ctx.signalSeeds.map((s) => ({ id: s.id, name: s.name })),
            excluded: items.filter((i) => i.status === "excluded").map((i) => ({ id: i.entity_id, name: i.name })),
            item_ids: items.filter((i) => i.status !== "excluded").map((i) => i.entity_id),
          },
          { onConflict: "profile_id,version" },
        ),
      "profile version snapshot",
    );

    await db().from("agent_runs").update({ steps, status: "done", output: { summary, version }, finished_at: new Date().toISOString() }).eq("id", run.id);
    emit({ t: "done", summary, itemCount: items.filter((i) => i.status !== "excluded").length });
  } catch (err) {
    console.error("profile agent failed", err);
    await db().from("agent_runs").update({ steps, status: "error", error: String((err as Error)?.message ?? err).slice(0, 500), finished_at: new Date().toISOString() }).eq("id", run.id);
    emit({ t: "error", message: "The build hit a problem. Please try again." });
  }
}

/** Persists the model's shortlist, or a deterministic fallback if it never called save_profile. */
async function saveItems(ctx: AgentContext, state: RunState, mode: "build" | "expand", upsertStep: (s: AgentStep) => void): Promise<string> {
  const name = ctx.profile.first_name;
  let picks = state.saved?.items;
  let summary = state.saved?.summary;
  const fallback = !picks?.length;

  if (fallback) {
    const quota: Record<Domain, number> = { music: 6, film: 4, tv: 3, book: 2, food: 3, place: 2 };
    const counts = Object.fromEntries(DOMAIN_KEYS.map((d) => [d, 0])) as Record<Domain, number>;
    picks = [];
    for (const [id, entry] of state.pool) {
      if (counts[entry.domain] < quota[entry.domain]) {
        counts[entry.domain]++;
        picks.push({ entityId: id, reason: `Close to ${entry.entity.explain[0] ? ctx.names.get(entry.entity.explain[0].entityId) : "their seeds"} in Qloo's taste graph.` });
      }
    }
    summary = `${name}'s world: ${ctx.profile.hometown} in ${decadesLabel(ctx.window)}.`;
  }

  const version = ctx.profile.version + 1;
  const rows = picks!.map((pick) => {
    const { entity, domain } = state.pool.get(pick.entityId)!;
    return {
      profile_id: ctx.profile.id,
      entity_id: entity.id,
      entity_type: DOMAINS[domain].type,
      domain,
      name: entity.name,
      year: entity.year ?? null,
      weight: 0,
      status: "active",
      reason: pick.reason,
      why: whyFor(entity, ctx),
      data: snapshot(entity),
      added_in_version: version,
    };
  });
  if (rows.length) must(await db().from("profile_items").upsert(rows, { onConflict: "profile_id,entity_id", ignoreDuplicates: mode === "expand" }), "profile items");

  const byDomain = DOMAIN_KEYS.map((d) => [d, rows.filter((r) => r.domain === d).length] as const).filter(([, n]) => n > 0);
  upsertStep({
    id: "save",
    kind: "deterministic",
    tool: "save_profile_items",
    label: fallback ? "Saved a shortlist (automatic fallback)" : `Saved ${rows.length} picks to ${name}'s Taste Profile`,
    status: "done",
    summary: byDomain.map(([d, n]) => `${n} ${DOMAINS[d].label.toLowerCase()}`).join(" · ") + (state.saved?.dropped.length ? ` · rejected ${state.saved.dropped.length} unknown IDs` : ""),
  });
  return summary!;
}

async function resolveAllMedia(profileId: string, upsertStep: (s: AgentStep) => void) {
  const t0 = Date.now();
  const items = must(await db().from("profile_items").select("id,domain,name,year,data").eq("profile_id", profileId).is("media", null), "media items") as Pick<ProfileItem, "id" | "domain" | "name" | "year" | "data">[];
  upsertStep({ id: "media", kind: "deterministic", tool: "resolve_media", label: `Finding posters, songs and maps for ${items.length} items`, status: "running" });
  await Promise.all(
    items.map(async (i) => {
      const media = await resolveMedia(i);
      await db().from("profile_items").update({ media }).eq("id", i.id);
    }),
  );
  upsertStep({ id: "media", kind: "deterministic", tool: "resolve_media", label: `Found posters, songs and maps for ${items.length} items`, status: "done", ms: Date.now() - t0 });
}

function toolLabel(tool: string, input: unknown, name: string): string {
  const i = (input ?? {}) as Record<string, unknown>;
  if (tool === "qloo_insights") {
    const what: Record<string, string> = { music: "singers and bands", film: "films", tv: "TV shows", book: "books", food: "food spots near home", place: "places near home" };
    const broadened = i.releaseCountry || i.releaseYearMin || i.releaseYearMax || i.tags ? " (broadened)" : "";
    return `Asked Qloo for ${what[String(i.domain)] ?? String(i.domain)} that fit ${name}'s taste${broadened}`;
  }
  if (tool === "qloo_tags_search") return `Looked up Qloo tags for “${String(i.query)}”`;
  if (tool === "save_profile") return "Picked a diverse shortlist";
  return tool;
}

function toolSummary(tool: string, output: unknown): string {
  const o = (output ?? {}) as Record<string, unknown>;
  if (tool === "qloo_insights") {
    const results = (o.results as { name: string; year: number | null }[]) ?? [];
    const dropped = typeof o.droppedOutOfEra === "number" && o.droppedOutOfEra > 0 ? ` (${o.droppedOutOfEra} outside the era filtered out)` : "";
    return `${results.length} results${dropped}${results.length ? `: ${results.slice(0, 4).map((r) => r.name).join(", ")}…` : ""}`;
  }
  if (tool === "qloo_tags_search") {
    const tags = (o.tags as { id: string }[]) ?? [];
    return tags.slice(0, 3).map((t) => t.id).join(", ") || "no tags found";
  }
  if (tool === "save_profile") return `${o.saved} picks saved${(o.dropped as string[])?.length ? `, ${(o.dropped as string[]).length} rejected` : ""}`;
  return "";
}
