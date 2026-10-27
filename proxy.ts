import { NextResponse, type NextRequest } from "next/server";
import { WS_COOKIE } from "@/lib/workspace-cookie";

/** Gives every visitor an anonymous workspace id. No login, ever. */
export function proxy(request: NextRequest) {
  if (request.cookies.get(WS_COOKIE)) return NextResponse.next();
  const id = crypto.randomUUID();
  request.cookies.set(WS_COOKIE, id);
  const res = NextResponse.next({ request: { headers: request.headers } });
  res.cookies.set(WS_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
