/**
 * The baseline for the "Generic AI vs Encore" comparison: the same intake,
 * the same model, no tools and no taste graph. Cached per profile.
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import { db } from "../db";
import { loadProfileBundle, type Profile } from "../profiles";
import { llm, noThinking } from "./llm";

export const GenericPlanSchema = z.object({
  items: z
    .array(
      z.object({
        kind: z.enum(["song", "film_clip", "tv_clip", "place", "food", "book"]),
        title: z.string(),
        creator: z.string().optional().describe("Artist, director or author, if any"),
        year: z.number().int().nullable(),
        prompt: z.string(),
      }),
    )
    .min(4)
    .max(8),
});
export type GenericPlan = z.infer<typeof GenericPlanSchema>;

export async function genericSession(profile: Profile): Promise<GenericPlan> {
  const { data: cached } = await db()
    .from("agent_runs")
    .select("output")
    .eq("profile_id", profile.id)
    .eq("kind", "generic")
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const hit = GenericPlanSchema.safeParse(cached?.output);
  if (hit.success) return hit.data;

  const { seeds, avoid } = await loadProfileBundle(profile.id);
  const loved = seeds.map((s) => s.name ?? s.raw_text).join(", ");
  const { output } = await generateText({
    model: llm(),
    prompt: `Create a 15-20 minute reminiscence session (6 to 8 items: songs, film or TV clips, places, foods) for a person with dementia. ${profile.first_name} was born in ${profile.birth_year} and grew up in ${profile.hometown}. They loved: ${loved}.${avoid.length ? ` Avoid: ${avoid.map((a) => a.raw_text).join(", ")}.` : ""} For each item give the kind, title, creator, year, and a short prompt for the caregiver to say.`,
    output: Output.object({ schema: GenericPlanSchema }),
    abortSignal: AbortSignal.timeout(60_000),
    maxOutputTokens: 4000,
    providerOptions: noThinking,
  });
  await db().from("agent_runs").insert({ profile_id: profile.id, kind: "generic", status: "done", output, finished_at: new Date().toISOString() });
  return output;
}
