/**
 * Exports the app's own read-aloud audio for the recorded sessions (same voice,
 * settings and cache as Session Mode), so the edit can play what the tablet said.
 *
 *   npx tsx --env-file=.env.local demo/voice-clips.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { db } from "../lib/db";
import { langCode } from "../lib/languages";
import type { SessionPlan } from "../lib/session";
import { promptAudio } from "../lib/voice";

const REC = "demo/assets/rec";
async function plan(sid: string): Promise<SessionPlan> {
  const { data } = await db().from("sessions").select("plan").eq("id", sid).single();
  return data!.plan as SessionPlan;
}

const dorothy = await plan(JSON.parse(readFileSync(`${REC}/session-state.json`, "utf8")).sid);
const en = await promptAudio(dorothy.items[0].prompt, "en");
writeFileSync("demo/assets/audio/app-en.mp3", Buffer.from(en.audio));
console.log("app-en:", dorothy.items[0].title, "|", dorothy.items[0].prompt, en.cached ? "(cached)" : "(new)");

const roberto = await plan(readFileSync(`${REC}/spanish-sid.txt`, "utf8").trim());
const alt = roberto.items[0].promptAlt!;
const es = await promptAudio(alt.text, langCode(alt.lang) ?? "es");
writeFileSync("demo/assets/audio/app-es.mp3", Buffer.from(es.audio));
console.log("app-es:", roberto.items[0].title, "|", alt.text, es.cached ? "(cached)" : "(new)");
