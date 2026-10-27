import { z } from "zod";
import { reminiscenceWindow } from "@/lib/era";
import { SEED_KINDS } from "@/lib/domains";
import { qloo } from "@/lib/qloo";
import { rankCandidates } from "@/lib/seeds";

const Body = z.object({
  query: z.string().trim().min(1).max(120),
  kind: z.enum(Object.keys(SEED_KINDS) as [keyof typeof SEED_KINDS, ...(keyof typeof SEED_KINDS)[]]),
  birthYear: z.number().int().optional(),
});

/** Intake disambiguation: top candidates for a "they loved…" chip. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { query, kind, birthYear } = parsed.data;

  try {
    if (kind === "food") {
      const { data } = await qloo.tags(query, { parentType: "urn:entity:place", typoTolerance: true, take: 5 });
      const tag = data.find((t) => t.id.startsWith("urn:tag:genre:place")) ?? data[0];
      return Response.json({ food: { rawText: query, tag: tag ? { id: tag.id, name: tag.name } : null } });
    }

    let window;
    try {
      window = birthYear ? reminiscenceWindow(birthYear) : undefined;
    } catch {
      window = undefined;
    }
    const { data } = await qloo.search(query, { types: [...SEED_KINDS[kind].types], take: 8 });
    const ranked = rankCandidates(data, query, window).slice(0, 3);
    return Response.json({
      candidates: ranked.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        year: e.year ?? null,
        image: e.image ?? null,
        description: e.description ?? null,
      })),
    });
  } catch (e) {
    console.error("resolve failed", e);
    return Response.json({ error: "Couldn't reach the taste graph. Try again in a moment." }, { status: 502 });
  }
}
