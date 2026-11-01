# Architecture

ManPower Management is a Next.js 16 App Router application for E & A AIR INTERNATIONAL. The database is PostgreSQL 16. Prisma 7 talks to it through `@prisma/adapter-pg`. A separate `pg` pool, maximum 20 connections, is used for search, dashboard aggregates, exports, and the migration.

Authentication is an HTTP-only `SameSite=Strict` cookie named `mms_session`. The cookie holds an HS256 JWT (`iss=mms`, `aud=mms-web`) signed with `jose`. The database `sessions` table is the revocation record. `src/proxy.ts` checks the signature, issuer, audience, and expiry only. Server layouts and actions load the session and reject revoked, inactive, or absolutely expired sessions. A session lasts at most 8 hours. The JWT slides forward in 30-minute windows until that absolute end. Five failed logins for an email lock that email for 15 minutes.

Roles `sadmin`, `admin`, and `owner` are unrestricted. Other roles need Voyager-style `browse_`, `read_`, `edit_`, `add_`, and `delete_` permissions. Hiding a navigation link is not authorization. List and detail queries add a SQL predicate from `recordScope`: agents see their own party, candidates see their own record, and sub-agents, agenciers, and companiers are scoped the same way.

Money stays in `DECIMAL`. Exports prefix spreadsheet cells that start with `=`, `+`, `-`, `@`, tab, or carriage return. Uploads accept PDF, JPEG, PNG, and WebP up to 8 MB, are checked with Sharp or a PDF header, and are stored under `data/uploads` with a generated name. Downloads resolve the stored relative path and refuse anything outside that directory.

Background work uses the `jobs` table with `FOR UPDATE SKIP LOCKED`. Redis is not used. PM2 is configured to run the web process and `scripts/jobs/worker.ts`.

Private pages are `force-dynamic`. The pipeline dashboard counts related rows. It does not invent an interview completion rule, because the legacy schema has no interview tick.
