# Local runbook

PostgreSQL 16.11 portable binaries live under `.tools` after the zip is extracted. The cluster data directory is `data/pg`. It listens on `127.0.0.1:54329` as user `mms`, with databases `mms_dev` and `mms_test`. The password is only in `data/db-password.local.txt` and `.env`.

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

Health check: `GET /api/health` runs `SELECT 1`. A local load script is `npm run perf:load` against a running server. The target is health-check p95 under 500 ms at 20 concurrent requests on this machine. That is not a claim about production user capacity.

Password reset with SMTP unset writes the message under `data/dev-mail` and shows the user only a generic confirmation.
