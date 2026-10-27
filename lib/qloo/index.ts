import { db } from "../db";
import { createQlooClient, memoryCache, type QlooCache } from "./client";

/** Memory in front of Postgres. Cache failures never fail a request. */
function dbCache(): QlooCache {
  const mem = memoryCache(1000);
  return {
    async get(key) {
      const hit = await mem.get(key);
      if (hit !== undefined) return hit;
      const { data, error } = await db().from("qloo_cache").select("response").eq("hash", key).maybeSingle();
      if (error) {
        console.warn("qloo_cache read failed", error.message);
        return undefined;
      }
      if (data) await mem.set(key, "", {}, data.response);
      return data?.response;
    },
    async set(key, endpoint, params, value) {
      await mem.set(key, endpoint, params, value);
      const { error } = await db().from("qloo_cache").upsert({ hash: key, endpoint, params, response: value });
      if (error) console.warn("qloo_cache write failed", error.message);
    },
  };
}

const globalForQloo = globalThis as unknown as { qloo?: ReturnType<typeof createQlooClient> };

export const qloo = globalForQloo.qloo ?? createQlooClient({ cache: dbCache() });
if (process.env.NODE_ENV !== "production") globalForQloo.qloo = qloo;

export * from "./client";
export type { QlooEntity, QlooTag } from "./types";
