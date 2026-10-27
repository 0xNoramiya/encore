import { db, must } from "./db";
import type { Domain } from "./domains";

export interface Profile {
  id: string;
  workspace_id: string | null;
  first_name: string;
  birth_year: number;
  hometown: string;
  country_name: string | null;
  film_country: string | null;
  locality_id: string | null;
  lat: number | null;
  lon: number | null;
  languages: string[];
  is_persona_template: boolean;
  persona_key: string | null;
  version: number;
  summary: string | null;
  created_at: string;
}

export interface Seed {
  id: string;
  raw_text: string;
  kind: "entity" | "food";
  entity_id: string | null;
  entity_type: string | null;
  name: string | null;
  year: number | null;
  image: string | null;
  tag_id: string | null;
  confirmed: boolean;
  promoted_in_version: number | null;
}

export interface AvoidItem {
  id: string;
  raw_text: string;
  entity_id: string | null;
  tag_id: string | null;
  source: "caregiver" | "default" | "learned";
}

export interface Why {
  entityId: string;
  name: string;
  score: number;
}

export interface Media {
  image?: string;
  spotifyEmbed?: string;
  youtubeId?: string;
  youtubeSearch?: string;
  song?: string;
  trailerQuery?: string;
  mapsUrl?: string;
  address?: string;
}

export interface ProfileItem {
  id: string;
  profile_id: string;
  entity_id: string;
  entity_type: string;
  domain: Domain;
  name: string;
  year: number | null;
  weight: number;
  status: "active" | "promoted" | "excluded";
  reason: string | null;
  why: Why[];
  media: Media | null;
  data: { image?: string; description?: string; tags?: string[]; notableSongs?: string[]; address?: string; popularity?: number; external?: Record<string, string> };
  added_in_version: number;
}

export interface AgentStep {
  id: string;
  kind: "deterministic" | "tool" | "thought";
  tool?: string;
  label: string;
  input?: unknown;
  status: "running" | "done" | "error";
  summary?: string;
  qloo?: { endpoint: string; params: Record<string, unknown>; ms: number; cached: boolean; count: number }[];
  ms?: number;
}

export interface AgentRun {
  id: string;
  kind: string;
  status: "running" | "done" | "error";
  steps: AgentStep[];
  output: unknown;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

/** A profile the visitor may see: their own, or a read-only persona template. */
export async function getViewableProfile(id: string, workspaceId: string): Promise<Profile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const p = must(await db().from("profiles").select("*").eq("id", id).maybeSingle(), "profile") as Profile | null;
  if (!p) return null;
  if (p.is_persona_template || p.workspace_id === workspaceId) return p;
  return null;
}

export async function getOwnedProfile(id: string, workspaceId: string): Promise<Profile | null> {
  const p = await getViewableProfile(id, workspaceId);
  return p && p.workspace_id === workspaceId ? p : null;
}

export async function loadProfileBundle(profileId: string) {
  const [seeds, avoid, items, run] = await Promise.all([
    db().from("seeds").select("*").eq("profile_id", profileId).order("created_at"),
    db().from("avoid_items").select("*").eq("profile_id", profileId).order("created_at"),
    db().from("profile_items").select("*").eq("profile_id", profileId).order("weight", { ascending: false }).order("created_at"),
    db().from("agent_runs").select("*").eq("profile_id", profileId).eq("kind", "profile").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    seeds: must(seeds, "seeds") as Seed[],
    avoid: must(avoid, "avoid_items") as AvoidItem[],
    items: must(items, "profile_items") as ProfileItem[],
    lastRun: must(run, "agent_runs") as AgentRun | null,
  };
}

export async function listWorkspaceProfiles(workspaceId: string): Promise<Profile[]> {
  return must(await db().from("profiles").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }), "profiles") as Profile[];
}
