# Database permission tests

Applies every migration in `supabase/migrations` to an in-memory Postgres (PGlite, no Docker needed)
with small stand-ins for Supabase's `auth` and `storage` schemas, then checks who can see and change what.

```bash
# once, in any folder outside the project:
npm install @electric-sql/pglite@0.3.10
# then, from the project root:
PGLITE_DIR=/path/to/that/folder node supabase/tests/run.mjs
```

Add new checks to `permissions.test.mjs` with every migration that touches access rules.
