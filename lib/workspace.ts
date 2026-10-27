import { cookies } from "next/headers";
import { db } from "./db";
import { WS_COOKIE } from "./workspace-cookie";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The visitor's workspace id (cookie set by proxy.ts), with its row ensured. */
export async function getWorkspaceId(): Promise<string> {
  const id = (await cookies()).get(WS_COOKIE)?.value;
  if (!id || !UUID.test(id)) throw new Error("Missing workspace cookie");
  const { error } = await db().from("workspaces").upsert({ id }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`workspace upsert: ${error.message}`);
  return id;
}
