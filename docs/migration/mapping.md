# Legacy mapping

The column catalog generated from the dump is `docs/legacy/column-catalog.json`. The Prisma schema in `prisma/schema.prisma` is produced from that catalog by `scripts/legacy/build-prisma.mjs`.

Direct tables keep their names and primary keys. Identity is preserved, so `id_maps` stores one `preserve_legacy_id` strategy row per loaded table rather than one row per source id.

Excluded from business tables, and counted as excluded in the reconciliation report: `failed_jobs`, `password_resets`, and `migrations`.

Archived into `payment_snapshots` instead of being merged into `payments`: the payment backup tables identified by the catalog as `archive_snapshot`.

Transformations:

- `0000-00-00` dates become null and increment the transformed count.
- NUL bytes are stripped from text.
- `medicals.created_at` and `updated_at` were dates and become UTC timestamps at midnight.
- `candidates.linkedin_link` was `varbinary` and becomes text.
- `manpower_trainings.traininig_end_date` is mapped to `training_end_date`.
- `candidates.replaced_by_candidate_id` and `categories.parent_id` are applied after the base insert. A failed self-reference is quarantined and the column stays null.
- Users whose `role_id` does not match a role are inserted with `role_id` null. The quarantine reason `role_id_missing_nulled` records that exception; the user row itself is counted as inserted.
- Bank columns on `agenciers`, `invoices`, `ticket_companies`, and `ticket_invoices` are copied into `bank_accounts`. The original columns remain.
- Sentinel `0` on payment agent ids is kept. Those columns do not get foreign keys.
- `invoice_no` is not unique, because the source already contains duplicates.
- `agents.balance` is `DECIMAL(24, 8)`. One source value has 8 fractional digits, and `DECIMAL(15, 4)` would have rounded it.

The loader copies the dump, hashes that snapshot once, stages NDJSON, and inserts with `ON CONFLICT DO NOTHING`. A rerun counts conflicts as skipped. Source rows must equal inserted + skipped + quarantined + excluded.

This path refuses any host other than `localhost` or `127.0.0.1`, refuses a database name containing `prod`, and requires `MMS_ALLOW_MIGRATION=local-dev`. It is not a production cutover.
