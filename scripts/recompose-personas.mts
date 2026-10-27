/**
 * Re-composes the ready-made (unplayed) session for each persona template, keeping the played history.
 *
 *   npx tsx --env-file=.env.local scripts/recompose-personas.mts
 */
import { db } from "../lib/db";
import { composeSession } from "../lib/agent/session";
import type { Profile } from "../lib/profiles";

const { data } = await db().from("profiles").select("*").eq("is_persona_template", true);
for (const p of (data ?? []) as Profile[]) {
  await db().from("sessions").delete().eq("profile_id", p.id).is("started_at", null);
  const { plan } = await composeSession(p);
  console.log(`${p.first_name}: ${plan.title}\n  ${plan.items.map((i) => `${i.kind}:${i.title}`).join(" | ")}`);
}
