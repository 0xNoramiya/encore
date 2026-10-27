import { db, must } from "./db";
import { getViewableProfile, type Profile } from "./profiles";
import type { SessionPlan } from "./session";
import type { Reaction } from "./learning";

export interface SessionRow {
  id: string;
  profile_id: string;
  profile_version: number;
  plan: SessionPlan;
  learned: Learned | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface Learned {
  narrative: string;
  promoted: { entityId: string; name: string; reaction: Reaction }[];
  excluded: { entityId: string; name: string }[];
  excludeTags: { id: string; name: string; because: string }[];
  liked: { entityId: string; name: string; reaction: Reaction }[];
  neutral: { entityId: string; name: string }[];
  fromVersion: number;
  toVersion: number;
}

/** A session plus its profile, if the visitor may see it. */
export async function getViewableSession(id: string, workspaceId: string): Promise<{ session: SessionRow; profile: Profile; canEdit: boolean } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const session = must(await db().from("sessions").select("*").eq("id", id).maybeSingle(), "session") as SessionRow | null;
  if (!session) return null;
  const profile = await getViewableProfile(session.profile_id, workspaceId);
  if (!profile) return null;
  return { session, profile, canEdit: profile.workspace_id === workspaceId };
}
