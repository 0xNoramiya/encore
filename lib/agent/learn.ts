/**
 * After a session: apply reactions deterministically (lib/learning.ts), have
 * the model explain what changed, then expand the profile (v → v+1) from the
 * newly promoted seeds while the caregiver watches.
 */
import { generateText } from "ai";
import { db, must } from "../db";
import { applyReactions, describeLearning, latestReactions, type LearnItem, type LearnResult, type Reaction } from "../learning";
import type { AgentStep, Profile, ProfileItem } from "../profiles";
import type { Learned, SessionRow } from "../sessions";
import type { AgentEvent } from "./events";
import { llm, noThinking } from "./llm";
import { runProfileAgent } from "./profile";

const REACTION_WORDS: Record<Reaction, string> = { sang_along: "sang or talked along", lit_up: "lit up", neutral: "was neutral", upset: "was upset" };

export async function narrate(profile: Profile, r: LearnResult): Promise<string> {
  if (!r.liked.length && !r.excluded.length && !r.neutral.length) return describeLearning(profile.first_name, r);
  const facts = [
    ...r.liked.map((l) => `${l.name}: ${profile.first_name} ${REACTION_WORDS[l.reaction]}`),
    ...r.neutral.map((n) => `${n.name}: neutral`),
    ...r.excluded.map((e) => `${e.name}: upset, now excluded for good`),
    ...r.promoted.map((p) => `${p.name}: promoted into the Qloo signal for the next expansion`),
    ...r.excludeTags.map((t) => `tag "${t.name}" now excluded because of ${t.because}`),
  ].join("\n");
  try {
    const { text } = await generateText({
      model: llm(),
      system: `You write the "What I learned" note a caregiver reads after a reminiscence session. 2-4 short sentences in the first person, as Encore. Say what you noticed and what you will do differently, e.g. "${profile.first_name} sang along to Ella Fitzgerald, so I'm leaning into jazz vocalists." Only use the facts given. Refer to ${profile.first_name} by name every time: never use she, he, her, him, his or hers (we don't know ${profile.first_name}'s pronouns). Plain text, no lists, no markdown.`,
      prompt: facts,
      maxOutputTokens: 1200,
      providerOptions: noThinking,
      abortSignal: AbortSignal.timeout(30_000),
    });
    const note = text.trim();
    // Pronouns are never collected, so a gendered note falls back to the plain, name-only summary.
    if (!note || /\b(she|he|her|him|his|hers)\b/i.test(note)) return describeLearning(profile.first_name, r);
    return note;
  } catch (e) {
    console.warn("learning narrative failed, using the plain summary", (e as Error).message);
    return describeLearning(profile.first_name, r);
  }
}

export async function runLearn(session: SessionRow, profile: Profile, emit: (e: AgentEvent) => void): Promise<void> {
  if (session.learned) {
    emit({ t: "learned", learned: session.learned });
    emit({ t: "done", summary: null, itemCount: 0 });
    return;
  }

  const step = (s: AgentStep) => emit({ t: "step", step: s });
  const rows = must(await db().from("reactions").select("entity_id,reaction,created_at").eq("session_id", session.id), "reactions") as {
    entity_id: string;
    reaction: Reaction;
    created_at: string;
  }[];
  const reactions = latestReactions(rows.map((r) => ({ entityId: r.entity_id, reaction: r.reaction, createdAt: r.created_at })));
  const items = must(await db().from("profile_items").select("*").eq("profile_id", profile.id), "items") as ProfileItem[];
  const learnItems: LearnItem[] = items.map((i) => ({ entityId: i.entity_id, name: i.name, domain: i.domain, weight: i.weight, status: i.status, tags: i.data.tags ?? [] }));

  step({ id: "apply", kind: "deterministic", tool: "apply_reactions", label: `Applying ${reactions.size} reactions`, status: "running" });
  const result = applyReactions(learnItems, reactions);
  await Promise.all(result.updates.map((u) => db().from("profile_items").update({ weight: u.weight, status: u.status }).eq("profile_id", profile.id).eq("entity_id", u.entityId)));
  const avoidRows = [
    ...result.excluded.map((e) => ({ profile_id: profile.id, raw_text: e.name, entity_id: e.entityId, source: "learned" })),
    ...result.excludeTags.map((t) => ({ profile_id: profile.id, raw_text: t.name, tag_id: t.id, source: "learned" })),
  ];
  if (avoidRows.length) must(await db().from("avoid_items").insert(avoidRows), "learned avoid");
  step({
    id: "apply",
    kind: "deterministic",
    tool: "apply_reactions",
    label: `Applied ${reactions.size} reactions`,
    status: "done",
    summary:
      [
        result.promoted.length && `${result.promoted.length} promoted into the signal`,
        result.excluded.length && `${result.excluded.length} excluded for good`,
        result.excludeTags.length && `${result.excludeTags.map((t) => t.name).join(", ")} tag excluded`,
      ]
        .filter(Boolean)
        .join(" · ") || "no strong signals",
  });

  step({ id: "narrate", kind: "tool", tool: "explain_learning", label: "Writing what I learned", status: "running" });
  const narrative = await narrate(profile, result);
  step({ id: "narrate", kind: "tool", tool: "explain_learning", label: "Wrote what I learned", status: "done" });

  // Group profiles learn weights and exclusions but don't re-expand (their signal comes from the residents).
  const changed = profile.kind !== "group" && (result.promoted.length > 0 || result.excluded.length > 0);
  const learned: Learned = {
    narrative,
    promoted: result.promoted,
    excluded: result.excluded,
    excludeTags: result.excludeTags,
    liked: result.liked,
    neutral: result.neutral,
    fromVersion: profile.version,
    toVersion: changed ? profile.version + 1 : profile.version,
  };
  emit({ t: "learned", learned });
  must(await db().from("sessions").update({ learned, ended_at: new Date().toISOString(), started_at: session.started_at ?? new Date().toISOString() }).eq("id", session.id), "save learned");

  if (changed) {
    const fresh = must(await db().from("profiles").select("*").eq("id", profile.id).single(), "profile") as Profile;
    await runProfileAgent(fresh, {
      mode: "expand",
      emit: (e) => {
        if (e.t === "step" || e.t === "thought") emit(e);
        if (e.t === "error") emit(e);
      },
    });
  }
  emit({ t: "done", summary: null, itemCount: 0 });
}
