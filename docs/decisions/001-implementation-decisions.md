# Implementation decisions

These choices were applied when implementation was approved. They are recorded so the migration does not invent official geography or drop rows quietly.

1. Districts 65, 66, and 72 are inserted as placeholder rows. `division_id` is null. Names are `Legacy district 65`, `Legacy district 66`, and `Legacy district 72`. URLs are `unverified-65.local`, `unverified-66.local`, and `unverified-72.local`. `verification_status` is `unverified_legacy_reference`. Official names were not invented and the thanas that point at these ids were not discarded.
2. Every notification and notification class-group row is migrated, in batches. Nothing from those tables is sampled away.
3. Payment backup tables are archived into `payment_snapshots`. They are not merged into live `payments`.
4. Table names `agenciers` and `companiers` are kept.
5. Legacy file binaries are not in this workspace. Only `file_path` metadata is migrated.
6. CMS tables are migrated and shown read-only. This application is not a CMS editor.
7. Every user row is migrated. Accounts are not purged. A new admin is created after migration and does not replace a legacy password hash.
8. PostgreSQL 16.11 portable binaries run locally on `127.0.0.1:54329` because a system PostgreSQL install was not available. Node remains on the installed 20.x release, which meets Next.js 16.

The MariaDB dump sets `time_zone = "+00:00"`. Timestamps are stored as UTC. That replaces an earlier assumption that the dump was UTC+6.

Many candidate accounts share one legacy password hash. The hash is not published and is not cracked. `remember_token` values are redacted from quarantine payloads.
