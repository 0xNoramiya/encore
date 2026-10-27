import { z } from "zod";
import { composeSession } from "@/lib/agent/session";
import { getOwnedProfile } from "@/lib/profiles";
import { allow, clientIp } from "@/lib/rate-limit";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 120;

const Body = z.object({ profileId: z.string().uuid() });

/** Composes a session plan (structured output, validated) and returns its id. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const workspaceId = await getWorkspaceId();
  const profile = await getOwnedProfile(parsed.data.profileId, workspaceId);
  if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });
  if (profile.version < 1) return Response.json({ error: "Build the profile first" }, { status: 409 });
  if (!(await allow(`session:ws:${workspaceId}`, 20, 3600)) || !(await allow(`session:ip:${clientIp(req)}`, 40, 3600))) {
    return Response.json({ error: "That’s a lot of sessions for one hour. Please try again later." }, { status: 429 });
  }
  try {
    const { sessionId } = await composeSession(profile);
    return Response.json({ sessionId });
  } catch (e) {
    console.error("compose failed", e);
    return Response.json({ error: "Encore couldn’t put a session together. Please try again." }, { status: 500 });
  }
}
