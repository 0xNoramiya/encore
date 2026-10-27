/**
 * Facility mode. Pools several residents' seeds into one Qloo signal and ranks
 * results by how many residents they connect: explainability says which seeds
 * drove each pick, and every seed belongs to a resident.
 */
import { db, must } from "../db";
import { artistOverlapsWindow, decadesLabel, reminiscenceWindow, type EraWindow } from "../era";
import { DOMAINS, type Domain } from "../domains";
import { qloo } from "../qloo";
import type { QlooEntity } from "../qloo/types";
import type { AgentStep, Profile, Why } from "../profiles";
import { DEFAULT_MEDIA_EXCLUDES, loadAgentContext } from "./context";
import type { AgentEvent } from "./events";
import { domainForType } from "./profile";
import { resolveMedia } from "../media/resolve";

const GROUP_DOMAINS: Domain[] = ["music", "film", "tv"];
const SEEDS_PER_MEMBER = 3;
const KEEP: Record<string, number> = { music: 8, film: 5, tv: 4 };

interface SeedOwner {
  seedId: string;
  seedName: string;
  member: string;
}

export function groupWindow(members: Profile[]): EraWindow {
  const windows = members.map((m) => reminiscenceWindow(m.birth_year));
  return { start: Math.min(...windows.map((w) => w.start)), end: Math.max(...windows.map((w) => w.end)) };
}

/**
 * Residents whose seeds are among this pick's top drivers, strongest first.
 * With many pooled seeds explainability spreads thin, so only the top three
 * contributing seeds count; otherwise every pick would "connect" everyone.
 */
export function membersBehind(e: QlooEntity, owners: Map<string, SeedOwner>, top = 3, minScore = 0.05): string[] {
  const out: string[] = [];
  const drivers = [...e.explain].filter((x) => owners.has(x.entityId)).sort((a, b) => b.score - a.score).slice(0, top);
  for (const x of drivers) {
    const o = owners.get(x.entityId);
    if (o && x.score >= minScore && !out.includes(o.member)) out.push(o.member);
  }
  return out;
}

export async function createGroup(workspaceId: string, name: string, members: Profile[]): Promise<Profile> {
  const oldest = Math.min(...members.map((m) => m.birth_year));
  return must(
    await db()
      .from("profiles")
      .insert({
        workspace_id: workspaceId,
        kind: "group",
        member_ids: members.map((m) => m.id),
        first_name: name,
        birth_year: oldest,
        hometown: [...new Set(members.map((m) => m.hometown.split(",")[0]))].join(", "),
        languages: [...new Set(members.flatMap((m) => m.languages))],
      })
      .select("*")
      .single(),
    "insert group",
  ) as Profile;
}

export async function buildGroup(group: Profile, members: Profile[], emit: (e: AgentEvent) => void): Promise<void> {
  const run = must(await db().from("agent_runs").insert({ profile_id: group.id, kind: "profile" }).select("id").single(), "run") as { id: string };
  const steps: AgentStep[] = [];
  const step = (s: AgentStep) => {
    const i = steps.findIndex((x) => x.id === s.id);
    if (i >= 0) steps[i] = s;
    else steps.push(s);
    emit({ t: "step", step: s });
  };

  try {
    const window = groupWindow(members);
    step({
      id: "era",
      kind: "deterministic",
      tool: "era_window",
      label: "Combined everyone’s reminiscence windows",
      input: { birthYears: members.map((m) => m.birth_year) },
      status: "done",
      summary: `${window.start}–${window.end}, ${decadesLabel(window)}`,
    });

    const owners = new Map<string, SeedOwner>();
    const excludeEntities = new Set<string>();
    const avoidTags = new Set<string>();
    for (const m of members) {
      const ctx = await loadAgentContext(m);
      ctx.signalSeeds.slice(0, SEEDS_PER_MEMBER + 2).forEach((s, i) => {
        if (i < SEEDS_PER_MEMBER || ctx.items.some((it) => it.entity_id === s.id && it.why.length)) owners.set(s.id, { seedId: s.id, seedName: s.name, member: m.first_name });
      });
      ctx.excludeEntityIds.forEach((id) => excludeEntities.add(id));
      ctx.avoidTagIds.forEach((t) => avoidTags.add(t));
    }
    const seedIds = [...owners.keys()];
    step({
      id: "seeds",
      kind: "deterministic",
      tool: "pool_seeds",
      label: `Pooled ${seedIds.length} seeds from ${members.length} residents`,
      status: "done",
      summary: members.map((m) => `${m.first_name}: ${[...owners.values()].filter((o) => o.member === m.first_name).map((o) => o.seedName).join(", ")}`).join(" · "),
    });

    const sharedCountry = new Set(members.map((m) => m.film_country)).size === 1 ? members[0].film_country : null;
    const picks: { e: QlooEntity; domain: Domain; members: string[] }[] = [];
    await Promise.all(
      GROUP_DOMAINS.map(async (domain) => {
        const id = `insights-${domain}`;
        const params: Record<string, string | number | boolean> = {
          "filter.type": DOMAINS[domain].type,
          "signal.interests.entities": seedIds.join(","),
          "signal.demographics.age": "55_and_older",
          take: domain === "music" ? 50 : 30,
        };
        if (domain !== "music") {
          params["filter.release_year.min"] = window.start;
          params["filter.release_year.max"] = window.end;
          params["filter.exclude.tags"] = [...new Set([...DEFAULT_MEDIA_EXCLUDES, ...avoidTags])].join(",");
          if (sharedCountry) params["filter.release_country"] = sharedCountry;
        } else if (avoidTags.size) params["filter.exclude.tags"] = [...avoidTags].join(",");
        params["filter.exclude.entities"] = [...excludeEntities].join(",");
        step({ id, kind: "tool", tool: "qloo_insights", label: `Asked Qloo for ${domain === "music" ? "music" : domain === "film" ? "films" : "TV shows"} the whole group shares`, status: "running" });
        const r = await qloo.insights(params);
        let entities = r.data.entities;
        if (domain === "music") entities = entities.filter((e) => artistOverlapsWindow(e.year, e.endYear, window));
        // Shared appeal first: picks that connect more residents rank higher, then by affinity.
        const ranked = entities
          .map((e) => ({ e, domain, members: membersBehind(e, owners) }))
          .sort((a, b) => b.members.length - a.members.length || (b.e.affinity ?? 0) - (a.e.affinity ?? 0))
          .slice(0, KEEP[domain]);
        picks.push(...ranked);
        const shared = ranked.filter((p) => p.members.length >= 2).length;
        step({
          id,
          kind: "tool",
          tool: "qloo_insights",
          label: `Asked Qloo for ${domain === "music" ? "music" : domain === "film" ? "films" : "TV shows"} the whole group shares`,
          status: "done",
          summary: `${entities.length} results; kept ${ranked.length}, ${shared} connect two or more residents: ${ranked.slice(0, 3).map((p) => p.e.name).join(", ")}…`,
          qloo: [{ endpoint: r.trace.endpoint, params: r.trace.params, ms: r.trace.ms, cached: r.trace.cached, count: r.trace.count }],
        });
      }),
    );

    const rows = picks.map(({ e, domain, members: who }) => {
      const why: Why[] = e.explain
        .filter((x) => owners.has(x.entityId))
        .slice(0, 3)
        .map((x) => ({ entityId: x.entityId, name: `${owners.get(x.entityId)!.member}’s ${owners.get(x.entityId)!.seedName}`, score: Number(x.score.toFixed(2)) }));
      return {
        profile_id: group.id,
        entity_id: e.id,
        entity_type: DOMAINS[domain].type,
        domain: domainForType(DOMAINS[domain].type),
        name: e.name,
        year: e.year ?? null,
        weight: who.length >= 2 ? 1 : 0,
        status: "active",
        reason: who.length >= 2 ? `Connects ${who.join(", ")}` : who.length ? `From ${who[0]}’s taste` : "Shared era",
        why,
        data: {
          image: e.image,
          description: e.description,
          tags: e.tags.filter((t) => /genre|style/.test(t.type)).slice(0, 8).map((t) => ({ id: t.id, name: t.name })),
          notableSongs: e.notableSongs?.slice(0, 5),
          external: Object.fromEntries(Object.entries(e.external).filter(([k]) => ["spotify", "imdb"].includes(k))) as Record<string, string>,
        },
        added_in_version: 1,
      };
    });
    if (rows.length) must(await db().from("profile_items").upsert(rows, { onConflict: "profile_id,entity_id" }), "group items");

    step({ id: "media", kind: "deterministic", tool: "resolve_media", label: `Finding covers and players for ${rows.length} picks`, status: "running" });
    const saved = must(await db().from("profile_items").select("id,domain,name,year,data").eq("profile_id", group.id), "group saved") as {
      id: string;
      domain: Domain;
      name: string;
      year: number | null;
      data: { image?: string; notableSongs?: string[]; external?: Record<string, string> };
    }[];
    await Promise.all(saved.map(async (i) => db().from("profile_items").update({ media: await resolveMedia(i) }).eq("id", i.id)));
    step({ id: "media", kind: "deterministic", tool: "resolve_media", label: `Found covers and players for ${rows.length} picks`, status: "done" });

    const sharedCount = picks.filter((p) => p.members.length >= 2).length;
    const summary = `${group.first_name}: ${members.map((m) => m.first_name).join(", ")}, who grew up across ${decadesLabel(window)}. ${sharedCount} of ${picks.length} picks connect two or more of them.`;
    must(await db().from("profiles").update({ version: 1, summary }).eq("id", group.id), "group version");
    await db().from("profile_versions").upsert({ profile_id: group.id, version: 1, summary, seeds: [...owners.values()].map((o) => ({ id: o.seedId, name: `${o.member}’s ${o.seedName}` })), item_ids: rows.map((r) => r.entity_id) }, { onConflict: "profile_id,version" });
    await db().from("agent_runs").update({ steps, status: "done", output: { summary }, finished_at: new Date().toISOString() }).eq("id", run.id);
    emit({ t: "done", summary, itemCount: rows.length });
  } catch (err) {
    console.error("group build failed", err);
    await db().from("agent_runs").update({ steps, status: "error", error: String((err as Error).message).slice(0, 500), finished_at: new Date().toISOString() }).eq("id", run.id);
    emit({ t: "error", message: "The group build hit a problem. Please try again." });
  }
}
