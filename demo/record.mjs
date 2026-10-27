/**
 * Scripted screen recordings of the production site for the demo video.
 * Each recording logs timestamps of key moments to demo/assets/rec/marks.json.
 *
 *   PW_EXE=<chrome-headless-shell> node demo/record.mjs [name...]
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";

const BASE = process.env.BASE ?? "https://encore-qloo.fly.dev";
const PROJECT = process.env.PROJECT ?? process.cwd();
const OUT = `${PROJECT}/demo/assets/rec`;
mkdirSync(OUT, { recursive: true });
const marksFile = `${OUT}/marks.json`;
const marks = existsSync(marksFile) ? JSON.parse(readFileSync(marksFile, "utf8")) : {};

// A soft cursor so viewers can follow clicks (Playwright recordings don't show the pointer).
const CURSOR = `
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.style.cssText = "position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(123,34,50,.35);border:2px solid rgba(123,34,50,.85);z-index:2147483647;pointer-events:none;transition:transform .12s ease-out";
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(.7)"), true);
    addEventListener("mouseup", () => (c.style.transform = "scale(1)"), true);
  });`;

const browser = await chromium.launch({ executablePath: process.env.PW_EXE });

async function session(name, { width = 1280, height = 720, scale = 1.5, storageState } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    recordVideo: { dir: OUT, size: { width: Math.round(width * scale), height: Math.round(height * scale) } },
    storageState,
  });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  const t0 = Date.now();
  const m = {};
  const mark = (k) => {
    m[k] = Number(((Date.now() - t0) / 1000).toFixed(2));
    console.log(`  ${name}.${k} @ ${m[k]}s`);
  };
  const finish = async () => {
    const state = await context.storageState();
    const video = page.video();
    await context.close();
    renameSync(await video.path(), `${OUT}/${name}.webm`);
    marks[name] = m;
    writeFileSync(marksFile, JSON.stringify(marks, null, 2));
    return state;
  };
  return { page, mark, finish };
}

async function glide(page, locator, opts = {}) {
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await page.waitForTimeout(opts.pause ?? 250);
  await locator.click();
}

async function smoothScroll(page, to, ms = 2500) {
  // Playwright locators (getByRole etc.) resolve to an absolute page offset first; strings are CSS selectors.
  if (typeof to === "object") {
    await to.first().waitFor();
    const box = await to.first().boundingBox();
    to = Math.max(0, (await page.evaluate(() => scrollY)) + (box?.y ?? 0) - 40);
  }
  await page.evaluate(
    ([target, duration]) =>
      new Promise((resolve) => {
        const start = scrollY;
        const dist = (typeof target === "number" ? target : document.querySelector(target).getBoundingClientRect().top + scrollY - 40) - start;
        const t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / duration);
          const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          scrollTo(0, start + dist * e);
          p < 1 ? requestAnimationFrame(step) : resolve();
        };
        requestAnimationFrame(step);
      }),
    [to, ms],
  );
}

async function type(page, label, text) {
  const input = page.getByLabel(label);
  await glide(page, input, { pause: 150 });
  await input.pressSequentially(text, { delay: 70 });
}

const RECORDINGS = {
  /** Intake for a new person, then the live agent build. */
  async intake() {
    const { page, mark, finish } = await session("intake");
    await page.goto(`${BASE}/intake`, { waitUntil: "networkidle" });
    mark("start");
    await page.waitForTimeout(1200);
    await type(page, "First name", "Dorothy");
    await type(page, "Year they were born", "1941");
    await type(page, "Where they grew up", "Brooklyn");
    const towns = page.getByRole("list", { name: "Matching places" }).getByRole("button");
    await towns.first().waitFor();
    await page.waitForTimeout(600);
    await glide(page, towns.first());
    await page.waitForTimeout(600);
    await smoothScroll(page, "fieldset:nth-of-type(2)", 1200);
    for (const [text, kind] of [["Frank Sinatra", "music"], ["Roman Holiday", "film"], ["I Love Lucy", "tv"]]) {
      await type(page, "Something they loved", text);
      await page.getByLabel("Kind").selectOption(kind);
      await glide(page, page.getByRole("button", { name: "Add", exact: true }).first());
      await page.waitForFunction(() => !document.body.innerText.includes("Searching Qloo"), null, { timeout: 30000 });
      if (text === "Roman Holiday") {
        mark("candidates");
        await page.waitForTimeout(2500);
      } else await page.waitForTimeout(900);
    }
    await smoothScroll(page, "button[type=submit]", 1500);
    await page.waitForTimeout(700);
    await glide(page, page.getByRole("button", { name: /Build Dorothy/ }));
    mark("submit");
    await page.waitForURL(/\/p\//);
    await page.getByText("Worked out the reminiscence window").waitFor({ timeout: 30000 });
    mark("build_start");
    await smoothScroll(page, "section[aria-live]", 1200);
    await page.getByRole("heading", { name: /Songs & singers/ }).waitFor({ timeout: 180000 });
    mark("build_done");
    await page.waitForTimeout(1500);
    await finish();
  },

  /** Dorothy's world (years picture, chips, trace) and the generic comparison. */
  async world() {
    const { page, mark, finish } = await session("world");
    await page.goto(BASE, { waitUntil: "networkidle" });
    await glide(page, page.getByRole("button", { name: /Try Dorothy’s session/ }).last());
    await page.waitForURL(/\/p\//);
    await page.getByRole("heading", { name: /Songs & singers/ }).waitFor();
    await page.waitForTimeout(1500);
    mark("profile");
    await page.waitForTimeout(2500);
    await smoothScroll(page, "#years-heading", 2500);
    mark("years");
    await page.waitForTimeout(3500);
    await smoothScroll(page, page.getByRole("heading", { name: /Songs & singers/ }), 2500);
    mark("chips");
    await page.waitForTimeout(3500);
    const trace = page.locator("summary", { hasText: "How Encore thought" });
    await trace.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await glide(page, trace);
    await page.waitForTimeout(900);
    await glide(page, page.getByRole("button", { name: /Show the Qloo call/ }).nth(2));
    mark("trace");
    await page.waitForTimeout(3500);
    await page.evaluate(() => scrollTo({ top: 0 }));
    await page.waitForTimeout(400);
    await glide(page, page.getByRole("link", { name: /Open today’s session/ }));
    await page.waitForURL(/\/s\/[0-9a-f-]+$/);
    await page.waitForTimeout(1500);
    mark("preview");
    await page.waitForTimeout(2000);
    await glide(page, page.getByRole("button", { name: /Compare with a generic AI/ }));
    await page.getByRole("table").waitFor({ timeout: 90000 });
    mark("compare");
    await page.waitForTimeout(4000);
    await smoothScroll(page, "mark", 2500);
    mark("highlights");
    await page.waitForTimeout(4000);
    await finish();
  },

  /** Session Mode on a tablet: read aloud, reactions, the upset path, the end. */
  async session() {
    const { page, mark, finish } = await session("session", { width: 1180, height: 820, scale: 1.5 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Try Dorothy’s session/ }).last().click();
    await page.waitForURL(/\/p\//);
    await page.getByRole("link", { name: /Open today’s session/ }).click();
    await page.waitForURL(/\/s\/[0-9a-f-]+$/);
    const sid = page.url().split("/").pop();
    await page.goto(`${BASE}/s/${sid}/play`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    mark("first_item");
    await glide(page, page.getByRole("button", { name: "Read it aloud" }));
    mark("read_aloud");
    await page.waitForTimeout(4500);
    await glide(page, page.getByRole("button", { name: "Sang or talked along" }));
    mark("sang");
    await page.waitForTimeout(1400);
    await glide(page, page.getByRole("button", { name: "Next", exact: true }));
    await page.waitForTimeout(2500);
    await glide(page, page.getByRole("button", { name: "Lit up", exact: true }));
    await page.waitForTimeout(900);
    await glide(page, page.getByRole("button", { name: "Next", exact: true }));
    await page.waitForTimeout(2200);
    await glide(page, page.getByRole("button", { name: "Upset", exact: true }));
    mark("upset");
    await page.waitForTimeout(4000);
    await glide(page, page.getByRole("button", { name: /^Play / }));
    mark("favourite");
    await page.waitForTimeout(3000);
    await glide(page, page.getByRole("button", { name: "Sang or talked along" }));
    await page.waitForTimeout(700);
    for (let i = 0; i < 6; i++) {
      const next = page.getByRole("button", { name: /^(Next|Finish)$/ });
      const label = await next.textContent();
      await glide(page, page.getByRole("button", { name: i % 2 ? "Lit up" : "Neutral", exact: true }), { pause: 120 });
      await page.waitForTimeout(400);
      await glide(page, next, { pause: 120 });
      await page.waitForTimeout(900);
      if (label === "Finish") break;
    }
    await page.getByRole("heading", { name: /That’s today’s session/ }).waitFor();
    mark("end");
    await page.waitForTimeout(2500);
    const state = await finish();
    writeFileSync(`${OUT}/session-state.json`, JSON.stringify({ state, sid }));
  },

  /** What Encore learned, with the live expansion to the next profile version. */
  async learn() {
    const { state, sid } = JSON.parse(readFileSync(`${OUT}/session-state.json`, "utf8"));
    const { page, mark, finish } = await session("learn", { storageState: state });
    await page.goto(`${BASE}/s/${sid}/done`, { waitUntil: "domcontentloaded" });
    await page.locator("blockquote").waitFor({ timeout: 60000 });
    mark("narrative");
    await page.waitForTimeout(3000);
    await smoothScroll(page, page.getByRole("heading", { name: /Taste Profile/ }), 2000);
    mark("expanding");
    await page.getByRole("button", { name: /Plan tomorrow’s session/ }).waitFor({ timeout: 200000 });
    await page.waitForTimeout(2500);
    mark("v2");
    await smoothScroll(page, page.getByRole("heading", { name: /Taste Profile/ }), 1500);
    await page.waitForTimeout(1500);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(3500);
    await finish();
  },

  /** Roberto's session in Spanish, with the read-aloud voice. */
  async spanish() {
    const { page, mark, finish } = await session("spanish", { width: 1180, height: 820, scale: 1.5 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Try Roberto’s session/ }).click();
    await page.waitForURL(/\/p\//);
    await page.getByRole("link", { name: /Open today’s session/ }).click();
    await page.waitForURL(/\/s\/[0-9a-f-]+$/);
    const sid = page.url().split("/").pop();
    await page.goto(`${BASE}/s/${sid}/play`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    mark("item");
    await glide(page, page.getByRole("button", { name: "Read it aloud" }));
    await page.waitForTimeout(5000);
    await finish();
    writeFileSync(`${OUT}/spanish-sid.txt`, sid);
  },

  /** Facility mode: pick residents, find common ground, open the group. */
  async facility() {
    const { page, mark, finish } = await session("facility");
    await page.goto(`${BASE}/facility`, { waitUntil: "networkidle" });
    await glide(page, page.getByRole("button", { name: /Add the three example residents/ }));
    await page.getByRole("button", { name: /Build a group session/ }).waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200);
    mark("residents");
    await page.waitForTimeout(1500);
    await glide(page, page.getByRole("button", { name: /Build a group session/ }));
    mark("building");
    await page.waitForURL(/\/p\//, { timeout: 120000 });
    await page.getByRole("heading", { name: /Songs & singers/ }).waitFor();
    await page.waitForTimeout(1200);
    mark("group");
    await page.waitForTimeout(2000);
    await smoothScroll(page, page.getByRole("heading", { name: /Songs & singers/ }), 2000);
    await page.waitForTimeout(3000);
    await finish();
  },

  /** The engagement report. */
  async report() {
    const { page, mark, finish } = await session("report");
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Try Dorothy’s session/ }).last().click();
    await page.waitForURL(/\/p\//);
    await page.goto(page.url() + "/report", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    mark("report");
    await page.waitForTimeout(3000);
    await smoothScroll(page, 650, 3000);
    await page.waitForTimeout(2500);
    await smoothScroll(page, 1500, 3000);
    await page.waitForTimeout(2500);
    await finish();
  },
};

for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(RECORDINGS)) {
  console.log(`recording ${name}`);
  await RECORDINGS[name]();
}
await browser.close();
