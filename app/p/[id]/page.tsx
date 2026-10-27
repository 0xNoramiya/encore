import { notFound } from "next/navigation";
import { ProfileView } from "@/components/ProfileView";
import { reminiscenceWindow } from "@/lib/era";
import { getViewableProfile, loadProfileBundle } from "@/lib/profiles";
import { getWorkspaceId } from "@/lib/workspace";

export default async function ProfilePage({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  const workspaceId = await getWorkspaceId();
  const profile = await getViewableProfile(id, workspaceId);
  if (!profile) notFound();
  const { seeds, avoid, items, lastRun } = await loadProfileBundle(profile.id);
  const canEdit = profile.workspace_id === workspaceId;

  return (
    <ProfileView
      profile={{
        id: profile.id,
        firstName: profile.first_name,
        birthYear: profile.birth_year,
        hometown: profile.hometown,
        summary: profile.summary,
        version: profile.version,
        isTemplate: profile.is_persona_template,
      }}
      window={reminiscenceWindow(profile.birth_year)}
      items={items}
      seeds={seeds.map((s) => (s.kind === "food" ? s.raw_text : (s.name ?? s.raw_text)))}
      avoid={avoid.filter((a) => a.source === "caregiver").map((a) => a.raw_text)}
      steps={lastRun?.steps ?? []}
      canEdit={canEdit}
      needsBuild={profile.version === 0 && lastRun?.status !== "running"}
    />
  );
}
