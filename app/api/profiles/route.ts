import { z } from "zod";
import { db, must } from "@/lib/db";
import { getWorkspaceId } from "@/lib/workspace";
import { allow } from "@/lib/rate-limit";

const Seed = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("entity"),
    rawText: z.string().max(120),
    entityId: z.string().max(64),
    entityType: z.string().startsWith("urn:entity:"),
    name: z.string().max(200),
    year: z.number().int().nullable(),
    image: z.string().url().nullable(),
  }),
  z.object({ kind: z.literal("food"), rawText: z.string().min(1).max(120), tagId: z.string().nullable() }),
]);

const Body = z.object({
  firstName: z.string().trim().min(1).max(40),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear() - 40),
  hometown: z.object({
    label: z.string().min(1).max(200),
    localityId: z.string().max(64).nullable(),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
  }),
  filmCountry: z.string().trim().max(60).nullable(),
  languages: z.array(z.string().trim().min(1).max(40)).max(6),
  seeds: z.array(Seed).min(1).max(8),
  avoid: z.array(z.string().trim().min(1).max(120)).max(10),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Please check the form", issues: parsed.error.issues }, { status: 400 });
  const workspaceId = await getWorkspaceId();
  if (!(await allow(`profiles:${workspaceId}`, 20, 3600))) {
    return Response.json({ error: "That's a lot of profiles for one hour. Please try again later." }, { status: 429 });
  }
  const b = parsed.data;
  if (!b.seeds.some((s) => s.kind === "entity")) {
    return Response.json({ error: "Add at least one singer, film, show or book" }, { status: 400 });
  }

  const profile = must(
    await db()
      .from("profiles")
      .insert({
        workspace_id: workspaceId,
        first_name: b.firstName,
        birth_year: b.birthYear,
        hometown: b.hometown.label,
        locality_id: b.hometown.localityId,
        lat: b.hometown.lat,
        lon: b.hometown.lon,
        film_country: b.filmCountry,
        country_name: b.filmCountry,
        languages: b.languages,
      })
      .select("id")
      .single(),
    "insert profile",
  ) as { id: string };

  const seedRows = b.seeds.map((s) =>
    s.kind === "entity"
      ? { profile_id: profile.id, kind: "entity", raw_text: s.rawText, entity_id: s.entityId, entity_type: s.entityType, name: s.name, year: s.year, image: s.image, confirmed: true }
      : { profile_id: profile.id, kind: "food", raw_text: s.rawText, tag_id: s.tagId, name: s.rawText, confirmed: true },
  );
  must(await db().from("seeds").insert(seedRows), "insert seeds");
  if (b.avoid.length) {
    must(await db().from("avoid_items").insert(b.avoid.map((raw_text) => ({ profile_id: profile.id, raw_text, source: "caregiver" }))), "insert avoid");
  }
  return Response.json({ id: profile.id });
}
