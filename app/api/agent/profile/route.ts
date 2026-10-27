import { z } from "zod";
import { db } from "@/lib/db";
import { runProfileAgent } from "@/lib/agent/profile";
import { ndjsonStream } from "@/lib/agent/events";
import { getOwnedProfile } from "@/lib/profiles";
import { allow, clientIp } from "@/lib/rate-limit";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 300;

const Body = z.object({ profileId: z.string().uuid(), mode: z.enum(["build", "expand"]).default("build") });

/** Streams the profile agent's steps as NDJSON while it builds the Taste Profile. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const workspaceId = await getWorkspaceId();
  const profile = await getOwnedProfile(parsed.data.profileId, workspaceId);
  if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });

  if (!(await allow(`agent:ws:${workspaceId}`, 12, 3600)) || !(await allow(`agent:ip:${clientIp(req)}`, 30, 3600))) {
    return Response.json({ error: "Encore has done a lot of thinking for you this hour. Please try again a bit later." }, { status: 429 });
  }

  const { data: running } = await db()
    .from("agent_runs")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("kind", "profile")
    .eq("status", "running")
    .gte("created_at", new Date(Date.now() - 4 * 60_000).toISOString())
    .limit(1)
    .maybeSingle();
  if (running) return Response.json({ error: "Already building", runId: running.id }, { status: 409 });

  return ndjsonStream((emit) => runProfileAgent(profile, { mode: parsed.data.mode, emit }));
}
