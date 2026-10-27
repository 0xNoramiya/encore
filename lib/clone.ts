import { db, must } from "./db";
import type { Profile } from "./profiles";

/**
 * Persona templates are read-only. Opening one copies it, with its items,
 * trace, cached comparison and a ready session, into the visitor's workspace,
 * so judges never see each other's reactions.
 */
export async function clonePersona(templateId: string, workspaceId: string): Promise<string> {
  const template = must(await db().from("profiles").select("*").eq("id", templateId).eq("is_persona_template", true).single(), "template") as Profile;

  const existing = must(
    await db().from("profiles").select("id").eq("workspace_id", workspaceId).eq("source_profile_id", template.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    "existing clone",
  ) as { id: string } | null;
  if (existing) return existing.id;

  const { id: _id, created_at: _c, persona_key: _k, ...rest } = template as Profile & { updated_at?: string; source_profile_id?: string | null };
  const clone = must(
    await db()
      .from("profiles")
      .insert({ ...rest, workspace_id: workspaceId, is_persona_template: false, persona_key: null, source_profile_id: template.id })
      .select("id")
      .single(),
    "clone profile",
  ) as { id: string };

  const strip = <T extends Record<string, unknown>>(rows: T[]) => rows.map(({ id: _i, profile_id: _p, ...r }) => ({ ...r, profile_id: clone.id }));
  const [seeds, avoid, items, versions, runs, session] = await Promise.all([
    db().from("seeds").select("*").eq("profile_id", template.id),
    db().from("avoid_items").select("*").eq("profile_id", template.id),
    db().from("profile_items").select("*").eq("profile_id", template.id),
    db().from("profile_versions").select("*").eq("profile_id", template.id),
    db().from("agent_runs").select("*").eq("profile_id", template.id).in("kind", ["profile", "generic"]).eq("status", "done").order("created_at", { ascending: false }),
    db().from("sessions").select("plan,profile_version").eq("profile_id", template.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const latestRuns = (must(runs, "runs") as { kind: string }[]).filter((r, i, all) => all.findIndex((x) => x.kind === r.kind) === i);
  await Promise.all([
    seeds.data?.length ? db().from("seeds").insert(strip(seeds.data)) : null,
    avoid.data?.length ? db().from("avoid_items").insert(strip(avoid.data)) : null,
    items.data?.length ? db().from("profile_items").insert(strip(items.data)) : null,
    versions.data?.length ? db().from("profile_versions").insert(strip(versions.data)) : null,
    latestRuns.length ? db().from("agent_runs").insert(strip(latestRuns as Record<string, unknown>[])) : null,
    session.data ? db().from("sessions").insert({ profile_id: clone.id, profile_version: session.data.profile_version, plan: session.data.plan }) : null,
  ]);
  return clone.id;
}
