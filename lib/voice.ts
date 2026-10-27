/**
 * "Read it aloud" for Session Mode: an ElevenLabs voice reads the caregiver
 * prompt, in the person's language when the plan has one. Audio is generated
 * once per (voice, model, language, text) and kept in a private Supabase
 * Storage bucket, so replays and copied example sessions cost nothing.
 * The SDK reads ELEVENLABS_API_KEY from the environment.
 */
import { createHash } from "node:crypto";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { db } from "./db";

// Sarah: soft, warm and unhurried, which suits older listeners.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL";
const MODEL_ID = "eleven_v4";
const BUCKET = "voice";

let client: ElevenLabsClient | undefined;

export function voiceEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export function voiceKey(text: string, languageCode: string): string {
  return `${createHash("sha256").update(`${VOICE_ID}|${MODEL_ID}|${languageCode}|${text}`).digest("hex")}.mp3`;
}

/** MP3 bytes for a prompt, from the cache when possible. `cached` says whether ElevenLabs was called. */
export async function promptAudio(text: string, languageCode: string): Promise<{ audio: ArrayBuffer; cached: boolean }> {
  const key = voiceKey(text, languageCode);
  const hit = await db().storage.from(BUCKET).download(key);
  if (hit.data) return { audio: await hit.data.arrayBuffer(), cached: true };

  client ??= new ElevenLabsClient();
  const stream = await client.textToSpeech.convert(VOICE_ID, {
    text,
    modelId: MODEL_ID,
    languageCode,
    outputFormat: "mp3_44100_64",
    // Steady and close to the reference voice: calm, predictable delivery.
    voiceSettings: { stability: 0.65, similarityBoost: 0.75 },
  });
  const audio = await new Response(stream).arrayBuffer();
  const { error } = await db().storage.from(BUCKET).upload(key, audio, { contentType: "audio/mpeg", upsert: true });
  if (error) console.warn("voice cache write failed", error.message);
  return { audio, cached: false };
}
