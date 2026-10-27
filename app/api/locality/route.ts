import { filmCountryName } from "@/lib/domains";
import { qloo } from "@/lib/qloo";

/** Hometown lookup: Qloo locality entities (used as filter.location for places). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length > 100) return Response.json({ localities: [] });
  try {
    const { data } = await qloo.search(q, { types: "urn:entity:locality", take: 5 });
    return Response.json({
      localities: data.slice(0, 4).map((e) => {
        const ancestors = e.ancestors ?? [];
        const country = ancestors.find((a) => a.place === "country")?.name;
        const city = ancestors.find((a) => a.place === "city")?.name;
        const region = ancestors.find((a) => a.adminLevel === 4)?.name;
        const parts = [e.name, city, region, filmCountryName(country)].filter((x): x is string => Boolean(x));
        return {
          id: e.id,
          name: e.name,
          label: [...new Set(parts)].join(", "),
          filmCountry: filmCountryName(country) ?? null,
          lat: e.location?.lat ?? null,
          lon: e.location?.lon ?? null,
        };
      }),
    });
  } catch (e) {
    console.error("locality failed", e);
    return Response.json({ error: "Couldn't look that place up right now." }, { status: 502 });
  }
}
