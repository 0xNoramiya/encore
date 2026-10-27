"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Reaction } from "@/lib/learning";
import type { SessionItem, SessionPlan } from "@/lib/session";

const REACTION_BUTTONS: { value: Reaction; label: string }[] = [
  { value: "lit_up", label: "Lit up" },
  { value: "sang_along", label: "Sang or talked along" },
  { value: "neutral", label: "Neutral" },
  { value: "upset", label: "Upset" },
];

const KIND_WORD: Record<SessionItem["kind"], string> = { song: "Music", film_clip: "Film", tv_clip: "Television", place: "A place from home", food: "A taste of home", book: "A book" };
const RANK: Record<Reaction, number> = { sang_along: 3, lit_up: 2, neutral: 1, upset: 0 };

type Phase = "item" | "upset" | "paused" | "end";

interface SpotifyController {
  togglePlay(): void;
  pause(): void;
  destroy(): void;
  addListener(e: string, cb: (ev: { data: { isPaused: boolean } }) => void): void;
}
interface SpotifyIFrameAPI {
  createController(el: HTMLElement, opts: { uri: string; width: string; height: number }, cb: (c: SpotifyController) => void): void;
}
declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIFrameAPI) => void;
    __spotifyApi?: SpotifyIFrameAPI;
  }
}

function loadSpotifyApi(): Promise<SpotifyIFrameAPI> {
  if (window.__spotifyApi) return Promise.resolve(window.__spotifyApi);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Spotify API timeout")), 6000);
    window.onSpotifyIframeApiReady = (api) => {
      clearTimeout(timer);
      window.__spotifyApi = api;
      resolve(api);
    };
    if (!document.querySelector('script[src*="embed/iframe-api"]')) {
      const s = document.createElement("script");
      s.src = "https://open.spotify.com/embed/iframe-api/v1";
      s.async = true;
      document.body.appendChild(s);
    }
  });
}

/** Spotify artist player with our own large play button (falls back to the plain embed). */
function SpotifyPlayer({ embedUrl, title }: { embedUrl: string; title: string }) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<SpotifyController | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const artistId = embedUrl.split("/").pop();

  useEffect(() => {
    let cancelled = false;
    loadSpotifyApi()
      .then((api) => {
        if (cancelled || !host.current) return;
        const el = document.createElement("div");
        host.current.appendChild(el);
        api.createController(el, { uri: `spotify:artist:${artistId}`, width: "100%", height: 152 }, (c) => {
          if (cancelled) return c.destroy();
          controller.current = c;
          c.addListener("playback_update", (e) => setPlaying(!e.data.isPaused));
          c.addListener("ready", () => setReady(true));
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      controller.current?.destroy();
      controller.current = null;
    };
  }, [artistId]);

  if (failed) {
    return <iframe title={`${title} on Spotify`} src={embedUrl} className="h-[152px] w-full rounded-xl" allow="autoplay; encrypted-media; fullscreen" />;
  }
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => controller.current?.togglePlay()}
        disabled={!ready}
        className="flex min-h-20 items-center justify-center gap-4 rounded-full bg-accent px-10 text-3xl font-bold text-paper disabled:opacity-50"
      >
        <span aria-hidden className="text-2xl">
          {playing ? "❚❚" : "▶"}
        </span>
        {ready ? (playing ? "Pause" : "Play") : "Getting the music ready…"}
      </button>
      <div ref={host} className="overflow-hidden rounded-xl" />
    </div>
  );
}

function YouTubePlayer({ id, title }: { id: string; title: string }) {
  const [on, setOn] = useState(false);
  if (!on) {
    return (
      <button type="button" onClick={() => setOn(true)} className="flex min-h-20 items-center justify-center gap-4 rounded-full bg-accent px-10 text-3xl font-bold text-paper">
        <span aria-hidden className="text-2xl">
          ▶
        </span>
        Play
      </button>
    );
  }
  return (
    <iframe
      title={title}
      src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
      className="aspect-video w-full rounded-xl"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  );
}

function Media({ item }: { item: SessionItem }) {
  const m = item.media;
  if (m.youtubeId) return <YouTubePlayer id={m.youtubeId} title={item.title} />;
  if (item.kind === "song" && m.spotifyEmbed) {
    return (
      <div className="flex flex-col gap-3">
        <SpotifyPlayer embedUrl={m.spotifyEmbed} title={item.title} />
        {m.song && m.youtubeSearch && (
          <a href={m.youtubeSearch} target="_blank" rel="noreferrer" className="text-center text-xl font-bold text-accent underline underline-offset-4">
            Find “{m.song}” on YouTube
          </a>
        )}
      </div>
    );
  }
  if (m.youtubeSearch) {
    return (
      <a href={m.youtubeSearch} target="_blank" rel="noreferrer" className="flex min-h-20 items-center justify-center gap-4 rounded-full bg-accent px-10 text-3xl font-bold text-paper">
        <span aria-hidden className="text-2xl">
          ▶
        </span>
        {item.kind === "song" ? "Play on YouTube" : "Watch on YouTube"}
      </a>
    );
  }
  if (m.mapsUrl) {
    return (
      <a href={m.mapsUrl} target="_blank" rel="noreferrer" className="flex min-h-20 items-center justify-center rounded-full border-2 border-ink px-10 text-2xl font-bold text-ink">
        Look at it on a map
      </a>
    );
  }
  return null;
}

function Stage({ item, firstName }: { item: SessionItem; firstName: string }) {
  const portrait = item.kind === "film_clip" || item.kind === "tv_clip" || item.kind === "book";
  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-6 py-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-14 md:px-10">
      <div className="flex justify-center">
        {item.media.image ? (
          <img
            src={item.media.image}
            alt=""
            className={`${portrait ? "aspect-[2/3] max-h-[52vh] md:max-h-[64vh]" : item.kind === "song" ? "aspect-square max-h-[42vh] md:max-h-[56vh]" : "aspect-[4/3] max-h-[40vh] md:max-h-[52vh]"} w-auto max-w-full rounded-xl object-cover shadow-[0_20px_50px_-25px_rgba(36,33,29,0.6)]`}
          />
        ) : (
          <div className="flex aspect-square w-full max-w-sm items-end rounded-xl bg-ink p-6" aria-hidden>
            <span className="font-display text-4xl text-paper">{item.title}</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-6">
        <p className="text-2xl text-muted">{KIND_WORD[item.kind]}</p>
        <h1 className="font-display text-5xl leading-[1.05] text-ink md:text-7xl">{item.title}</h1>
        {item.year && <p className="-mt-3 text-3xl text-muted">{item.year}</p>}
        <p className="max-w-[30ch] font-display text-3xl leading-snug text-ink/90">{item.prompt}</p>
        {item.kind === "food" && <p className="text-xl text-muted">Follow {firstName}’s diet and texture plan.</p>}
        <Media item={item} />
      </div>
    </div>
  );
}

export function SessionMode({ sessionId, firstName, plan, canEdit }: { sessionId: string; firstName: string; plan: SessionPlan; canEdit: boolean }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("item");
  const [reactions, setReactions] = useState<Record<string, Reaction>>({});
  const [fallback, setFallback] = useState<SessionItem | null>(null);
  const items = plan.items;
  const current = fallback ?? items[index];
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [index, phase, fallback]);

  const react = useCallback(
    (reaction: Reaction) => {
      const entityId = current.entityId;
      setReactions((r) => ({ ...r, [entityId]: reaction }));
      if (canEdit) {
        fetch(`/api/sessions/${sessionId}/reactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityId, reaction }) }).catch(() => {});
      }
      if (reaction === "upset") {
        setFallback(null);
        setPhase("upset");
      }
    },
    [current, canEdit, sessionId],
  );

  const bestSoFar = (() => {
    const liked = items
      .filter((i) => reactions[i.entityId] && reactions[i.entityId] !== "upset" && i.entityId !== current.entityId)
      .sort((a, b) => RANK[reactions[b.entityId]] - RANK[reactions[a.entityId]]);
    if (liked[0] && RANK[reactions[liked[0].entityId]] >= 2) return liked[0];
    return items.find((i) => i.kind === "song" && reactions[i.entityId] !== "upset" && i.entityId !== current.entityId) ?? null;
  })();

  function go(delta: 1 | -1) {
    setFallback(null);
    setPhase("item");
    const next = index + delta;
    if (next >= items.length) setPhase("end");
    else if (next >= 0) setIndex(next);
  }

  const counts = Object.values(reactions).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="flex items-center justify-between gap-4 px-6 py-4 md:px-10">
        <Link href={`/s/${sessionId}`} className="text-lg font-bold text-muted hover:text-ink">
          Leave session
        </Link>
        {phase !== "end" && (
          <p className="text-lg text-muted tabular-nums" aria-live="polite">
            {fallback ? "A favourite" : `${index + 1} of ${items.length}`}
          </p>
        )}
        {phase === "item" || phase === "upset" ? (
          <button type="button" onClick={() => setPhase("paused")} className="min-h-12 rounded-full border border-ink/30 px-5 text-lg font-bold">
            Pause
          </button>
        ) : (
          <span className="w-20" />
        )}
      </header>

      <div ref={headingRef} tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {phase === "item" && <Stage key={current.entityId} item={current} firstName={firstName} />}

        {phase === "upset" && (
          <div className="mx-auto flex max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-10 text-center">
            <h1 className="font-display text-5xl leading-tight md:text-6xl">Let’s set that one aside.</h1>
            <p className="text-2xl text-ink/80">Encore won’t show it again. Take a breath together. When you’re ready, you can play something {firstName} enjoyed.</p>
            <div className="flex flex-col gap-4">
              {bestSoFar && (
                <button
                  type="button"
                  onClick={() => {
                    setFallback(bestSoFar);
                    setPhase("item");
                  }}
                  className="min-h-20 rounded-full bg-accent px-8 text-2xl font-bold text-paper"
                >
                  Play {bestSoFar.title}
                </button>
              )}
              <button type="button" onClick={() => setPhase("paused")} className="min-h-20 rounded-full border-2 border-ink px-8 text-2xl font-bold">
                Pause the session
              </button>
              <button type="button" onClick={() => go(1)} className="min-h-16 text-xl font-bold text-muted underline underline-offset-4">
                Go on to the next one
              </button>
            </div>
          </div>
        )}

        {phase === "paused" && (
          <div className="mx-auto flex max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-10 text-center">
            <h1 className="font-display text-5xl md:text-6xl">Paused</h1>
            <p className="text-2xl text-ink/80">Take as long as you need. Ending early is fine; what you saw so far still helps Encore learn.</p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <button type="button" onClick={() => setPhase("item")} className="min-h-20 rounded-full bg-accent px-10 text-2xl font-bold text-paper">
                Carry on
              </button>
              <Link href={`/s/${sessionId}/done`} className="flex min-h-20 items-center justify-center rounded-full border-2 border-ink px-10 text-2xl font-bold">
                End the session
              </Link>
            </div>
          </div>
        )}

        {phase === "end" && (
          <div className="mx-auto flex max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-10 text-center">
            <h1 className="font-display text-5xl leading-tight md:text-6xl">That’s today’s session.</h1>
            <p className="text-2xl text-ink/80">
              {Object.keys(reactions).length
                ? `You noted ${Object.keys(reactions).length} reactions${counts.sang_along ? `, including ${counts.sang_along} sing-along${counts.sang_along > 1 ? "s" : ""}` : ""}. Thank you for sharing this time with ${firstName}.`
                : `Thank you for sharing this time with ${firstName}.`}
            </p>
            <Link href={`/s/${sessionId}/done`} className="mx-auto flex min-h-20 items-center justify-center rounded-full bg-accent px-10 text-2xl font-bold text-paper">
              See what Encore learned
            </Link>
          </div>
        )}
      </div>

      {(phase === "item" || phase === "upset") && (
        <section aria-label="For the caregiver" className="border-t-4 border-ink bg-ink px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-paper md:px-10">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 lg:flex-row lg:items-center">
            <p className="text-lg font-bold lg:w-44">How did {firstName} respond?</p>
            <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
              {REACTION_BUTTONS.map((b) => {
                const selected = reactions[current.entityId] === b.value;
                return (
                  <button
                    key={b.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => react(b.value)}
                    className={`min-h-16 rounded-xl px-3 text-xl font-bold leading-tight transition-colors ${
                      selected ? (b.value === "upset" ? "bg-paper text-accent ring-4 ring-accent-soft" : "bg-paper text-ink ring-4 ring-accent") : "bg-white/10 text-paper hover:bg-white/20"
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:w-64">
              <button type="button" onClick={() => go(-1)} disabled={index === 0 && !fallback} className="min-h-16 rounded-xl border-2 border-paper/40 text-xl font-bold disabled:opacity-30">
                Back
              </button>
              <button type="button" onClick={() => go(1)} className="min-h-16 rounded-xl bg-paper text-xl font-bold text-ink">
                {index === items.length - 1 && !fallback ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
