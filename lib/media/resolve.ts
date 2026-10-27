/**
 * Media for profile items. We never host audio/video: Spotify artist embeds,
 * YouTube (by ID when YOUTUBE_API_KEY is set, else a search link), TMDB posters
 * and trailers when TMDB_API_KEY is set, Qloo images otherwise, and plain
 * Google Maps links for places. Lookups are cached in media_cache.
 */
import { db } from "../db";
import type { Domain } from "../domains";
import type { Media } from "../profiles";

async function cached<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
  const { data } = await db().from("media_cache").select("payload").eq("key", key).maybeSingle();
  if (data) return data.payload as T | null;
  const value = await load().catch((e) => {
    console.warn(`media lookup failed (${key})`, (e as Error).message);
    return undefined;
  });
  // Cache misses too (as null) so quota isn't burned retrying; transient errors aren't cached.
  if (value !== undefined) await db().from("media_cache").upsert({ key, payload: value });
  return value ?? null;
}

const ytSearchUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

async function youtubeId(query: string): Promise<string | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  return cached(`yt:${query.toLowerCase()}`, async () => {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=1&q=${encodeURIComponent(query)}&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`YouTube ${res.status}`);
    const body = (await res.json()) as { items?: { id?: { videoId?: string } }[] };
    return body.items?.[0]?.id?.videoId ?? null;
  });
}

interface TmdbResult {
  poster: string | null;
  trailer: string | null;
}

async function tmdb(imdbId: string, kind: "movie" | "tv"): Promise<TmdbResult | null> {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  return cached(`tmdb:${imdbId}`, async () => {
    const auth = key.length > 40 ? { headers: { Authorization: `Bearer ${key}` } } : {};
    const q = key.length > 40 ? "" : `&api_key=${key}`;
    const find = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id${q}`, { ...auth, signal: AbortSignal.timeout(8000) });
    if (!find.ok) throw new Error(`TMDB ${find.status}`);
    const found = (await find.json()) as Record<string, { id: number; poster_path?: string }[]>;
    const hit = (kind === "movie" ? found.movie_results : found.tv_results)?.[0];
    if (!hit) return { poster: null, trailer: null };
    const vids = await fetch(`https://api.themoviedb.org/3/${kind}/${hit.id}/videos?${q.slice(1)}`, { ...auth, signal: AbortSignal.timeout(8000) });
    const list = vids.ok ? ((await vids.json()) as { results?: { site: string; type: string; key: string }[] }).results ?? [] : [];
    const yt = list.filter((v) => v.site === "YouTube");
    const trailer = (yt.find((v) => v.type === "Trailer") ?? yt.find((v) => v.type === "Clip") ?? yt[0])?.key ?? null;
    return { poster: hit.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : null, trailer };
  });
}

export interface MediaInput {
  domain: Domain;
  name: string;
  year: number | null;
  data: { image?: string; notableSongs?: string[]; address?: string; external?: Record<string, string> };
}

export async function resolveMedia(item: MediaInput): Promise<Media> {
  const { domain, name, year, data } = item;
  const ext = data.external ?? {};
  const media: Media = { image: data.image };

  if (domain === "music") {
    const song = data.notableSongs?.[0];
    if (ext.spotify) media.spotifyEmbed = `https://open.spotify.com/embed/artist/${ext.spotify}`;
    const q = song ? `${name} ${song}` : `${name} songs`;
    media.song = song;
    media.youtubeSearch = ytSearchUrl(q);
    media.youtubeId = (await youtubeId(q)) ?? undefined;
  } else if (domain === "film" || domain === "tv") {
    const label = `${name}${year ? ` ${year}` : ""} ${domain === "film" ? "trailer" : "opening"}`;
    media.trailerQuery = label;
    media.youtubeSearch = ytSearchUrl(label);
    const t = ext.imdb ? await tmdb(ext.imdb, domain === "film" ? "movie" : "tv") : null;
    if (t?.poster) media.image = t.poster;
    media.youtubeId = t?.trailer ?? (await youtubeId(label)) ?? undefined;
  } else if (domain === "food" || domain === "place") {
    media.address = data.address;
    media.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, data.address].filter(Boolean).join(", "))}`;
  }
  return media;
}
