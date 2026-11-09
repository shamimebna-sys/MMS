# Local runbook

PostgreSQL 16.11 portable binaries live under `.tools` after the zip is extracted. The cluster data directory is `data/pg`. It listens on `127.0.0.1:54329` as user `mms`, with databases `mms_dev` and `mms_test`. The password is only in `data/db-password.local.txt` and `.env`.

`DATABASE_URL` is the primary local development database. Leave the existing `.env` value unchanged. `DATABASE_URL_TEST` is the isolated test database and must name `mms_test` on `127.0.0.1:54329`. `npm test` and `npm run test:unit` read only `DATABASE_URL_TEST`. They refuse `manpower_db`, any other host, port, or database, a missing or malformed URL, and destructive SQL against the `public` schema. They do not fall back to `DATABASE_URL`. Cleanup is limited to schemas created by the test inside `mms_test`.

Start the cluster with `pg_ctl -D data/pg -l data/pg.log start`. Stop it with `pg_ctl -D data/pg stop`.

Apply schema:

```
npx prisma generate
npx prisma migrate deploy
```

Reference load, then the full legacy load:

```
npm run seed:reference
npm run migrate:legacy -- --stage full
```

The full load reads `docs/db.txt`, writes a snapshot and NDJSON under `data/migration`, and can take a long time because notifications are hundreds of thousands of rows. Read the JSON report in that run directory. `accounted: true` is the row-count check. It does not by itself mean every business rule was reviewed. Quarantine reasons are in `migration_quarantine`.

After a successful full load:

```
npm run bootstrap:admin
```

The new admin password is written to `data/bootstrap-admin.local.txt`. The script does not replace an existing bootstrap user.

Application:

```
npm run dev
npm run jobs:worker
```

Production process shape is `ecosystem.config.cjs` (web on port 3000 and the worker) behind `deploy/nginx.example.conf`. Put TLS certificates on the proxy. Do not commit `.env`, `data/`, or the SQL dumps.

Backup and restore rehearsal, local only:

```
powershell -File scripts/ops/backup.ps1
powershell -File scripts/ops/restore.ps1 -DumpFile data\backups\<file>.dump
```

Restore refuses a file whose name does not start with the local `mms_dev-` backup prefix. Take a fresh backup before a restore. This has not been pointed at a production server.

Health check: unauthenticated `GET /api/health` returns HTTP 200 and `{ "status": "ok" }` when the web process is up. It does not query the database or report component status. A database check sends `Authorization: Bearer` with `HEALTH_CHECK_TOKEN` (at least 32 characters). That request runs `SELECT 1` and returns `{ "ok": true, "db": true, "ms": <elapsed> }`, or HTTP 503 `{ "ok": false, "db": false, "ms": <elapsed> }` when the check fails. Failure responses omit error text, connection details, and stack traces. A missing or wrong token gets the public process response, not an error body. A local load script is `npm run perf:load` against a running server. The target is health-check p95 under 500 ms at 20 concurrent requests on this machine. That is not a claim about production user capacity.

Password reset with SMTP unset writes the message under `data/dev-mail` and shows the user only a generic confirmation.
