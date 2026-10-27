import { z } from "zod";
import { db, must } from "@/lib/db";
import { SessionPlanSchema } from "@/lib/session";
import { getViewableSession } from "@/lib/sessions";
import { getWorkspaceId } from "@/lib/workspace";

const Body = z.object({ order: z.array(z.string()).min(1).max(8).optional(), start: z.boolean().optional() });

/** Reorder/remove items in the preview (only existing items, never new ones), or mark the session started. */
export async function PATCH(req: Request, { params }: RouteContext<"/api/sessions/[id]">) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const found = await getViewableSession(id, await getWorkspaceId());
  if (!found?.canEdit) return Response.json({ error: "Session not found" }, { status: 404 });
  const update: Record<string, unknown> = {};
  if (parsed.data.order) {
    const byId = new Map(found.session.plan.items.map((i) => [i.entityId, i]));
    const items = parsed.data.order.map((e) => byId.get(e)).filter((i) => i !== undefined);
    update.plan = SessionPlanSchema.parse({ ...found.session.plan, items });
  }
  if (parsed.data.start && !found.session.started_at) update.started_at = new Date().toISOString();
  if (Object.keys(update).length) must(await db().from("sessions").update(update).eq("id", id), "update session");
  return Response.json({ ok: true });
}
