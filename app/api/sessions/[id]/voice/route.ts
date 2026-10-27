import { langCode } from "@/lib/languages";
import { allow, clientIp } from "@/lib/rate-limit";
import { getViewableSession } from "@/lib/sessions";
import { promptAudio, voiceEnabled } from "@/lib/voice";
import { getWorkspaceId } from "@/lib/workspace";

/**
 * Speaks one item's caregiver prompt. Only text already in the session plan can
 * be voiced (never arbitrary input), and fresh generations are rate-limited.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/sessions/[id]/voice">) {
  if (!voiceEnabled()) return Response.json({ error: "Voice is not set up" }, { status: 503 });
  const { id } = await params;
  const url = new URL(req.url);
  const entityId = url.searchParams.get("entity") ?? "";
  const wantAlt = url.searchParams.get("lang") === "alt";

  const found = await getViewableSession(id, await getWorkspaceId());
  const item = found?.session.plan.items.find((i) => i.entityId === entityId);
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });

  const alt = wantAlt ? item.promptAlt : undefined;
  const text = alt ? alt.text : item.prompt;
  const code = alt ? (langCode(alt.lang) ?? "en") : "en";

  if (!(await allow(`voice:ip:${clientIp(req)}`, 200, 3600))) return Response.json({ error: "Please try again a bit later." }, { status: 429 });
  try {
    const { audio, cached } = await promptAudio(text, code);
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400", "X-Voice-Cache": cached ? "hit" : "miss" },
    });
  } catch (e) {
    console.error("voice failed", e);
    return Response.json({ error: "The voice isn’t available right now." }, { status: 502 });
  }
}
