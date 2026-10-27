/**
 * Builds the demo video: cuts the screen recordings, grades and times the film
 * clips, mixes narration + app voice + sound effects + ducked jazz, and writes
 * the HyperFrames composition in demo/video/. Then:
 *
 *   cd demo/video && npx hyperframes render --output ../renders/encore-demo.mp4
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const A = `${ROOT}/assets`;
const V = `${ROOT}/video`;
const MEDIA = `${V}/media`;
mkdirSync(`${MEDIA}`, { recursive: true });
mkdirSync(`${V}/fonts`, { recursive: true });
mkdirSync(`${ROOT}/renders`, { recursive: true });
const M = JSON.parse(readFileSync(`${A}/rec/marks.json`, "utf8"));
const TOTAL = 161.5;

// HTML_ONLY=1 rewrites the composition without re-cutting media or re-mixing audio.
const HTML_ONLY = process.env.HTML_ONLY === "1";
const ff = (args) => HTML_ONLY || execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const enc = ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30"];

/** A slice of a recording, retimed to `target` seconds. */
function seg(name, src, from, to, target, { w = 1920, h = 1080 } = {}) {
  const speed = (to - from) / target;
  ff(["-ss", String(from), "-to", String(to), "-i", `${A}/rec/${src}.webm`, "-vf", `setpts=PTS/${speed.toFixed(4)},fps=30,scale=${w}:${h}:flags=lanczos`, ...enc, `${MEDIA}/${name}.mp4`]);
}
function concat(name, parts) {
  const list = `${MEDIA}/${name}.txt`;
  writeFileSync(list, parts.map((p) => `file '${MEDIA}/${p}.mp4'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", `${MEDIA}/${name}.mp4`]);
}
/** A Higgsfield clip stretched (frame-blended) to `target` seconds, optionally reversed. */
function film(name, target, { reverse = false } = {}) {
  const src = `${A}/video/${name}.mp4`;
  const k = target / probe(src);
  const vf = [`setpts=${k.toFixed(4)}*PTS`, "minterpolate=fps=30:mi_mode=blend", "scale=1920:1080:flags=lanczos", reverse ? "reverse" : null].filter(Boolean).join(",");
  ff(["-i", src, "-vf", vf, ...enc, `${MEDIA}/film-${name}${reverse ? "-rev" : ""}.mp4`]);
}

// ---------------------------------------------------------------- timeline
// Scenes [start, end] in seconds. Demo scenes overlap the next by 0.5s for crossfades.
const S = {
  stoop: [0.9, 6.4],
  club: [5.9, 11.6],
  tv: [11.9, 19.8],
  title: [19.6, 25.9],
  hands: [25.6, 36.1],
  intake: [35.8, 49.1],
  build: [48.8, 64.3],
  world: [64.0, 73.7],
  compare: [73.4, 90.9],
  session: [90.6, 113.0],
  learn: [112.7, 123.0],
  spanish: [122.7, 131.4],
  facility: [131.1, 134.0],
  report: [133.7, 137.6],
  keepsakes: [137.3, 139.6],
  robertoFilm: [139.3, 141.6],
  margaretFilm: [141.3, 143.6],
  needle: [143.9, 149.5],
  end: [149.2, TOTAL],
};
const STATIC = [[0, 1.0], [11.35, 12.05], [143.35, 144.0]];
const VOICE = {
  n01: 1.7, n02: 12.3, n03: 26.0, n04: 36.3, n05: 49.3, n06: 64.6, n07: 74.0,
  "app-en": 92.1, n08: 97.1, n09: 113.2, "app-es": 123.0, n10: 129.8, n11: 144.6,
};
const NARRATION = Object.fromEntries(
  [...readFileSync(`${ROOT}/gen-audio.mts`, "utf8").matchAll(/(n\d\d): "(.*)",/g)].map((m) => [m[1], m[2].replace(/\\'/g, "'")]),
);

// ---------------------------------------------------------------- media
const dur = (k) => S[k][1] - S[k][0];
seg("intake", "intake", M.intake.start + 0.4, M.intake.candidates + 2.4, dur("intake"));
seg("build-a", "intake", M.intake.build_start - 0.3, M.intake.build_done + 1.0, dur("build") - 4.3);
seg("build-b", "world", M.world.trace - 1.0, M.world.trace + 3.3, 4.3);
concat("build", ["build-a", "build-b"]);
seg("world", "world", M.world.profile - 0.3, M.world.chips + 3.0, dur("world"));
seg("compare", "world", M.world.preview - 0.3, M.world.highlights + 3.5, dur("compare"));
seg("session", "session", M.session.first_item - 0.5, M.session.favourite + 3.0, dur("session"), { w: 1770, h: 1230 });
seg("learn-a", "learn", M.learn.narrative - 0.3, M.learn.narrative + 3.7, 4.2);
seg("learn-b", "learn", M.learn.v2 - 0.5, M.learn.v2 + 5.6, dur("learn") - 4.2);
concat("learn", ["learn-a", "learn-b"]);
seg("spanish", "spanish", M.spanish.item - 0.3, M.spanish.item + 5.5, dur("spanish"), { w: 1770, h: 1230 });
seg("facility", "facility", M.facility.group - 0.3, M.facility.group + 4.0, dur("facility"));
seg("report", "report", M.report.report + 2.2, M.report.report + 6.8, dur("report"));
film("stoop", dur("stoop"));
film("club", dur("club"));
film("tv", dur("tv"));
film("hands", dur("hands"));
film("roberto", dur("robertoFilm"));
film("margaret", dur("margaretFilm"));
film("needle", dur("needle"), { reverse: true });
const haveKeepsakes = existsSync(`${A}/video/keepsakes.mp4`);
if (haveKeepsakes) film("keepsakes", dur("keepsakes"));
for (const f of ["YoungSerif-400", "Atkinson-400", "Atkinson-700"]) copyFileSync(`${ROOT}/fonts/${f}.woff2`, `${V}/fonts/${f}.woff2`);
for (const f of ["hero", "keepsakes"]) copyFileSync(`${ROOT}/../public/art/${f}.webp`, `${MEDIA}/${f}.webp`);

// ---------------------------------------------------------------- audio mix
const au = (f) => `${A}/audio/${f}.mp3`;
const inputs = [];
const chains = [];
const add = (file) => inputs.push("-i", file) && inputs.length / 2 - 1;
const voiceLabels = [];
for (const [id, at] of Object.entries(VOICE)) {
  const i = add(au(id));
  const ms = Math.round(at * 1000);
  chains.push(`[${i}:a]aformat=channel_layouts=stereo:sample_rates=44100,volume=${id.startsWith("app") ? 0.9 : 1.0},adelay=${ms}|${ms}[v${i}]`);
  voiceLabels.push(`[v${i}]`);
}
chains.push(`${voiceLabels.join("")}amix=inputs=${voiceLabels.length}:normalize=0,asplit=2[voice][sc]`);
const jazz = add(au("jazz"));
chains.push(`[${jazz}:a]aformat=channel_layouts=stereo:sample_rates=44100,atrim=0:${TOTAL - 0.8},adelay=800|800,afade=t=in:st=0.8:d=1.5,afade=t=out:st=${TOTAL - 6}:d=5.5,volume=0.62[mus]`);
chains.push(`[mus][sc]sidechaincompress=threshold=0.035:ratio=7:attack=25:release=450:makeup=1[ducked]`);
const sfxLabels = [];
const sfx = (file, at, { vol = 0.5, len, rev = false } = {}) => {
  const i = add(au(file));
  const ms = Math.round(at * 1000);
  const loop = len ? `aloop=loop=-1:size=2e9,atrim=0:${len},` : "";
  chains.push(`[${i}:a]aformat=channel_layouts=stereo:sample_rates=44100,${loop}${rev ? "areverse," : ""}volume=${vol},adelay=${ms}|${ms}[s${i}]`);
  sfxLabels.push(`[s${i}]`);
};
for (const [t] of STATIC) sfx("sfx-static", t, { vol: 0.32 });
sfx("sfx-click", 0.95, { vol: 0.6 });
sfx("sfx-projector", 0.9, { vol: 0.12, len: 24.9 });
sfx("sfx-projector", 137.3, { vol: 0.12, len: 12.2 });
sfx("sfx-crackle", 19.6, { vol: 0.28, len: 6.3 });
sfx("sfx-crackle", 149.2, { vol: 0.25, len: 12.3 });
sfx("sfx-needle", 22.9, { vol: 0.55 });
sfx("sfx-needle", 144.0, { vol: 0.45, rev: true });
chains.push(`[ducked][voice]${sfxLabels.join("")}amix=inputs=${2 + sfxLabels.length}:normalize=0,atrim=0:${TOTAL},loudnorm=I=-16:TP=-1.5:LRA=11[out]`);
ff([...inputs, "-filter_complex", chains.join(";"), "-map", "[out]", "-c:a", "aac", "-b:a", "192k", "-ar", "44100", `${MEDIA}/mix.m4a`]);

// ---------------------------------------------------------------- captions
function captionChunks(id) {
  const text = NARRATION[id];
  const start = VOICE[id];
  const length = probe(au(id));
  const parts = text.split(/(?<=[.?!])\s+|\.\.\.\s*/).map((p) => p.trim()).filter(Boolean);
  const total = parts.reduce((n, p) => n + p.length, 0);
  let t = start;
  return parts.map((p) => {
    const d = (p.length / total) * length;
    const chunk = { text: p.replace(/\.$/, (m) => m), start: Number(t.toFixed(2)), duration: Number(Math.max(0.8, d).toFixed(2)) };
    t += d;
    return chunk;
  });
}
const captions = Object.keys(NARRATION).flatMap(captionChunks);

// ---------------------------------------------------------------- composition
let track = 1;
const T = () => track++;
const LOGO = `<svg viewBox="0 0 64 64" class="logo"><circle cx="32" cy="32" r="30" fill="#24211d" stroke="#f5efe4" stroke-width="2"/><circle cx="32" cy="32" r="23" fill="none" stroke="#4a443d" stroke-width="1.2"/><circle cx="32" cy="32" r="18" fill="none" stroke="#4a443d" stroke-width="1.2"/><path d="M14.5 21.5 A21 21 0 0 1 26 12.2" fill="none" stroke="#f5efe4" stroke-opacity=".35" stroke-width="2.4" stroke-linecap="round"/><circle cx="32" cy="32" r="13.5" fill="#7b2232"/><circle cx="32" cy="32" r="2.8" fill="#f5efe4"/></svg>`;

const filmClip = (key, file, z) =>
  `<div class="wrap" id="w-${key}" style="z-index:${z}"><video id="${key}" class="full film" src="media/${file}.mp4" data-start="${S[key][0]}" data-duration="${dur(key).toFixed(2)}" data-track-index="${T()}" muted playsinline></video></div>`;
const screenClip = (key, file, label, z) =>
  `<div class="wrap screen-wrap" id="w-${key}" style="z-index:${z}"><div class="label clip" id="l-${key}" data-start="${S[key][0]}" data-duration="${dur(key).toFixed(2)}" data-track-index="${T()}">${label}</div><video id="${key}" class="screen" src="media/${file}.mp4" data-start="${S[key][0]}" data-duration="${dur(key).toFixed(2)}" data-track-index="${T()}" muted playsinline></video></div>`;
const tabletClip = (key, file, label, z) =>
  `<div class="wrap" id="w-${key}" style="z-index:${z}"><img class="full tablet-bg clip" src="media/hero.webp" data-start="${S[key][0]}" data-duration="${dur(key).toFixed(2)}" data-track-index="${T()}" alt=""><div class="bezel clip" data-start="${S[key][0]}" data-duration="${dur(key).toFixed(2)}" data-track-index="${T()}"></div><div class="label clip" id="l-${key}" data-start="${S[key][0]}" data-duration="${dur(key).toFixed(2)}" data-track-index="${T()}">${label}</div><video id="${key}" class="tablet" src="media/${file}.mp4" data-start="${S[key][0]}" data-duration="${dur(key).toFixed(2)}" data-track-index="${T()}" muted playsinline></video></div>`;

const scenes = [
  filmClip("stoop", "film-stoop", 2),
  filmClip("club", "film-club", 3),
  filmClip("tv", "film-tv", 4),
  `<div class="wrap" id="w-title" style="z-index:5"><div class="card clip" id="title" data-start="${S.title[0]}" data-duration="${dur("title").toFixed(2)}" data-track-index="${T()}">
     <p class="t-line" id="t1">When someone can no longer tell you what they love,</p>
     <p class="t-line accent" id="t2">their taste graph still can.</p>
     <div class="brand" id="t3">${LOGO}<span>Encore</span></div>
   </div></div>`,
  filmClip("hands", "film-hands", 6),
  screenClip("intake", "intake", "A few memories, two minutes", 7),
  screenClip("build", "build", "The agent at work on Qloo’s taste graph", 8),
  screenClip("world", "world", "Dorothy’s world, and why", 9),
  screenClip("compare", "compare", "Same story, same AI, without Qloo", 10),
  tabletClip("session", "session", "Session Mode", 11),
  screenClip("learn", "learn", "Encore learns", 12),
  tabletClip("spanish", "spanish", "In Roberto’s first language", 13),
  screenClip("facility", "facility", "For a whole room of residents", 14),
  screenClip("report", "report", "A report the family can keep", 15),
  haveKeepsakes
    ? filmClip("keepsakes", "film-keepsakes", 16)
    : `<div class="wrap" id="w-keepsakes" style="z-index:16"><img id="keepsakes" class="full film kb clip" src="media/keepsakes.webp" data-start="${S.keepsakes[0]}" data-duration="${dur("keepsakes").toFixed(2)}" data-track-index="${T()}" alt=""></div>`,
  filmClip("robertoFilm", "film-roberto", 17),
  filmClip("margaretFilm", "film-margaret", 18),
  filmClip("needle", "film-needle-rev", 19),
  `<div class="wrap" id="w-end" style="z-index:20"><div class="card clip" id="end" data-start="${S.end[0]}" data-duration="${dur("end").toFixed(2)}" data-track-index="${T()}">
     <div class="brand big" id="e1">${LOGO}<span>Encore</span></div>
     <p class="e-line" id="e2">When someone can no longer tell you what they love, their taste graph still can.</p>
     <p class="e-meta" id="e3">Built on Qloo’s taste graph · encore-qloo.fly.dev</p>
     <p class="e-note" id="e4">A comfort and connection tool, not a medical device or treatment.</p>
   </div></div>`,
];

const captionHtml = captions
  .map((c, i) => `<div class="cap clip" id="cap${i}" data-start="${c.start}" data-duration="${c.duration}" data-track-index="${T()}">${c.text}</div>`)
  .join("\n");

// Each scene fades in over the previous one (crossfade); static bursts cover the act breaks.
const fadeIns = Object.entries(S)
  .filter(([k]) => k !== "stoop")
  .map(([k, [s]]) => `tl.fromTo("#w-${k}", { opacity: 0 }, { opacity: 1, duration: ${["tv", "needle"].includes(k) ? 0.15 : 0.5}, ease: "power1.inOut" }, ${s});`)
  .join("\n      ");
const labelIns = Object.keys(S)
  .filter((k) => ["intake", "build", "world", "compare", "session", "learn", "spanish", "facility", "report"].includes(k))
  .map((k, i) => `tl.from("#l-${k}", { x: -36, opacity: 0, duration: 0.55, ease: "${["power3.out", "expo.out", "back.out(1.4)"][i % 3]}" }, ${S[k][0] + 0.35});`)
  .join("\n      ");
const capIns = captions.map((c, i) => `tl.from("#cap${i}", { opacity: 0, y: 10, duration: 0.25, ease: "power2.out" }, ${c.start});`).join("\n      ");
const staticTweens = STATIC.map(
  ([a, b], i) => `tl.fromTo("#static", { opacity: 0 }, { opacity: 0.9, duration: 0.06${i ? ", immediateRender: false" : ""} }, ${a}); tl.to("#static", { opacity: 0, duration: 0.12 }, ${(b - 0.12).toFixed(2)});`,
).join("\n      ");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Encore demo</title>
<style>
  @font-face { font-family: "Young Serif"; src: url("fonts/YoungSerif-400.woff2") format("woff2"); font-weight: 400; }
  @font-face { font-family: "Atkinson Hyperlegible"; src: url("fonts/Atkinson-400.woff2") format("woff2"); font-weight: 400; }
  @font-face { font-family: "Atkinson Hyperlegible"; src: url("fonts/Atkinson-700.woff2") format("woff2"); font-weight: 700; }
  html, body { margin: 0; background: #14120f; }
  [data-composition-id="encore-demo"] { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #14120f; font-family: "Atkinson Hyperlegible", sans-serif; color: #f5efe4; }
  .wrap { position: absolute; inset: 0; opacity: 0; }
  #w-stoop { opacity: 1; }
  .full { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .film { filter: sepia(0.72) contrast(1.08) brightness(0.93) saturate(0.85); }
  .kb { transform: scale(1.06); }
  .screen-wrap { background: radial-gradient(circle at 50% 42%, #2c2722 0%, #17140f 75%); }
  .screen { position: absolute; left: 150px; top: 128px; width: 1620px; height: 911px; object-fit: cover; border: 12px solid #f5efe4; border-radius: 6px; box-shadow: 0 30px 80px rgba(0,0,0,0.55); filter: sepia(0.1) saturate(0.96); background: #f5efe4; }
  .label { position: absolute; left: 158px; top: 40px; font-family: "Young Serif", serif; font-size: 50px; color: #f5efe4; letter-spacing: 0.2px; }
  .tablet-bg { filter: blur(9px) brightness(0.5) sepia(0.6); transform: scale(1.08); }
  .bezel { position: absolute; left: 370px; top: 118px; width: 1180px; height: 862px; border-radius: 52px; background: #191714; box-shadow: 0 40px 110px rgba(0,0,0,0.6), inset 0 0 0 2px #2c2925; }
  .tablet { position: absolute; left: 400px; top: 148px; width: 1120px; height: 778px; object-fit: cover; border-radius: 20px; }
  .card { position: absolute; inset: 0; background: #f5efe4; color: #24211d; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 28px; padding: 120px 200px; box-sizing: border-box; text-align: center; }
  .t-line { margin: 0; font-family: "Young Serif", serif; font-size: 74px; line-height: 1.12; max-width: 1400px; }
  .accent { color: #7b2232; }
  .brand { display: flex; align-items: center; gap: 22px; margin-top: 26px; font-family: "Young Serif", serif; font-size: 64px; }
  .brand .logo { width: 84px; height: 84px; }
  .brand.big { font-size: 120px; gap: 34px; margin: 0; }
  .brand.big .logo { width: 150px; height: 150px; }
  .e-line { margin: 0; font-family: "Young Serif", serif; font-size: 46px; max-width: 1300px; line-height: 1.25; }
  .e-meta { margin: 0; font-size: 34px; color: #5f584e; }
  .e-note { margin: 0; font-size: 26px; color: #5f584e; }
  .cap { position: absolute; left: 50%; bottom: 54px; transform: translateX(-50%); max-width: 1480px; width: max-content; padding: 12px 28px; background: rgba(20,18,15,0.74); color: #f5efe4; font-size: 34px; line-height: 1.35; border-radius: 10px; text-align: center; z-index: 30; }
  .fx { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  #vignette { background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 100%); z-index: 40; }
  #flicker { background: #fff7e6; mix-blend-mode: overlay; z-index: 45; opacity: 0; }
  #grain { z-index: 50; opacity: 0.13; mix-blend-mode: overlay; }
  #static { z-index: 60; opacity: 0; image-rendering: pixelated; }
</style>
</head>
<body>
<div id="root" data-composition-id="encore-demo" data-start="0" data-duration="${TOTAL}" data-width="1920" data-height="1080">
  <audio id="mix" src="media/mix.m4a" data-start="0" data-duration="${TOTAL}" data-track-index="0" data-volume="1"></audio>
  ${scenes.join("\n  ")}
  ${captionHtml}
  <div class="fx clip" id="vignette" data-start="0" data-duration="${TOTAL}" data-track-index="${T()}" data-layout-ignore></div>
  <div class="fx clip" id="flicker" data-start="0" data-duration="${TOTAL}" data-track-index="${T()}" data-layout-ignore></div>
  <canvas class="fx clip" id="grain" width="480" height="270" data-start="0" data-duration="${TOTAL}" data-track-index="${T()}" data-layout-ignore></canvas>
  <canvas class="fx clip" id="static" width="320" height="180" data-start="0" data-duration="${TOTAL}" data-track-index="${T()}" data-layout-ignore></canvas>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });

    // Deterministic film grain, flicker and TV static (seeded per frame, so seeking is repeatable).
    function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const grain = document.getElementById("grain").getContext("2d");
    const stat = document.getElementById("static").getContext("2d");
    const flicker = document.getElementById("flicker");
    const gImg = grain.createImageData(480, 270);
    const sImg = stat.createImageData(320, 180);
    const STATIC = ${JSON.stringify(STATIC)};
    function noise(img, rand, contrast) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) { const v = rand() < 0.5 ? rand() * 255 * contrast : 255 - rand() * 255 * contrast; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    }
    function drawFx() {
      const t = tl.time();
      const frame = Math.floor(t * 24);
      const rand = mulberry32(frame + 7);
      noise(gImg, rand, 0.9);
      grain.putImageData(gImg, 0, 0);
      flicker.style.opacity = (rand() * 0.06).toFixed(3);
      if (STATIC.some(([a, b]) => t >= a - 0.05 && t <= b + 0.05)) { noise(sImg, mulberry32(frame * 13 + 3), 1); stat.putImageData(sImg, 0, 0); }
    }
    const fx = { p: 0 };
    tl.to(fx, { p: 1, duration: ${TOTAL}, ease: "none", onUpdate: drawFx }, 0);

    // TV static at the act breaks.
    ${staticTweens}

    // Scene crossfades.
    ${fadeIns}

    // Title card.
    tl.from("#t1", { y: 30, opacity: 0, duration: 0.9, ease: "power3.out" }, ${S.title[0] + 0.4});
    tl.from("#t2", { y: 24, opacity: 0, duration: 0.9, ease: "expo.out" }, ${S.title[0] + 1.9});
    tl.from("#t3", { scale: 0.85, opacity: 0, duration: 0.8, ease: "back.out(1.6)" }, ${S.title[0] + 3.2});
    tl.from("#t3 .logo", { rotation: -200, duration: 1.6, ease: "power2.out" }, ${S.title[0] + 3.2});

    // Film push-ins (wrappers only; videos are never resized).
    tl.fromTo("#w-hands", { scale: 1 }, { scale: 1.05, duration: ${dur("hands")}, ease: "none" }, ${S.hands[0]});
    tl.fromTo("#w-stoop", { scale: 1.04 }, { scale: 1, duration: ${dur("stoop")}, ease: "none" }, ${S.stoop[0]});

    // Scene labels and captions.
    ${labelIns}
    ${capIns}

    // End card, then fade to black.
    tl.from("#e1", { y: 30, opacity: 0, duration: 0.9, ease: "power3.out" }, ${S.end[0] + 0.5});
    tl.from("#e1 .logo", { rotation: -220, duration: 1.8, ease: "power2.out" }, ${S.end[0] + 0.5});
    tl.from("#e2", { y: 20, opacity: 0, duration: 0.8, ease: "expo.out" }, ${S.end[0] + 1.6});
    tl.from("#e3", { opacity: 0, duration: 0.7, ease: "power1.out" }, ${S.end[0] + 2.8});
    tl.from("#e4", { opacity: 0, duration: 0.7, ease: "power1.out" }, ${S.end[0] + 3.6});
    tl.to("#w-end", { opacity: 0, duration: 1.4, ease: "power1.in" }, ${TOTAL - 1.6});

    window.__timelines["encore-demo"] = tl;
  </script>
</div>
</body>
</html>
`;
writeFileSync(`${V}/index.html`, html);
console.log(`wrote ${V}/index.html with ${captions.length} captions; keepsakes ${haveKeepsakes ? "video" : "still"}`);
