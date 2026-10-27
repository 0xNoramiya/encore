import { z } from "zod";
import { commonGround } from "@/lib/agent/common-ground";
import { getViewableProfile } from "@/lib/profiles";
import { allow, clientIp } from "@/lib/rate-limit";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 60;

const Body = z.object({ profileId: z.string().uuid(), loves: z.array(z.string().trim().min(1).max(120)).min(1).max(3) });

/** Common Ground: what a caregiver and their loved one can enjoy together (Qloo compare + insights). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Add one to three of your own favourites." }, { status: 400 });
  const profile = await getViewableProfile(parsed.data.profileId, await getWorkspaceId());
  if (!profile || profile.kind === "group") return Response.json({ error: "Profile not found" }, { status: 404 });
  if (!(await allow(`common:ip:${clientIp(req)}`, 30, 3600))) return Response.json({ error: "Please try again a bit later." }, { status: 429 });
  try {
    const result = await commonGround(profile, parsed.data.loves);
    if (!result.mine.length) return Response.json({ error: "Qloo didn’t recognise those. Try a singer, film or TV show by name." }, { status: 422 });
    return Response.json(result);
  } catch (e) {
    console.error("common ground failed", e);
    return Response.json({ error: "Couldn’t reach the taste graph. Try again in a moment." }, { status: 502 });
  }
}
