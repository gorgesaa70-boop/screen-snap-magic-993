// Applies every migration to an in-memory Postgres (with Supabase stubs) and runs permission checks.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// PGlite is not a project dependency: install it in any folder and pass that folder as PGLITE_DIR.
const pgliteDir = process.env.PGLITE_DIR;
if (!pgliteDir) { console.log("Set PGLITE_DIR to a folder where @electric-sql/pglite is installed (see README.md)."); process.exit(2); }
const toUrl = (p) => pathToFileURL(path.resolve(p)).href;
const { PGlite } = await import(toUrl(path.join(pgliteDir, "node_modules/@electric-sql/pglite/dist/index.js")));

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] ?? path.join(here, "../migrations");
const testFile = process.argv[3] ?? path.join(here, "permissions.test.mjs");
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth; create schema storage;
  grant usage on schema auth, storage to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, phone text, email text, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  create publication supabase_realtime;
`);

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  try { await db.exec(`begin;\n${fs.readFileSync(path.join(dir, f), "utf8")}\ncommit;`); }
  catch (e) { console.log(`MIGRATION FAILED: ${f}\n  ${e.message}`); await db.exec("rollback").catch(() => {}); process.exit(1); }
}
console.log(`applied ${files.length} migrations`);

// Test helpers: run SQL as a given user (null = anon).
let pass = 0, fail = 0;
async function as(uid, sql, params = []) {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`, [uid ?? "", uid ? "authenticated" : "anon"]);
    await db.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    const r = await db.query(sql, params);
    await db.exec("commit");
    return r.rows;
  } catch (e) { await db.exec("rollback"); throw e; }
}
const sys = (sql, params = []) => db.query(sql, params).then((r) => r.rows);
async function expectOk(name, fn, check) {
  try { const r = await fn(); if (check && !check(r)) throw new Error("check failed: " + JSON.stringify(r)); pass++; console.log("  ok   " + name); }
  catch (e) { fail++; console.log("  FAIL " + name + " — " + e.message); }
}
async function expectErr(name, fn) {
  try { const r = await fn(); fail++; console.log("  FAIL " + name + " — expected error, got " + JSON.stringify(r)); }
  catch { pass++; console.log("  ok   " + name); }
}
const { default: tests } = await import(toUrl(testFile));
await tests({ as, sys, expectOk, expectErr });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
