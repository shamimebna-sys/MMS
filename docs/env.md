# Environment

Copy `.env.example` to `.env`. Do not commit `.env`.

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Primary local development database for the app, Prisma, and scripts. Automated tests must not use it. Do not change an existing `.env` value so that tests can run. |
| `DATABASE_URL_TEST` | Isolated test database. Integration tests accept only `127.0.0.1`, port `54329`, and database `mms_test`. `npm test` and `npm run test:unit` read this variable and do not fall back to `DATABASE_URL`. |
| `AUTH_SECRET` | HS256 secret, at least 32 characters |
| `AUTH_ISSUER` | JWT issuer, `mms` |
| `AUTH_AUDIENCE` | JWT audience, `mms-web` |
| `BOOTSTRAP_ADMIN_EMAIL` | New admin email, default `bootstrap.admin@mms.local` |
| `BOOTSTRAP_ADMIN_PASSWORD` | Optional. Empty generates a password file |
| `MMS_ALLOW_MIGRATION` | Must be `local-dev` to run the legacy loader |
| `LEGACY_DUMP_PATH` | Path to the MariaDB dump, default `./docs/db.txt` |
| `UPLOAD_DIR` | Upload root, default `./data/uploads` |
| `APP_URL` | Absolute app URL used in reset links |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Outbound mail. Empty host stores reset messages as local files |
| `PDF_FONT_PATH` | Optional TrueType font. Falls back to `assets/fonts/Roboto-Regular.ttf`, then Windows Arial |

`data/db-password.local.txt` and `data/bootstrap-admin.local.txt` are gitignored with the rest of `data/`.
