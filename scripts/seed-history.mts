/**
 * Gives each persona template a short played history so the engagement report
 * and the v1 → v3 learning story have something to show. Sessions are composed
 * and learned from by the real pipeline; only the caregiver taps are scripted,
 * and the sessions are flagged is_example (the UI labels them).
 *
 *   npx tsx --env-file=.env.local scripts/seed-history.mts [personaKey]
 */
import { db, must } from "../lib/db";
import { runLearn } from "../lib/agent/learn";
import { composeSession } from "../lib/agent/session";
import type { Reaction } from "../lib/learning";
import type { Profile, ProfileItem } from "../lib/profiles";
import type { SessionItem } from "../lib/session";
import type { SessionRow } from "../lib/sessions";

const DAY = 86_400_000;

function scriptTaps(items: SessionItem[], round: number, seeds: Set<string>): Reaction[] {
  let upsetUsed = round > 1;
  let songs = 0;
  return items.map((i) => {
    if (i.kind === "song") return songs++ === 0 || round > 1 ? "sang_along" : songs % 2 ? "lit_up" : "neutral";
    if ((i.kind === "tv_clip" || i.kind === "film_clip") && !upsetUsed && !seeds.has(i.entityId)) {
      upsetUsed = true;
      return "upset";
    }
    if (i.kind === "film_clip" || i.kind === "food") return "lit_up";
    if (i.kind === "place") return round > 1 ? "lit_up" : "neutral";
    return "neutral";
  });
}

async function playRound(profileId: string, round: number, daysAgo: number) {
  const profile = must(await db().from("profiles").select("*").eq("id", profileId).single(), "profile") as Profile;
  const items = must(await db().from("profile_items").select("entity_id,status,why").eq("profile_id", profileId), "items") as Pick<ProfileItem, "entity_id" | "status" | "why">[];
  const seeds = new Set(items.filter((i) => i.status === "promoted" && !i.why.length).map((i) => i.entity_id));

  const { sessionId, plan } = await composeSession(profile);
  const start = Date.now() - daysAgo * DAY;
  const taps = scriptTaps(plan.items, round, seeds);
  must(
    await db()
      .from("reactions")
      .insert(plan.items.map((i, n) => ({ session_id: sessionId, profile_id: profileId, entity_id: i.entityId, reaction: taps[n], created_at: new Date(start + (n + 1) * 2 * 60_000).toISOString() }))),
    "taps",
  );
  must(await db().from("sessions").update({ is_example: true, started_at: new Date(start).toISOString(), created_at: new Date(start - 30 * 60_000).toISOString() }).eq("id", sessionId), "start");
  const session = must(await db().from("sessions").select("*").eq("id", sessionId).single(), "session") as SessionRow;

  await runLearn(session, profile, (e) => {
    if (e.t === "learned") console.log(`    learned: ${e.learned.narrative.slice(0, 140)}…`);
    if (e.t === "error") console.log(`    ERROR ${e.message}`);
  });
  const minutes = 14 + round * 2;
  await db().from("sessions").update({ ended_at: new Date(start + minutes * 60_000).toISOString() }).eq("id", sessionId);
  console.log(`  round ${round}: ${plan.title} (${plan.items.map((i, n) => `${i.title}=${taps[n]}`).join(", ")})`);
}

const only = process.argv[2];
const { data: templates } = await db().from("profiles").select("*").eq("is_persona_template", true);
for (const t of (templates ?? []) as Profile[]) {
  if (only && t.persona_key !== only) continue;
  console.log(`=== ${t.first_name}`);
  await db().from("sessions").delete().eq("profile_id", t.id);
  await playRound(t.id, 1, 3);
  await playRound(t.id, 2, 1);
  const fresh = must(await db().from("profiles").select("*").eq("id", t.id).single(), "fresh") as Profile;
  const { plan } = await composeSession(fresh);
  console.log(`  ready: ${plan.title}, profile v${fresh.version}`);
}
