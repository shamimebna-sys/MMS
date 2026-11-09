# Next development unlock plan

Date: 2026-11-09
Phase: decision planning only
Sources: `.tools/legacy-first-audit/FINAL-REMAINING-WORK.md`, `docs/decisions/001-implementation-decisions.md`, `docs/decisions/A05-technical-implementation-specification.md`, the historical-assignment records in `prisma/schema.prisma` and `src/lib/historical-party-assignment.ts`, and the implemented read-only view in `src/lib/historical-party-assignment-view.ts`.

Correction, 2026-11-09: A05 historical-assignment view is an approved and implemented permission. It is not an unresolved decision and it is not an unimplemented feature. This correction does not reopen A05, A07, or A20, and it does not reopen the 17 report runners.

This plan does not reopen A07 candidate access, A05-01 through A05-08, historical-assignment close, the A05 view permission, or the completed Settings, Finance, Sales, Inventory, Candidate, Invoice, ARC, Receipt, SMS, and Email work. It does not repeat the legacy table inventory.

Close and the read-only historical-assignment view are already implemented and are not in this queue. No remaining product feature below is safe to implement until its named decision or evidence exists. This file does not invent that decision or that evidence.

## 1. Executive recommendation

Do not build the historical-assignment view. It is already approved and implemented for active exact roles `sadmin`, `admin`, and `owner`.

The next action is not a product change. The A05-07 reconciliation rule is already approved. The written outcomes and source-data evidence for the held 11 agency references and 10 company references are not in this repository. The designated business owner, or a reviewer that owner has named, records those outcomes and that evidence. A candidate id or a non-blank name is not that evidence. Do not add a quarantine table, and do not approve migration or deletion from this gap.

Do not start Employer, report runners, `temp_candidates`, `user_types`, legacy mapping, a foreign key, or a new A05 create, reassign, or edit permission. Those items are missing evidence, or they would reopen a closed lock.

Settings stays out of this plan. The remaining-work file still lists a settings writer. That item is not reopened here.

## 2. Already settled

These are not open questions.

| Topic | Standing rule |
| --- | --- |
| A07 | `sadmin`, `admin`, and `owner` have unrestricted candidate-record access. The same matrix allows those three roles to create, edit, and approve candidates, and it denies candidate delete for every role. Operating role names are `Agency` and `Company`. |
| A05-01 through A05-04 | Closure reason, actor, and time; no reopen; no physical delete; activation time is not taken from legacy `created_at`. Close is implemented for the three roles. |
| A05 view | Approved and implemented. View access is limited to the active exact roles `sadmin`, `admin`, and `owner`. `users.status` must equal exact `A`. All other roles are denied. Client-provided role or status is never trusted. The list page, the detail page, and the GET routes read stored historical-assignment rows. They do not write, do not edit snapshot or closure fields, and do not read `agencies` or `companies` as assignment history. |
| A05-05 through A05-08 | Keep all 265 `agencies` rows and all 263 `companies` rows. Hold the recorded 11 and 10 unmatched candidate references for review. Do not deduplicate. Do not treat id or `created_at` as business order. A non-blank identifying name is the minimum content test. A missing address does not invalidate a row. |
| Separation | `agencies` and `companies` are independent immutable historical snapshots. They are not historical assignment identity. A matching candidate id is not a field mapping. |
| A05-07 rule | Only the designated business owner, or a reviewer that owner names, may clear a quarantined row, and only with source-data evidence. Closure permission is not quarantine permission. A quarantine table is not approved. The rule is approved. The reconciliation artifact is not in this repository. |
| Address copy for Agencier and Companier | The single `address` column is the source, including null. |
| Agent and Sub-Agent parts | Present and permanent parts are stored separately. They are not concatenated. Neither side is the canonical original address. |
| A05-09 as implemented | Candidate, party, and closer ids are stored with no foreign key. A missing parent does not delete history. |
| A05-11 | Employer is outside the historical-assignment lifecycle. |
| Decision 001 | Party table names `agenciers` and `companiers` stay. Payment backups stay in `payment_snapshots`. |

View evidence already in the repository: `src/lib/historical-party-assignment-view.ts`, `src/server/historical-party-assignment-view.ts`, `src/server/historical-party-assignment-json.ts`, `src/app/(workspace)/historical-assignments/page.tsx`, `src/app/(workspace)/historical-assignments/[id]/page.tsx`, `src/app/api/historical-party-assignments/route.ts`, and `src/app/api/historical-party-assignments/[id]/route.ts`. `tests/unit/historical-party-assignment-view.test.ts` records the role and status denials. The recorded check cited with this correction is 76 tests passed in that file, and `npx tsc --noEmit` passed. This correction did not re-run those checks and did not connect to a database.

## 3. Prioritized tasks

Rank uses the fewest new decisions, then whether the missing piece is evidence rather than a new rule, then risk to existing behavior and legacy rows. A05, A07, A20, and the 17 report runners are not reopened, so they are not implementation candidates.

| Rank | Item | Class | Scope | Exact missing decision or evidence | What it unlocks | Dependencies and risk |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | A05-07 reconciliation document | Rule already approved. The artifact is missing. | Not a product build | No new rule. Missing evidence: the named reviewer’s written outcomes and the source-data evidence for the held 11 agency references and 10 company references. | Satisfies the gate that sits in front of any later migration approval. It unlocks no screen. | A candidate id or a non-blank name is not clearance. This repository does not contain that source-data evidence. Do not add a quarantine table. Do not approve migration or deletion. |
| 2 | `user_types` | Blocked by missing legacy evidence | Do not build | Missing evidence: what the six stored names are for. The names are Agent, Candidate, Teacher, Employee, Employer, and Sub Agent, ids 101, 102, 103, 104, 105, and 109. No foreign key from `users` or `roles` is in the dump. | Nothing evidenced. Roles already have a screen. | Attaching this table to users would fork the completed role model. |
| 3 | `temp_candidates` | Blocked by missing legacy evidence | Do not build | Missing evidence: whether the 289 rows are scratch, a queue, or something else. Columns are known. No permission, menu, or reader exists. | Nothing evidenced. An import would write the completed candidate module. | Do not merge these rows into `candidates`. |
| — | A05-10 create and reassign | Not reopened | Do not build from this correction | Who may create, and who may reassign, are not decided by this file. | Not the next action. | A05 is not reopened. Do not invent those sentences here. |
| — | Agent and Sub-Agent address winner | Not reopened | Do not build | None that this file may invent. Present and permanent parts stay separate. Neither side is the canonical original address. | Nothing further. | Choosing a winning side would invent a rule the settled address decision already refused. |
| — | Remaining role-visibility conflict | Not reopened. A07 stays closed for the approved cells. | Do not build | For roles other than `sadmin`, `admin`, and `owner`, stored grants and runtime scope still disagree. This file does not decide which source wins. | Not the next action. | Do not reopen the approved three-role policy or the delete denial. |
| — | A05-09 foreign key | Not reopened | Do not build | No new key is approved. The implemented omission stands: dangling ids may remain after a parent disappears. | No new screen. | Adding a key can block parent removal or pressure a history delete. That conflicts with A05-03 and A05-05. |
| — | Legacy agency and company validation and mapping | Mapping from matching candidate ids is forbidden. Placeholder criteria are not written. | Do not build | A later mapping needs its own decision plus source-data evidence. Placeholder and test-name criteria are not written. | Nothing safe. | Do not classify rows by inventing those criteria. |
| — | A05-11 / A20 Employer and `employer_candidates` | Not reopened | Do not build | Purpose, cardinality, lifecycle, uniqueness, withdrawal, and audit are not in the dump. The dump has `employer_id`, `candidate_id`, and `purpose`, and zero rows. | Not the next action. | Do not reuse `historical_party_assignments`. Do not treat the empty table as a rule. |
| — | Reports, 17 URIs | Deferred | Do not build | A query, column layout, or output sample for each URI. Filter params are stored. The output is not. | Nothing until that evidence exists. | One generic list of `name`, `status`, and `report_uri` is not a report runner. |
| — | A05-10 edit | Not reopened | Do not build | No edit permission is approved by this file. | No handler from this correction. | A later edit approval still must not change original name, address, activation time, party identity, or closure facts. |

## 4. Recommended next action

**Ask the designated business owner, or the reviewer that owner has named, to record reconciliation outcomes and source-data evidence for the held 11 agency references and 10 company references.**

That action uses the A05-07 rule already approved. It does not invent a business rule. It does not implement a screen, a quarantine table, a migration, or a deletion. It does not clear a row from a candidate id or a non-blank name. Until that record exists, migration of the 265 `agencies` rows and the 263 `companies` rows stays unapproved.

No remaining product feature in this plan is ready to implement.

## 5. Keep deferred

- The 17 report runners.
- A05 create, reassign, and edit. This correction does not reopen them.
- A foreign key on historical assignments.
- Any migration or disposition of the 265 and 263 legacy rows, including deduplication.
- A quarantine table or a name classifier.
- An Agent or Sub-Agent address winner. The parts stay separate, and neither side is canonical.
- Employer, `employer_candidates`, and Employer visibility. A20 stays closed.
- `temp_candidates` and `user_types`, until the missing evidence in section 3 is supplied.
- Changing candidate visibility for roles other than the three already approved. A07 stays closed for those three roles and for the delete denial.
- Settings.

## 6. What this plan does not do

- No application source, Prisma schema, migration, seed, test, or configuration change.
- No database connection or write.
- No commit, stash, reset, revert, or discard.
- No new business rule is approved by this file.
- A05 view is not reopened and is not queued for implementation.
- A05, A07, and A20 are not reopened.
- The 17 report runners remain deferred.
