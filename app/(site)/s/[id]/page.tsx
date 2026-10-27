import { notFound } from "next/navigation";
import { SessionPreview } from "@/components/SessionPreview";
import { reminiscenceWindow } from "@/lib/era";
import { loadProfileBundle } from "@/lib/profiles";
import { getViewableSession } from "@/lib/sessions";
import { getWorkspaceId } from "@/lib/workspace";

export default async function SessionPage({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  const found = await getViewableSession(id, await getWorkspaceId());
  if (!found) notFound();
  const { session, profile, canEdit } = found;
  const { seeds } = await loadProfileBundle(profile.id);
  return (
    <SessionPreview
      sessionId={session.id}
      profileId={profile.id}
      firstName={profile.first_name}
      plan={session.plan}
      canEdit={canEdit}
      started={Boolean(session.started_at)}
      window={reminiscenceWindow(profile.birth_year)}
      seeds={seeds.map((s) => s.name ?? s.raw_text)}
      seedIds={seeds.filter((s) => s.entity_id).map((s) => s.entity_id!)}
    />
  );
}
