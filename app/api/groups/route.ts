import { z } from "zod";
import { db } from "@/lib/db";
import { ndjsonStream } from "@/lib/agent/events";
import { buildGroup, createGroup } from "@/lib/agent/group";
import type { Profile } from "@/lib/profiles";
import { allow, clientIp } from "@/lib/rate-limit";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 120;

const Body = z.object({ name: z.string().trim().min(1).max(40), memberIds: z.array(z.string().uuid()).min(2).max(5) });

/** Facility mode: creates a group profile from residents and streams its build. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pick between 2 and 5 residents and give the group a name." }, { status: 400 });
  const workspaceId = await getWorkspaceId();
  if (!(await allow(`agent:ws:${workspaceId}`, 12, 3600)) || !(await allow(`agent:ip:${clientIp(req)}`, 30, 3600))) {
    return Response.json({ error: "Encore has done a lot of thinking for you this hour. Please try again a bit later." }, { status: 429 });
  }
  const { data } = await db().from("profiles").select("*").eq("workspace_id", workspaceId).eq("kind", "person").in("id", parsed.data.memberIds).gte("version", 1);
  const members = (data ?? []) as Profile[];
  if (members.length < 2) return Response.json({ error: "Those residents aren’t ready yet." }, { status: 400 });

  const group = await createGroup(workspaceId, parsed.data.name, members);
  return ndjsonStream(async (emit) => {
    emit({ t: "run", runId: group.id });
    await buildGroup(group, members, emit);
  });
}
