import { db } from "./db";

/** Fixed-window limiter backed by the hit_rate_limit() SQL function. Fails open. */
export async function allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await db().rpc("hit_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    console.warn("rate limit check failed", error.message);
    return true;
  }
  return data === true;
}

export function clientIp(req: Request): string {
  return req.headers.get("fly-client-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}
