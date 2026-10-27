import { z } from "zod";
import { ndjsonStream } from "@/lib/agent/events";
import { runLearn } from "@/lib/agent/learn";
import { allow, clientIp } from "@/lib/rate-limit";
import { getViewableSession } from "@/lib/sessions";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 300;

const Body = z.object({ sessionId: z.string().uuid() });

/** Applies a session's reactions, explains them, and streams the profile expansion. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const workspaceId = await getWorkspaceId();
  const found = await getViewableSession(parsed.data.sessionId, workspaceId);
  if (!found?.canEdit) return Response.json({ error: "Session not found" }, { status: 404 });
  if (!found.session.learned && (!(await allow(`agent:ws:${workspaceId}`, 12, 3600)) || !(await allow(`agent:ip:${clientIp(req)}`, 30, 3600)))) {
    return Response.json({ error: "Encore has done a lot of thinking for you this hour. Please try again a bit later." }, { status: 429 });
  }
  return ndjsonStream((emit) => runLearn(found.session, found.profile, emit));
}
