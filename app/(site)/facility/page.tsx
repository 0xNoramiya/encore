import type { Metadata } from "next";
import { addExampleResidents } from "@/app/actions/profiles";
import { FacilityBuilder } from "@/components/FacilityBuilder";
import { db } from "@/lib/db";
import type { Profile } from "@/lib/profiles";
import { getWorkspaceId } from "@/lib/workspace";

export const metadata: Metadata = { title: "Group sessions for memory care" };

export default async function FacilityPage() {
  const workspaceId = await getWorkspaceId();
  const { data } = await db().from("profiles").select("*").eq("workspace_id", workspaceId).eq("kind", "person").gte("version", 1).order("created_at");
  const people = (data ?? []) as Profile[];
  const seeds = people.length
    ? (((await db().from("seeds").select("profile_id,name,raw_text,kind").in("profile_id", people.map((p) => p.id)).eq("kind", "entity")).data ?? []) as { profile_id: string; name: string | null; raw_text: string }[])
    : [];

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-10 pt-6 sm:px-8">
      <h1 className="max-w-[20ch] font-display text-5xl leading-tight">Group sessions for memory care</h1>
      <p className="mb-12 mt-4 max-w-[62ch] text-lg text-muted">
        Pick a few residents. Encore pools what each of them loved into one query to Qloo’s taste graph, then puts the songs, films and shows that connect the most
        people first. Every pick says whose favourites led to it.
      </p>

      {people.length < 2 ? (
        <section className="rounded-lg border border-rule bg-card p-6 sm:p-8">
          <h2 className="font-display text-2xl">Add at least two people first</h2>
          <p className="mt-2 max-w-[60ch] text-muted">
            Group sessions are built from individual profiles. Add the three examples (Dorothy, Roberto and Margaret) to try it now, or start a profile for someone you
            care for.
          </p>
          <form action={addExampleResidents} className="mt-5">
            <button type="submit" className="rounded-full bg-accent px-7 py-3.5 text-lg font-bold text-paper">
              Add the three example residents
            </button>
          </form>
        </section>
      ) : (
        <FacilityBuilder
          residents={people.map((p) => ({
            id: p.id,
            firstName: p.first_name,
            birthYear: p.birth_year,
            hometown: p.hometown,
            seeds: seeds.filter((s) => s.profile_id === p.id).map((s) => s.name ?? s.raw_text),
          }))}
        />
      )}
    </main>
  );
}
