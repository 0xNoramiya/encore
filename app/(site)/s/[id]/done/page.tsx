import { notFound } from "next/navigation";
import { AfterSession } from "@/components/AfterSession";
import { db } from "@/lib/db";
import type { ProfileItem } from "@/lib/profiles";
import { getViewableSession } from "@/lib/sessions";
import { getWorkspaceId } from "@/lib/workspace";

export default async function DonePage({ params }: PageProps<"/s/[id]/done">) {
  const { id } = await params;
  const found = await getViewableSession(id, await getWorkspaceId());
  if (!found) notFound();
  const { session, profile, canEdit } = found;
  const learned = session.learned;

  let newItems: ProfileItem[] = [];
  let seedsBefore: string[] = [];
  let seedsAfter: string[] = [];
  if (learned && learned.toVersion > learned.fromVersion) {
    const [items, versions] = await Promise.all([
      db().from("profile_items").select("*").eq("profile_id", profile.id).eq("added_in_version", learned.toVersion).neq("status", "excluded").order("created_at"),
      db().from("profile_versions").select("version,seeds").eq("profile_id", profile.id).in("version", [learned.fromVersion, learned.toVersion]),
    ]);
    newItems = (items.data ?? []) as ProfileItem[];
    const seedNames = (v: number) => ((versions.data ?? []).find((x) => x.version === v)?.seeds ?? []).map((s: { name: string }) => s.name);
    seedsBefore = seedNames(learned.fromVersion);
    seedsAfter = seedNames(learned.toVersion);
  }

  return (
    <AfterSession
      sessionId={session.id}
      profileId={profile.id}
      firstName={profile.first_name}
      canEdit={canEdit}
      learned={learned}
      newItems={newItems}
      seedsBefore={seedsBefore}
      seedsAfter={seedsAfter}
    />
  );
}
