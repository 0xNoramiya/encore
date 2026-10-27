/**
 * Typed Qloo client. Server-side only: it reads QLOO_API_KEY.
 *
 * Every call returns { data, trace } so the agent can log each request in the
 * "How Encore thought" panel. Responses are cached by request hash; the default
 * cache is in-memory, and the app swaps in the Postgres cache (qloo_cache table).
 * Qloo data may be cached privately but never committed to the repo.
 */
import { createHash } from "node:crypto";
import { normalizeAggregate, normalizeEntity, normalizeTag } from "./normalize";
import { validateInsightsParams, type EntityType, type InsightsParams } from "./params";
import type { AggregateExplainability, QlooEntity, QlooTag, RawEntity } from "./types";

export type QlooEndpoint = "/search" | "/v2/insights" | "/v2/tags" | "/entities" | "/v2/insights/compare";

export interface QlooTrace {
  endpoint: QlooEndpoint;
  params: InsightsParams;
  status: number;
  ms: number;
  cached: boolean;
  count: number;
}

export interface QlooResult<T> {
  data: T;
  trace: QlooTrace;
}

export interface QlooCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, endpoint: string, params: InsightsParams, value: unknown): Promise<void>;
}

export type QlooErrorKind = "auth" | "bad_request" | "not_found" | "rate_limited" | "server" | "network";

export class QlooApiError extends Error {
  constructor(
    public kind: QlooErrorKind,
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "QlooApiError";
  }
}

export function memoryCache(max = 500): QlooCache {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.get(key);
    },
    async set(key, _endpoint, _params, value) {
      if (map.size >= max) map.delete(map.keys().next().value!);
      map.set(key, value);
    },
  };
}

export function requestHash(endpoint: string, params: InsightsParams): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha256").update(`${endpoint}?${sorted}`).digest("hex");
}

function errorKind(status: number): QlooErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "bad_request";
}

const RETRYABLE = new Set<QlooErrorKind>(["rate_limited", "server", "network"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface QlooClientOptions {
  apiKey?: string;
  baseUrl?: string;
  cache?: QlooCache;
  fetch?: typeof fetch;
  retries?: number;
  timeoutMs?: number;
}

export interface SearchOptions {
  types?: EntityType | EntityType[] | string;
  take?: number;
  /** WKT POINT(lon lat), lat,lon or a Qloo locality ID. */
  location?: string;
  radiusMiles?: number;
}

export interface InsightsData {
  entities: QlooEntity[];
  aggregate?: AggregateExplainability;
}

export function createQlooClient(opts: QlooClientOptions = {}) {
  const apiKey = opts.apiKey ?? process.env.QLOO_API_KEY;
  const baseUrl = opts.baseUrl ?? process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";
  const cache = opts.cache ?? memoryCache();
  const doFetch = opts.fetch ?? fetch;
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 25_000;

  async function request<T>(endpoint: QlooEndpoint, params: InsightsParams, count: (body: T) => number): Promise<QlooResult<T>> {
    if (!apiKey) throw new QlooApiError("auth", 0, "QLOO_API_KEY is not set");
    const key = requestHash(endpoint, params);
    const t0 = Date.now();

    const hit = (await cache.get(key)) as T | undefined;
    if (hit !== undefined) {
      return { data: hit, trace: { endpoint, params, status: 200, ms: Date.now() - t0, cached: true, count: count(hit) } };
    }

    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    let lastError: QlooApiError | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(400 * 2 ** (attempt - 1));
      let res: Response;
      try {
        res = await doFetch(`${baseUrl}${endpoint}?${qs}`, {
          headers: { "X-Api-Key": apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });
      } catch (e) {
        lastError = new QlooApiError("network", 0, `Qloo ${endpoint} request failed: ${(e as Error).message}`);
        continue;
      }

      if (res.ok) {
        const body = (await res.json()) as T;
        await cache.set(key, endpoint, params, body);
        return { data: body, trace: { endpoint, params, status: res.status, ms: Date.now() - t0, cached: false, count: count(body) } };
      }

      const kind = errorKind(res.status);
      const text = await res.text().catch(() => "");
      let detail = text.slice(0, 300);
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.errors)) detail = parsed.errors.map((e: { path?: string; message: string }) => `${e.path ?? ""}: ${e.message}`).join("; ");
        else if (parsed.error?.message) detail = parsed.error.message;
      } catch {
        // non-JSON error body: keep the raw text
      }
      lastError = new QlooApiError(kind, res.status, `Qloo ${endpoint} ${res.status}: ${detail}`);
      if (!RETRYABLE.has(kind)) break;
    }
    throw lastError!;
  }

  return {
    /** Resolve free text to entities. Results are ordered by Qloo relevance. */
    async search(query: string, o: SearchOptions = {}): Promise<QlooResult<QlooEntity[]>> {
      const params: InsightsParams = { query, take: o.take ?? 5 };
      if (o.types) params.types = Array.isArray(o.types) ? o.types.join(",") : o.types;
      if (o.location) params["filter.location"] = o.location;
      if (o.radiusMiles !== undefined) params["filter.radius"] = o.radiusMiles;
      const r = await request<{ results?: RawEntity[] }>("/search", params, (b) => b.results?.length ?? 0);
      return { data: (r.data.results ?? []).map(normalizeEntity), trace: r.trace };
    },

    /** /v2/insights. Always requests explainability; params are whitelist-validated per type. */
    async insights(params: InsightsParams): Promise<QlooResult<InsightsData>> {
      const valid = validateInsightsParams({ ...params, "feature.explainability": true });
      type Body = { results?: { entities?: RawEntity[] }; query?: { explainability?: { "signal.interests.entities"?: Parameters<typeof normalizeAggregate>[0] } } };
      const r = await request<Body>("/v2/insights", valid, (b) => b.results?.entities?.length ?? 0);
      return {
        data: {
          entities: (r.data.results?.entities ?? []).map(normalizeEntity),
          aggregate: normalizeAggregate(r.data.query?.explainability?.["signal.interests.entities"]),
        },
        trace: r.trace,
      };
    },

    /** Find real tag IDs (urn:tag:...) for free text like "horror" or "deli". */
    async tags(query: string, o: { take?: number; typoTolerance?: boolean; semantic?: boolean; parentType?: string } = {}): Promise<QlooResult<QlooTag[]>> {
      const params: InsightsParams = { "filter.query": query, take: o.take ?? 10 };
      if (o.typoTolerance) params["feature.typo_tolerance"] = true;
      if (o.semantic) params["feature.semantic_search"] = true;
      if (o.parentType) params["filter.parents.types"] = o.parentType;
      type Body = { results?: { tags?: Parameters<typeof normalizeTag>[0][] } };
      const r = await request<Body>("/v2/tags", params, (b) => b.results?.tags?.length ?? 0);
      return { data: (r.data.results?.tags ?? []).map(normalizeTag), trace: r.trace };
    },

    async entities(ids: string[]): Promise<QlooResult<QlooEntity[]>> {
      const r = await request<{ results?: RawEntity[] }>("/entities", { entity_ids: ids.join(",") }, (b) => b.results?.length ?? 0);
      return { data: (r.data.results ?? []).map(normalizeEntity), trace: r.trace };
    },

    /** Analysis Compare: shared taste between two groups of entities (raw body for now; used by Common Ground). */
    async compare(a: string[], b: string[], take = 10): Promise<QlooResult<unknown>> {
      return request<{ results?: { tags?: unknown[] } }>(
        "/v2/insights/compare",
        { "a.signal.interests.entities": a.join(","), "b.signal.interests.entities": b.join(","), take },
        (body) => body.results?.tags?.length ?? 0,
      );
    },
  };
}

export type QlooClient = ReturnType<typeof createQlooClient>;
