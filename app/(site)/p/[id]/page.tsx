import { notFound } from "next/navigation";
import { ProfileView } from "@/components/ProfileView";
import { reminiscenceWindow } from "@/lib/era";
import { db } from "@/lib/db";
import { getViewableProfile, loadProfileBundle } from "@/lib/profiles";
import type { SessionRow } from "@/lib/sessions";
import { getWorkspaceId } from "@/lib/workspace";

export default async function ProfilePage({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  const workspaceId = await getWorkspaceId();
  const profile = await getViewableProfile(id, workspaceId);
  if (!profile) notFound();
  const { seeds, avoid, items, lastRun } = await loadProfileBundle(profile.id);
  const canEdit = profile.workspace_id === workspaceId;
  const members =
    profile.kind === "group" && profile.member_ids.length
      ? (((await db().from("profiles").select("id,first_name,birth_year").in("id", profile.member_ids)).data ?? []) as { id: string; first_name: string; birth_year: number }[])
      : [];
  const { data: sessionRows } = canEdit
    ? await db().from("sessions").select("id,plan,created_at,started_at,learned").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(8)
    : { data: [] };

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
        members: members.map((m) => ({ id: m.id, firstName: m.first_name, birthYear: m.birth_year })),
      }}
      window={reminiscenceWindow(profile.birth_year)}
      items={items}
      seeds={seeds.map((s) => (s.kind === "food" ? s.raw_text : (s.name ?? s.raw_text)))}
      avoid={avoid.filter((a) => a.source === "caregiver").map((a) => a.raw_text)}
      steps={lastRun?.steps ?? []}
      canEdit={canEdit}
      needsBuild={profile.version === 0 && lastRun?.status !== "running"}
      sessions={((sessionRows ?? []) as Pick<SessionRow, "id" | "plan" | "created_at" | "started_at" | "learned">[]).map((s) => ({
        id: s.id,
        title: s.plan.title,
        createdAt: s.created_at,
        started: Boolean(s.started_at),
        done: Boolean(s.learned),
      }))}
    />
  );
}
