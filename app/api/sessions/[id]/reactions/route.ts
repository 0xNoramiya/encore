import { z } from "zod";
import { db, must } from "@/lib/db";
import { REACTIONS } from "@/lib/learning";
import { getViewableSession } from "@/lib/sessions";
import { getWorkspaceId } from "@/lib/workspace";

const Body = z.object({ entityId: z.string().min(1).max(64), reaction: z.enum(REACTIONS) });

/** Records one caregiver tap. The latest tap per item wins when learning runs. */
export async function POST(req: Request, { params }: RouteContext<"/api/sessions/[id]/reactions">) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const found = await getViewableSession(id, await getWorkspaceId());
  if (!found?.canEdit) return Response.json({ error: "Session not found" }, { status: 404 });
  if (!found.session.plan.items.some((i) => i.entityId === parsed.data.entityId)) return Response.json({ error: "Not in this session" }, { status: 400 });
  if (!found.session.started_at) await db().from("sessions").update({ started_at: new Date().toISOString() }).eq("id", id);
  must(await db().from("reactions").insert({ session_id: id, profile_id: found.profile.id, entity_id: parsed.data.entityId, reaction: parsed.data.reaction }), "insert reaction");
  return Response.json({ ok: true });
}
