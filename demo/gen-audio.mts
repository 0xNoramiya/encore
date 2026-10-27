/**
 * Generates the demo video's audio with ElevenLabs: narration (one file per line),
 * the jazz score, and sound effects. Reads ELEVENLABS_API_KEY from the environment.
 *
 *   npx tsx --env-file=.env.local demo/gen-audio.mts [narration|music|sfx]
 */
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { existsSync, writeFileSync } from "node:fs";

const OUT = "demo/assets/audio";
const client = new ElevenLabsClient();
const NARRATOR = "JBFqnCBsd6RMkjVDRZzb"; // George: warm, narrative

export const NARRATION: Record<string, string> = {
  n01: "Dorothy grew up in Brooklyn. In nineteen fifty-three, Dorothy saw Roman Holiday twice... and sang Sinatra on the front stoop.",
  n02: "Today, Dorothy lives with dementia. And some days, there's no way to ask what still brings joy.",
  n03: "Families are told: play music from their youth. But 'oldies' is a decade... not a person. A playlist has never met Dorothy.",
  n04: "Encore starts with a few memories. A first name. A birth year. A hometown. A few things Dorothy loved. If a title is ambiguous, Encore asks.",
  n05: "Then an agent goes to work on Qloo's taste graph. Music, film, TV, books, and places near home... all from the years Dorothy was ten to thirty. Every step is a real Qloo call you can open.",
  n06: "Dorothy's world. Tony Bennett. Funny Girl. A slice from Joe's Pizza. And every pick says why.",
  n07: "We gave the same story to the same AI, without Qloo. It asked Dorothy to remember, five times out of eight... and mostly repeated what we told it. Encore found seven new things. Every one traceable. Never a quiz.",
  n08: "Session Mode is calm. One thing at a time, big type, a gentle voice. The caregiver taps how Dorothy responds... and if something upsets Dorothy, it stops, and a favourite takes its place.",
  n09: "Then Encore learns. What made Dorothy sing along now steers the taste graph... and the next session finds more like it.",
  n10: "In Roberto's first language. For a whole room of residents. With a report the family and care team can keep.",
  n11: "Encore. When someone can no longer tell you what they love... their taste graph still can.",
};

const SFX: Record<string, { text: string; seconds: number; loop?: boolean }> = {
  static: { text: "Old analog television white noise static burst, harsh hiss, CRT", seconds: 2.5 },
  click: { text: "Vintage television knob click, old TV switching on, single mechanical clunk", seconds: 0.8 },
  projector: { text: "Old 8mm film projector running, steady mechanical whirring and clicking", seconds: 10, loop: true },
  crackle: { text: "Warm vinyl record surface crackle and soft pops, no music", seconds: 10, loop: true },
  needle: { text: "Record player needle dropping onto a vinyl record, soft thump then crackle", seconds: 2 },
};

async function save(name: string, audio: ReadableStream<Uint8Array>) {
  writeFileSync(`${OUT}/${name}.mp3`, Buffer.from(await new Response(audio).arrayBuffer()));
  console.log("wrote", name);
}

const which = process.argv[2] ?? "all";

if (which === "all" || which === "narration") {
  for (const [id, text] of Object.entries(NARRATION)) {
    if (existsSync(`${OUT}/${id}.mp3`)) continue;
    await save(id, await client.textToSpeech.convert(NARRATOR, { text, modelId: "eleven_v4", languageCode: "en", outputFormat: "mp3_44100_128", voiceSettings: { stability: 0.55, similarityBoost: 0.75 } }));
  }
}

if (which === "all" || which === "sfx") {
  for (const [id, s] of Object.entries(SFX)) {
    if (existsSync(`${OUT}/sfx-${id}.mp3`)) continue;
    await save(`sfx-${id}`, await client.textToSoundEffects.convert({ text: s.text, durationSeconds: s.seconds, loop: s.loop, promptInfluence: 0.6 }));
  }
}

if (which === "all" || which === "music") {
  if (!existsSync(`${OUT}/jazz.mp3`)) {
    await save(
      "jazz",
      await client.music.compose({
        prompt:
          "Instrumental 1950s jazz trio for a warm, nostalgic short documentary. Brushed snare drums, walking upright bass, piano comping, and a muted trumpet carrying a tender, singable melody. Opens intimate and smoky like a small Brooklyn jazz club at night, settles into a gentle mid-tempo swing that sits under narration, lifts with the trumpet near the end, and resolves on a soft final piano chord. Warm, vintage, analog, unhurried, hopeful. No vocals.",
        musicLengthMs: 172000,
        modelId: "music_v2_5",
        forceInstrumental: true,
      }),
    );
  }
}
