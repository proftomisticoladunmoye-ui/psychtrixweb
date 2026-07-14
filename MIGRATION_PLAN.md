# Migration Plan: Supabase → Neon Postgres + Custom Backend on Render

**Status:** In progress (started 2026-07-15)
**Target stack:** Node/Express backend + Neon Postgres, deployed as a single Render
web service that also serves the built Vite frontend (same shape as Capability IQ).

## Why

- Owner wants full control of database and hosting (moving off Supabase).
- Hosting consolidates on Render; database on Neon — the stack already proven by
  the owner's Capability IQ deployment.
- The Supabase-specific R-analysis edge function chain is dropped for now (the R
  Plumber server it fronts was never deployed).

## Current Supabase footprint (measured)

- **29 tables** (all confirmed to exist): datasets, analyses, reports,
  sandbox_scale_projects, scale_responses, analysis_history, cultural_groups,
  translation_items, cultural_responses, forum_admins, forum_posts, forum_replies,
  notifications, user_notification_preferences, cat_item_banks, cat_items,
  cat_sessions, cat_session_responses, network_projects, network_datasets,
  network_estimations, network_centrality, network_communities, network_stability,
  plssem_models, r_analysis_jobs, r_analysis_templates, r_analysis_logs,
  r_analysis_reports
- **Auth**: supabase.auth used in ~50 call sites; API surface actually used:
  `getSession`, `getUser`, `onAuthStateChange`, `signInWithPassword`, `signUp`,
  `signOut`, `updateUser`
- **1 RPC**: `increment_forum_post_views`
- **1 edge function**: `r-analysis-executor` (dropped, see above)
- **Real data exists** and must be preserved → pg_dump export before cutover.

## Architecture

```
Browser (Vite/React SPA)
   │  /api/*  (session token in Authorization header)
   ▼
Express server (server/index.js)          ← one Render web service
   ├─ /api/auth/*      signup, signin, signout, me, update  (server/auth.js)
   ├─ /api/db/:table   generic CRUD with per-table ownership rules (server/tables.js)
   ├─ /api/rpc/*       the one RPC, reimplemented as SQL
   └─ static           serves dist/ (built frontend)
   ▼
Neon Postgres (DATABASE_URL)
```

**Frontend strategy — compatibility shim.** Instead of rewriting ~50 call sites,
`src/lib/supabase.ts` is replaced by a client that exposes the same small API
surface (`supabase.auth.*`, `supabase.from(...).select().eq()...`, `supabase.rpc`)
but issues fetch calls to `/api`. Call sites stay untouched; the shim is the only
file that knows the backend changed. Supabase's RLS policies become explicit
per-table ownership rules in `server/tables.js`.

## Phases

1. **Scaffold backend** (this commit): server/, auth, generic table router,
   render.yaml, dev proxy. ✅
2. **Export from Supabase**: owner runs pg_dump (schema + data + auth.users);
   commands prepared in `scripts/export-supabase.md`. Password never leaves the
   owner's terminal.
3. **Schema on Neon**: adapt dumped DDL (strip Supabase-specific schemas/roles/
   RLS; convert `auth.users` references to our own `users` table), load data.
4. **Auth migration**: Supabase stores bcrypt password hashes in `auth.users` —
   these are importable (bcrypt verify at login), so existing users keep their
   passwords where possible; otherwise a one-time password reset flow.
5. **Swap the shim** and verify every module against the new backend.
6. **Deploy**: Render blueprint, DATABASE_URL from Neon, cutover, verify live.

## After migration (separate workstreams)

- Fix broken modules (validity suite, path analysis, PLS-SEM, adaptive testing,
  network analysis, sandbox, cultural adaptation).
- Statistical correctness benchmarking vs reference software (lavaan/AMOS,
  mirt/IRTPRO) using canonical datasets; then speed (web workers).
