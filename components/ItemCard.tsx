"use client";

import { useState } from "react";
import type { Domain } from "@/lib/domains";
import type { ProfileItem } from "@/lib/profiles";
import { Provenance } from "./Provenance";

const SHAPE: Record<Domain, string> = {
  music: "aspect-square",
  film: "aspect-[2/3]",
  tv: "aspect-[2/3]",
  book: "aspect-[2/3]",
  food: "aspect-[4/3]",
  place: "aspect-[4/3]",
};

function Cover({ item }: { item: ProfileItem }) {
  const src = item.media?.image ?? item.data.image;
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={`${SHAPE[item.domain]} w-full rounded-md bg-rule object-cover`} />;
  }
  return (
    <div className={`${SHAPE[item.domain]} flex w-full items-end rounded-md bg-ink p-3`} aria-hidden>
      <span className="font-display text-xl leading-tight text-paper">{item.name}</span>
    </div>
  );
}

export function ItemCard({ item, firstName, lead }: { item: ProfileItem; firstName: string; lead?: string }) {
  const [listening, setListening] = useState(false);
  const m = item.media ?? {};
  const isSeed = item.status === "promoted" && item.added_in_version <= 1 && !item.why.length;
  const showYear = item.year && item.domain !== "music";

  return (
    <article className="flex flex-col gap-2.5">
      <div className="relative">
        <Cover item={item} />
        {isSeed && <span className="absolute left-2 top-2 rounded-full bg-paper/95 px-2 py-0.5 text-xs font-bold text-accent">You told us</span>}
      </div>
      <div>
        <h3 className="font-display text-lg leading-snug text-ink">
          {item.name}
          {showYear ? <span className="ml-1.5 font-sans text-sm font-normal text-muted">{item.year}</span> : null}
        </h3>
        {m.song && <p className="text-sm text-muted">Try “{m.song}”</p>}
        {item.reason && !isSeed && <p className="mt-1 text-sm text-ink/85">{item.reason}</p>}
      </div>
      <Provenance why={item.why} firstName={firstName} compact lead={lead} />
      <div className="-my-1 flex flex-wrap gap-x-4 text-sm font-bold [&>*]:inline-flex [&>*]:min-h-11 [&>*]:items-center">
        {m.spotifyEmbed && (
          <button type="button" onClick={() => setListening((v) => !v)} className="text-accent underline-offset-4 hover:underline" aria-expanded={listening}>
            {listening ? "Hide player" : "Listen"}
          </button>
        )}
        {m.youtubeId ? (
          <a className="text-accent underline-offset-4 hover:underline" href={`https://www.youtube.com/watch?v=${m.youtubeId}`} target="_blank" rel="noreferrer">
            Watch
          </a>
        ) : m.youtubeSearch ? (
          <a className="text-accent underline-offset-4 hover:underline" href={m.youtubeSearch} target="_blank" rel="noreferrer">
            Find on YouTube
          </a>
        ) : null}
        {m.mapsUrl && (
          <a className="text-accent underline-offset-4 hover:underline" href={m.mapsUrl} target="_blank" rel="noreferrer">
            Map
          </a>
        )}
      </div>
      {listening && m.spotifyEmbed && (
        <iframe
          title={`${item.name} on Spotify`}
          src={m.spotifyEmbed}
          className="h-[152px] w-full rounded-xl"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      )}
    </article>
  );
}
