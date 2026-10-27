/**
 * Apply supabase/migrations/*.sql through the Supabase Management API.
 *
 *   npm run migrate
 *
 * Needs SUPABASE_ACCESS_TOKEN (personal access token) and SUPABASE_URL. Applied
 * files are recorded in the _migrations table so each runs once.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!token || !ref) throw new Error("SUPABASE_ACCESS_TOKEN and SUPABASE_URL are required");

async function query(sql: string): Promise<unknown[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${body}`);
  return JSON.parse(body);
}

await query("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now()); alter table _migrations enable row level security;");
const applied = new Set(((await query("select name from _migrations")) as { name: string }[]).map((r) => r.name));
const dir = join(process.cwd(), "supabase/migrations");

for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(file)) continue;
  const sql = readFileSync(join(dir, file), "utf8");
  await query(`begin;\n${sql}\ninsert into _migrations (name) values ('${file.replace(/'/g, "''")}');\ncommit;`);
  console.log(`applied ${file}`);
}
console.log("migrations up to date");
