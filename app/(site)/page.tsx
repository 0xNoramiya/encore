import Link from "next/link";
import { openPersona } from "@/app/actions/profiles";
import { db } from "@/lib/db";
import { listWorkspaceProfiles } from "@/lib/profiles";
import { getWorkspaceId } from "@/lib/workspace";

const PERSONAS = [
  { key: "dorothy", name: "Dorothy", art: "/art/dorothy.webp", line: "Born 1941, grew up in Brooklyn", loved: "Frank Sinatra, Ella Fitzgerald, Roman Holiday, I Love Lucy" },
  { key: "roberto", name: "Roberto", art: "/art/roberto.webp", line: "Born 1946, grew up in San Antonio", loved: "Pedro Infante, Los Panchos, The Magnificent Seven" },
  { key: "margaret", name: "Margaret", art: "/art/margaret.webp", line: "Born 1948, grew up in Liverpool", loved: "The Beatles, Cilla Black, Coronation Street" },
];

const STEPS = [
  { title: "Share a few memories", body: "A first name, a birth year, a hometown, and two to five things they loved. A singer, a film, a dish." },
  {
    title: "Watch Encore rebuild their world",
    body: "Encore follows Qloo’s taste graph outward from those memories, scoped to the years they were 10 to 30 and the place they grew up. Every pick shows which memory led to it.",
  },
  { title: "Play a short session together", body: "Six to eight songs, clips, places and tastes, one at a time. Tap how they responded. Tomorrow’s session leans into what lit them up." },
];

export default async function Home() {
  const workspaceId = await getWorkspaceId();
  const [mine, templates] = await Promise.all([
    listWorkspaceProfiles(workspaceId),
    db().from("profiles").select("id,persona_key,first_name").eq("is_persona_template", true),
  ]);
  const templateIds = new Map((templates.data ?? []).map((t) => [t.persona_key as string, t.id as string]));
  const personas = PERSONAS.filter((p) => templateIds.has(p.key));

  return (
    <main>
      <section className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="grid items-center gap-8 pb-16 pt-4 lg:grid-cols-[6fr_6fr] lg:gap-0">
          <div className="relative z-10 lg:-mr-20">
            <h1 className="font-display text-[2.6rem] leading-[1.08] text-ink sm:text-6xl">
              When someone can no longer tell you what they love, their taste graph still can.
            </h1>
            <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-ink/85">
              Encore helps dementia caregivers find the songs, films, places and tastes of a loved one’s youth, and turns them into short daily sessions that
              learn from how they respond.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/intake" className="rounded-full bg-accent px-7 py-3.5 text-lg font-bold text-paper">
                Start for someone you love
              </Link>
              {templateIds.has("dorothy") && (
                <form action={openPersona}>
                  <input type="hidden" name="templateId" value={templateIds.get("dorothy")} />
                  <button type="submit" className="rounded-full border border-ink/30 px-7 py-3.5 text-lg font-bold text-ink hover:border-ink/60">
                    Try Dorothy’s session
                  </button>
                </form>
              )}
            </div>
          </div>
          <img
            src="/art/hero.webp"
            alt="A 1950s radio, records and a teacup on a kitchen table, with an older hand held gently by a younger one"
            className="w-full rounded-lg lg:rounded-l-none lg:[mask-image:linear-gradient(to_right,transparent,black_35%)]"
          />
        </div>
      </section>

      {mine.length > 0 && (
        <section className="mx-auto w-full max-w-6xl border-t border-rule px-5 py-10 sm:px-8">
          <h2 className="mb-4 font-display text-2xl">Your people</h2>
          <ul className="flex flex-wrap gap-3">
            {mine.map((p) => (
              <li key={p.id}>
                <Link href={`/p/${p.id}`} className="block rounded-lg border border-rule bg-card px-5 py-3 hover:border-ink/40">
                  <span className="font-display text-lg">{p.first_name}</span>
                  <span className="ml-2 text-sm text-muted">born {p.birth_year}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto w-full max-w-6xl border-t border-rule px-5 py-16 sm:px-8">
        <h2 className="mb-10 max-w-[24ch] font-display text-4xl leading-tight">A generic playlist knows the decade. Encore knows the person.</h2>
        <ol className="grid gap-10 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="font-display text-5xl text-accent">{i + 1}</span>
              <h3 className="mt-3 text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-ink/80">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto w-full max-w-6xl border-t border-rule px-5 py-16 sm:px-8">
        <h2 className="mb-2 font-display text-4xl">Try it with an example</h2>
        <p className="mb-8 max-w-[60ch] text-muted">Each example opens as your own copy, so you can play the session, tap reactions and watch Encore learn.</p>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {personas.map((p) => (
            <form key={p.key} action={openPersona}>
              <input type="hidden" name="templateId" value={templateIds.get(p.key)} />
              <button type="submit" className="group block w-full text-left">
                <img src={p.art} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
                <span className="mt-4 block font-display text-2xl group-hover:text-accent">Try {p.name}’s session</span>
                <span className="block text-muted">{p.line}</span>
                <span className="mt-1 block text-sm text-ink/80">Loved {p.loved}</span>
              </button>
            </form>
          ))}
          <Link href="/intake" className="group block">
            <img src="/art/keepsakes.webp" alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
            <span className="mt-4 block font-display text-2xl group-hover:text-accent">Start for someone you love</span>
            <span className="block text-muted">Takes about two minutes</span>
            <span className="mt-1 block text-sm text-ink/80">Begin with a few things they loved.</span>
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl border-t border-rule px-5 py-16 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <h2 className="font-display text-4xl leading-tight">What the research says, honestly</h2>
          <div className="grid gap-6 text-ink/85">
            <p>
              Long-term musical memory relies on brain regions that show relatively less atrophy and metabolic decline in Alzheimer’s disease, which may be why
              familiar songs can still land when other memories fade. <span className="text-muted">(Jacobsen et al., Brain, 2015)</span>
            </p>
            <p>
              A 2025 Cochrane review found music-based therapy probably improves depressive symptoms slightly and may help social behaviour, but probably does not
              reduce agitation. So Encore is a tool for connection and mood, not a treatment. <span className="text-muted">(Cochrane Database of Systematic Reviews, 2025)</span>
            </p>
            <p>
              More than 55 million people live with dementia worldwide, a number projected to reach 78 million by 2030. Most are cared for at home by family.{" "}
              <span className="text-muted">(World Health Organization)</span>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
