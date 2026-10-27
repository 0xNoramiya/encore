import { z } from "zod";
import { genericSession } from "@/lib/agent/generic";
import { getViewableProfile } from "@/lib/profiles";
import { allow, clientIp } from "@/lib/rate-limit";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 90;

const Body = z.object({ profileId: z.string().uuid() });

/** LLM-only baseline (no tools, no Qloo) for the comparison toggle. Cached per profile. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const workspaceId = await getWorkspaceId();
  const profile = await getViewableProfile(parsed.data.profileId, workspaceId);
  if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });
  if (!(await allow(`generic:ip:${clientIp(req)}`, 30, 3600))) return Response.json({ error: "Please try again later." }, { status: 429 });
  try {
    return Response.json({ plan: await genericSession(profile) });
  } catch (e) {
    console.error("generic failed", e);
    return Response.json({ error: "The comparison couldn’t be generated right now." }, { status: 500 });
  }
}
