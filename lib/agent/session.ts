/**
 * Session composer: the model picks and orders 6-8 profile items and writes
 * caregiver prompts (structured output); finalizePlan() enforces that every
 * item is a real, non-excluded profile item and that prompts never test memory.
 */
import { generateText, Output } from "ai";
import { db, must } from "../db";
import { decadesLabel, reminiscenceWindow } from "../era";
import { loadProfileBundle, type AgentStep, type Profile, type ProfileItem } from "../profiles";
import { finalizePlan, ModelPlanSchema, type ModelPlan, type SessionPlan } from "../session";
import { llm, noThinking } from "./llm";

interface History {
  plays: Map<string, number>;
  last: Map<string, string>;
}

async function loadHistory(profileId: string): Promise<History> {
  const sessions = must(await db().from("sessions").select("id,plan,started_at").eq("profile_id", profileId).not("started_at", "is", null), "sessions") as {
    id: string;
    plan: SessionPlan;
  }[];
  const plays = new Map<string, number>();
  for (const s of sessions) for (const i of s.plan.items) plays.set(i.entityId, (plays.get(i.entityId) ?? 0) + 1);
  const last = new Map<string, string>();
  if (sessions.length) {
    const rows = must(
      await db().from("reactions").select("entity_id,reaction,created_at").eq("profile_id", profileId).order("created_at"),
      "reactions",
    ) as { entity_id: string; reaction: string }[];
    for (const r of rows) last.set(r.entity_id, r.reaction);
  }
  return { plays, last };
}

function itemLine(i: ProfileItem, h: History): string {
  const bits = [`[${i.domain}] ${i.name}${i.year && i.domain !== "music" ? ` ${i.year}` : ""} (id=${i.entity_id})`, `weight ${i.weight}`];
  if (i.status === "promoted") bits.push(i.why.length ? "promoted after a good reaction" : "one of the seeds");
  if (i.data.notableSongs?.length) bits.push(`songs: ${i.data.notableSongs.slice(0, 5).join(" | ")}`);
  if (i.data.tags?.length) bits.push(`tags: ${i.data.tags.slice(0, 4).map((t) => t.name).join(", ")}`);
  if (i.data.address) bits.push(`address: ${i.data.address}`);
  const plays = h.plays.get(i.entity_id);
  if (plays) bits.push(`played ${plays}x, last reaction: ${h.last.get(i.entity_id) ?? "none"}`);
  return `- ${bits.join("; ")}`;
}

export function sessionSystemPrompt(profile: Profile, items: ProfileItem[], h: History): string {
  const w = reminiscenceWindow(profile.birth_year);
  return `You compose a 15-20 minute reminiscence session for ${profile.first_name}, born ${profile.birth_year}, who grew up in ${profile.hometown} (${decadesLabel(w)}). A caregiver plays it on a tablet, one item at a time, and taps how ${profile.first_name} reacts.

Profile items (choose only from these entityIds):
${items.map((i) => itemLine(i, h)).join("\n")}

Rules:
- 6 to 8 items. Arc: a warm opener (the best-liked song, or a seed song), variety in the middle (film or TV clips, a place, a food memory, more songs; never two clips back to back), and a calm, gentle closing song.
- At least 2 songs. Include one food item and one place when available.
- Use at most 2 seed items ("one of the seeds"), ideally one as the warm opener. Everything else should be Encore's discoveries: that is the point of the session.
- Prefer items with positive weight. Use at most 2 items played before unless they got lit_up or sang_along.
- prompt: what the caregiver says aloud. 1-3 short sentences, one idea each. Recognition, not recall: name the item first ("This is Ella Fitzgerald."), then invite ("Shall we listen?") or offer an easy either/or ("Do you like the fast ones or the slow ones?").
- NEVER ask ${profile.first_name} to remember anything, never quiz (no "do you remember", "who is this", "what year"), never correct.
- Food prompts are sensory ("Imagine the smell of pizza fresh from the oven.") and never suggest eating anything.
- For music items, set song to one title from that artist's listed songs.
- Use ${profile.first_name}'s name or "you"; no other pronouns.
- title: short and warm, no colon. intro: one or two sentences telling the caregiver the shape of today's session.`;
}

export async function composeSession(profile: Profile): Promise<{ sessionId: string; plan: SessionPlan; steps: AgentStep[] }> {
  const steps: AgentStep[] = [];
  const { items } = await loadProfileBundle(profile.id);
  const usable = items.filter((i) => i.status !== "excluded");
  if (!usable.length) throw new Error("Profile has no items yet");
  const history = await loadHistory(profile.id);
  steps.push({
    id: "load",
    kind: "deterministic",
    tool: "get_profile",
    label: `Loaded ${profile.first_name}’s Taste Profile v${profile.version}`,
    status: "done",
    summary: `${usable.length} items to choose from, ${items.length - usable.length} excluded`,
  });

  const t0 = Date.now();
  let model: ModelPlan | null = null;
  try {
    const { output } = await generateText({
      model: llm(),
      system: sessionSystemPrompt(profile, usable, history),
      prompt: `Compose today's session for ${profile.first_name}.`,
      output: Output.object({ schema: ModelPlanSchema }),
      abortSignal: AbortSignal.timeout(90_000),
      maxOutputTokens: 6000,
      providerOptions: noThinking,
    });
    model = output;
    steps.push({ id: "compose", kind: "tool", tool: "compose_session", label: "Composed the arc and wrote caregiver prompts", status: "done", summary: model.title, ms: Date.now() - t0 });
  } catch (e) {
    console.error("session composer failed, using fallback", e);
    steps.push({ id: "compose", kind: "tool", tool: "compose_session", label: "Composer unavailable, used the built-in arc", status: "error", ms: Date.now() - t0 });
  }

  const { plan, dropped } = finalizePlan(model, items, profile.hometown.split(",")[0], profile.first_name);
  steps.push({
    id: "validate",
    kind: "deterministic",
    tool: "validate_session",
    label: "Checked every item against the profile and the clinical prompt rules",
    status: "done",
    summary: `${plan.items.length} items, about ${Math.round(plan.items.reduce((n, i) => n + i.durationSec, 0) / 60)} minutes${dropped.length ? `, rejected ${dropped.length} unknown or excluded picks` : ""}`,
  });

  const session = must(
    await db().from("sessions").insert({ profile_id: profile.id, profile_version: profile.version, plan }).select("id").single(),
    "insert session",
  ) as { id: string };
  await db().from("agent_runs").insert({ profile_id: profile.id, kind: "session", status: "done", steps, output: { sessionId: session.id }, finished_at: new Date().toISOString() });
  return { sessionId: session.id, plan, steps };
}
