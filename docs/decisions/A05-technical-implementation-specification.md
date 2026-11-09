# A05 — Technical implementation specification

Date: 9 November 2026
Phase: documentation only
Status of A05: **PARTIALLY APPROVED**. A05-01 through A05-08 are approved business rules. A05-09 remains PROPOSED. A05-10 remains UNRESOLVED. A05-11 remains UNRESOLVED.
Recruitment implementation: **NO-GO**. This document does not authorize schema changes, migrations, or application work.

Technical design review, 2026-11-09: **NOT READY — specific technical gaps or unresolved decisions remain.** The review is the last section of this file. It does not reopen A05-01 through A05-08.

## How to read this document

| Label | Meaning |
| --- | --- |
| APPROVED BUSINESS RULE | Fixed by an earlier business decision. Not reopened here. |
| LEGACY FACT | Observed from the dump text, Prisma schema, migrations, or application code. Not a business approval. |
| PROPOSED TECHNICAL DECISION | A design choice in this specification. It is not approved until the technical approval named in section 9 is given. |
| BLOCKED BY BOUNDARY | Cannot be implemented without an explicit change to A05-09, A05-10, A05-11, or another stated boundary. |

No statement in this document classifies a legacy row, deduplicates a row, maps `agencies` or `companies` onto historical assignment identity, or adds a foreign key.

## 1. Executive summary

### What is approved

A05-01 through A05-08 are approved business rules, dated 9 November 2026. Earlier approved assignment rules remain in force:

- A historical assignment is a distinct record. It captures the party's original name and original address at assignment time.
- Those snapshot values are not replaced when the live party master changes.
- A candidate has at most one ACTIVE assignment in each of Agent, Sub-Agent, Agencier, and Companier. Assignments in different categories may be ACTIVE at the same time.
- A new assignment in a category is allowed only after the previous ACTIVE assignment in that category has been explicitly closed.
- `sadmin`, `admin`, and `owner` may close assignments. No other role receives closure authority from that decision.
- `agencies` and `companies` remain independent immutable historical snapshots. They are not the historical assignment identity. Matching candidate ids do not establish that mapping.

A05-01. Every closure requires one non-empty free-text reason. Record who closed the assignment and when. No fixed reason list and no category-specific reason list. The reason is recorded before closure completes.

A05-02. A CLOSED assignment cannot be reopened. A return creates a new assignment record. Previous history stays unchanged. The previous ACTIVE assignment in that category is closed first.

A05-03. Normal operations never physically delete assignment history. CLOSED assignments remain readable. No additional archive state. No retention period.

A05-04. Preserve the actual time an assignment became ACTIVE. Capture it when the assignment is created. Do not take it from legacy `created_at` without supporting evidence. This specification does not treat any existing timestamp as that evidence.

A05-05. Preserve all 265 `agencies` rows and all 263 `companies` rows. Hold 11 agency rows and 10 company rows whose candidate ids are absent from the dump's `candidates` table for review. Do not deduplicate. A matching candidate id does not prove a historical assignment mapping. Do not classify unmatched rows as invalid or discard them.

A05-06. A non-blank identifying name is the minimum content criterion for legacy agency and company rows. A missing address alone does not invalidate a row. Blank or non-identifying names require review. Placeholder detection needs written criteria. Those criteria are not written. A meaningful name does not prove a valid candidate relationship.

A05-07. Only the designated business owner, or a reviewer that owner explicitly names, may clear a quarantined row. Clearing requires source-data evidence. Record the outcome and the evidence. Do not clear a row from a candidate id or a name alone. Closure permission is not quarantine permission.

A05-08. No business order is approved. Do not treat ids or `created_at` as business order. Do not discard an earlier row because of `updated_at`. Preserve exact duplicates until reconciliation and a later explicit disposition.

### What is technically missing

- No table stores a distinct historical assignment. `candidates` stores one live id per party category and the board reads the current master name.
- Nothing copies a party name or address onto a candidate at assignment time.
- No column stores an assignment closure reason, a closing actor, a closure time, or the time an assignment became ACTIVE.
- No permission key exists for assignment close, create, reassign, view, or edit.
- A05-10 does not say who may create, reassign, view, or edit assignment history.
- A05-09 does not approve a foreign key.
- A05-11 leaves Employer and `employer_candidates` outside this lifecycle. A20 is unresolved.
- Agent and Sub-Agent have no single address column. Which stored parts are “the original address” is not specified.
- Placeholder and test-name criteria are not written.
- The row-level reconciliation required before migration approval is not recorded.
- No quarantine store is approved.

### What this specification proposes

A new table, `historical_party_assignments`, holds future Agent, Sub-Agent, Agencier, and Companier assignment history. It is not `agencies`, not `companies`, and not `employer_candidates`.

The proposed row stores the snapshot name and address, the time the row became ACTIVE, and, after an explicit close, the free-text reason, the closing user id, and the closure time. Status is only `ACTIVE` or `CLOSED`. One ACTIVE row per candidate and category is enforced by a partial unique index. Party ids and the candidate id are stored as integers with no foreign key.

The only operation specified for implementation after technical approval is close, and only for `sadmin`, `admin`, and `owner`. Create, reassign, view, and edit stay blocked by A05-10. Legacy rows stay in `agencies` and `companies`. They are not loaded into the new table by matching ids.

Applying this proposal still requires the technical approvals in section 9. This file does not apply it.

## 2. Legacy evidence inventory

This section was prepared without a database connection. `docs/db.txt` was read only for `CREATE TABLE` shape. Aggregate counts are the 9 November 2026 text audit already recorded in `.tools/m4a-decision-review/report.md` section 5.4. This specification does not copy row text from the dump and does not reclassify those rows.

### 2.1 Confirmed facts

| Fact | Source | Label |
| --- | --- | --- |
| Dump is a phpMyAdmin export of MariaDB 11.8.9, database `u410970153_eujobbd`, generated 28 October 2026. Documented path is `docs/db.txt`. | Section 5.4 audit; `docs/env.md` `LEGACY_DUMP_PATH` | LEGACY FACT |
| `agencies` and `companies` columns are `id`, `name` `varchar(255) NOT NULL`, `address` `varchar(255) NULL`, `created_at`, `updated_at`, `candidate_id` `int NULL`. Primary key is `id` only. The dump defines no foreign key and no unique key on `candidate_id`. | `docs/db.txt` `CREATE TABLE`, confirmed in this task | LEGACY FACT |
| PostgreSQL models `Agency` and `Company` match that shape. `candidateId` is indexed and has no Prisma relation. Both models have `updated_at`. | `prisma/schema.prisma` | LEGACY FACT |
| Catalog class for both tables is `direct`. They are not payment `archive_snapshot` tables. | `docs/legacy/column-catalog.json`; `docs/migration/mapping.md`; `docs/decisions/001-implementation-decisions.md` item 3 | LEGACY FACT |
| Counts from the recorded text audit: `agencies` 265 rows, 263 distinct `candidate_id`, 11 rows whose `candidate_id` is absent from dump `candidates`. `companies` 263 rows, 258 distinct `candidate_id`, 10 such absent references. No `candidate_id` is null. Every stored name is non-null and non-blank. Address is null on 154 agency rows and 153 company rows. | Section 5.4. Not re-counted in this task | LEGACY FACT |
| Repeated `candidate_id` values exist. The audit recorded 2 agency ids with 2 rows, 3 company ids with 2 rows, and 1 company id with 3 rows. Four company groups share name, address, and `candidate_id` (4 extra rows). Agency pairs for the same `candidate_id` are not that kind of identical group. | Section 5.4 | LEGACY FACT |
| In that audit, `created_at` order agrees with `id` order. `updated_at` does not. The dump does not define either timestamp as assignment time. | Section 5.4 | LEGACY FACT |
| Live party masters are `agents`, `sub_agents`, `agenciers`, and `companiers`. Candidate columns `agent_id`, `sub_agent_id`, `agencier_id`, and `companier_id` reference them `ON DELETE RESTRICT ON UPDATE CASCADE`. | `prisma/schema.prisma` model `Candidate` | LEGACY FACT |
| `Agent.name` and `SubAgent.name` are nullable `varchar(100)`. `Agencier.name` and `Companier.name` are nullable `varchar(255)`. `Agencier.address` and `Companier.address` are a single nullable `varchar(255)`. Agent and Sub-Agent store present and permanent address as separate house, road, village, post, and location-id columns. They have no single address column. | `prisma/schema.prisma` | LEGACY FACT |
| `SubAgent.agentId` is required. | `prisma/schema.prisma` | LEGACY FACT |
| All four live masters have `deleted_at`. | `prisma/schema.prisma` | LEGACY FACT |
| `candidates.company_status` is nullable `varchar(200)`. `candidates.created_at` is a candidate-row timestamp. Neither is an assignment record. | `prisma/schema.prisma` | LEGACY FACT |
| The candidate board joins `agenciers` and `companiers` and shows the current master name. Application SQL does not read `agencies` or `companies` for that board. | Decision-review section 5.1 and 5.2 | LEGACY FACT |
| `src/lib/legacy-snapshots.ts` rejects application writes that would change or remove `agencies` or `companies`. | Application code | LEGACY FACT |
| `employer_candidates` has nullable `employer_id`, nullable `candidate_id`, nullable `purpose`, and timestamps. No status and no `deleted_at`. The recorded dump has no rows. No service or screen reads it. | `docs/db.txt` `CREATE TABLE`; decision-review section 6 | LEGACY FACT |
| `hasFullAccess` treats `sadmin`, `admin`, and `owner` as unrestricted for candidate-record visibility. Candidate create, edit, and approve for those roles, and delete denied for every role, are a separate A07 action matrix. There is no assignment permission key. | `src/lib/auth/permissions.ts`; A07 decision record | LEGACY FACT plus APPROVED BUSINESS RULE for candidate actions only |
| Operating role names `Agency` and `Company` are an A07 naming decision. Assignment categories remain Agent, Sub-Agent, Agencier, and Companier. | A07 operating-role amendment; A05 lifecycle approval | APPROVED BUSINESS RULE |

### 2.2 Not facts

- A non-null `agencies.candidate_id` or `companies.candidate_id` is not a historical assignment.
- A `candidate_id` that exists on `candidates` is not a valid candidate relationship and is not a field mapping.
- A non-blank legacy name is not, by the audit, proof that the name is identifying. Placeholder criteria do not exist.
- `candidates.company_status` and `candidates.created_at` are not assignment status or activation time.
- The current one-id-per-category columns are not closed-history storage. Replacing one of those ids drops the previous party from the candidate row. That behavior is observed. It is not the approved history rule.
- `users.agent_id`, `users.employer_id`, and `users.companier_id` were recorded without foreign keys. That user-link fact is not an assignment rule. This specification does not change those columns.
- This task did not connect to `manpower_db`, `mms_test`, or any other database, and did not re-measure the 265, 263, 11, or 10 counts.

## 3. Proposed historical assignment data model

PROPOSED TECHNICAL DECISION. Not applied. No foreign key is part of this proposal.

### 3.1 Why a new table

Approved rules require a distinct record that keeps original name and address after the live master changes, keeps CLOSED rows readable beside a later ACTIVE row, and is not `agencies` or `companies`. The current candidate columns cannot do that. Reusing `agencies` or `companies` would cross the approved separation and would infer history from candidate ids.

`employer_candidates` is out of scope under A05-11.

### 3.2 Proposed entity

Table name: `historical_party_assignments`.

The name is a proposal. It must not be created until section 9 approves it.

| Field | Proposed type | Null | Proposed constraint | Approved rule it stores | Approval state |
| --- | --- | --- | --- | --- | --- |
| `id` | integer identity | not null | primary key | Row identity only. Not a business order. | PROPOSED TECHNICAL DECISION |
| `candidate_id` | integer | not null | none. No foreign key | Which candidate the assignment belongs to | PROPOSED. The relationship is not an approved foreign key. A05-09 blocks any key |
| `party_category` | `varchar(20)` | not null | check: `agent`, `sub_agent`, `agencier`, `companier` | One ACTIVE assignment per category | PROPOSED. Required to enforce the approved cardinality. Not an approved column name |
| `party_id` | integer | not null | none. No foreign key | Which live party was current at assignment | PROPOSED. Not a foreign key. Not a mapping from `agencies` or `companies` |
| `original_name` | `varchar(255)` | not null | `btrim(original_name) <> ''` | Original party name | PROPOSED store for an approved fact |
| `original_address` | `varchar(255)` | null | none | Original party address. Null is allowed | PROPOSED store for an approved fact |
| `status` | `varchar(10)` | not null | check: `ACTIVE` or `CLOSED` only | A05-02 and the lifecycle | PROPOSED store. No other state |
| `became_active_at` | `timestamptz` | not null | set on insert from the database clock | A05-04 | PROPOSED. Must not be copied from legacy `created_at` |
| `closure_reason` | `text` | null when ACTIVE; not null when CLOSED | `btrim(closure_reason) <> ''` when CLOSED. No code list | A05-01 | PROPOSED store |
| `closed_by_user_id` | integer | null when ACTIVE; not null when CLOSED | none. No foreign key | A05-01 actor | PROPOSED. User id of the authenticated closer. No foreign key |
| `closed_at` | `timestamptz` | null when ACTIVE; not null when CLOSED | database clock at close | A05-01 time | PROPOSED |

Proposed check, not applied:

- `status = 'ACTIVE'` requires `closure_reason`, `closed_by_user_id`, and `closed_at` to be null.
- `status = 'CLOSED'` requires a non-blank `closure_reason`, a `closed_by_user_id`, and a `closed_at`.

There is no `deleted_at`. There is no sequence or order column. There is no `created_at` and no `updated_at`, so those names cannot be mistaken for activation time or business order. There is no employer id and no `purpose`.

### 3.3 Snapshot preservation

On insert, the server copies the live master's name into `original_name` and the resolved address into `original_address`. The client does not supply those values.

After insert, `original_name`, `original_address`, `became_active_at`, `candidate_id`, `party_category`, and `party_id` are not updated. A later change to `agents.name`, `sub_agents.name`, `agenciers.name`, `companiers.name`, or any address column does not write back to this row. Party `deleted_at` does not close or rewrite the row.

PROPOSED TECHNICAL DECISION for enforcement: a database trigger rejects updates to those six columns. The close statement may update only `status`, `closure_reason`, `closed_by_user_id`, and `closed_at`, and only from `ACTIVE` to `CLOSED`.

Address source, which is not yet decidable for every category:

| Category | Live address fact | Proposal |
| --- | --- | --- |
| Agencier | Single nullable `address` | Copy that column, including null. |
| Companier | Single nullable `address` | Copy that column, including null. |
| Agent | Split present and permanent parts. No single address column | Do not invent a concatenation. `original_address` cannot be filled for this category until a written rule names the source parts. |
| Sub-Agent | Same split shape as Agent | Same block. |

A blank or null live name cannot satisfy the approved snapshot. PROPOSED TECHNICAL DECISION: the future create operation refuses to insert when the live name is null or blank. That guard is not a classification of legacy `agencies` or `companies` rows, and create itself stays blocked by A05-10.

`varchar(255)` is the width of the longest current master name and of the single Agencier and Companier address column. It is not a mapping from `agencies.name` or `companies.name`.

### 3.4 Activation time and closure facts

`became_active_at` is `clock_timestamp()` in the insert transaction. It is not `candidates.created_at`, not `agencies.created_at`, and not `companies.created_at`.

`closed_at` is `clock_timestamp()` in the close transaction. `closed_by_user_id` is the authenticated user's `users.id`. The request body cannot name a different actor. `closure_reason` is the submitted free text after trim. Empty text is rejected. No reason code is accepted or stored.

### 3.5 One ACTIVE assignment per category

PROPOSED TECHNICAL DECISION, not applied:

```sql
CREATE UNIQUE INDEX historical_party_assignments_one_active
  ON historical_party_assignments (candidate_id, party_category)
  WHERE status = 'ACTIVE';
```

The index allows many CLOSED rows for the same candidate and category, and allows one ACTIVE row in each of the four categories at the same time. It does not order rows. It does not apply to `agencies`, `companies`, or `employer_candidates`.

### 3.6 Relationships that are not approved

Storing `candidate_id`, `party_id`, and `closed_by_user_id` does not approve a foreign key. A05-09 remains PROPOSED. If a parent row is missing, the historical row stays. It is not deleted to satisfy a constraint, because no such constraint is proposed.

The live candidate foreign keys stay as they are. This model does not update `candidates.agent_id`, `sub_agent_id`, `agencier_id`, `companier_id`, or `company_status`. Changing those columns would modify existing candidate records and would replace the current live link. That change is not proposed. It would require an explicit boundary change.

## 4. Lifecycle and transaction design

APPROVED BUSINESS RULE: the only states are ACTIVE and CLOSED. Closure is explicit. A CLOSED row cannot return to ACTIVE. No Pending, Suspended, Cancelled, or archive state is added.

### 4.1 ACTIVE

An ACTIVE row has been inserted and has not been closed. It holds the snapshot, `became_active_at`, and null closure fields. It is the row counted by the partial unique index.

### 4.2 CLOSED

A CLOSED row stays in the table and stays readable. Its snapshot and `became_active_at` stay as inserted. Closure fields stay as written by the close transaction. No operation sets the row back to ACTIVE. No operation deletes it.

### 4.3 Close operation

Permitted for specification. Still requires the technical approval in section 9 before any code or migration.

Preconditions:

- The caller is authenticated and the role name is `sadmin`, `admin`, or `owner`.
- The role check does not use menu grants, `add_`, `edit_`, or `delete_` grants, or `hasFullAccess`. Those mechanisms are candidate or navigation behavior. They are not assignment-closure authority.
- Whether the user must also have status `A` is not decided. This specification does not add that requirement.
- The row exists and is ACTIVE.
- `reason` is present and `btrim(reason)` is not empty.

Transaction:

1. Begin a transaction.
2. `SELECT` the row `FOR UPDATE`.
3. If the row is missing, roll back with not-found.
4. If the status is not ACTIVE, roll back. A CLOSED row is not reopened and is not closed again.
5. If the caller is not one of the three roles, roll back with forbidden.
6. If the reason is blank, roll back with validation failure.
7. `UPDATE` only `status`, `closure_reason`, `closed_by_user_id`, and `closed_at`, and only where `status = 'ACTIVE'`.
8. Commit.

The close transaction does not insert the next assignment. It does not update a party master, a candidate, `agencies`, or `companies`.

### 4.4 Return

APPROVED BUSINESS RULE: a return creates a new assignment. The previous ACTIVE assignment in that category must already be CLOSED.

PROPOSED TECHNICAL DECISION, blocked by A05-10 until create is allowed:

1. Begin a transaction.
2. Lock existing rows for that `candidate_id` and `party_category` with `FOR UPDATE`.
3. If any locked row is ACTIVE, roll back. Do not close it inside this transaction. Closure remains the separate explicit operation, with its own reason.
4. Read the live master name and the allowed address source.
5. Insert one ACTIVE row. Set `became_active_at` to `clock_timestamp()`. Leave closure fields null.
6. Commit.

A concurrent insert hits the partial unique index, rolls back, and reports that an ACTIVE assignment already exists. It does not close the other row.

Two closes of the same row: the `FOR UPDATE` lock and the `WHERE status = 'ACTIVE'` update make the second close fail.

The proposed isolation is READ COMMITTED plus those row locks plus the partial unique index. SERIALIZABLE isolation is an alternative with more transaction aborts. It is not required for the rule if the lock and the index are both present.

### 4.5 What the lifecycle does not do

- It does not reopen.
- It does not delete.
- It does not set party `deleted_at`.
- It does not read or write `company_status`.
- It does not infer a row from `agencies` or `companies`.

## 5. Authorization design

| Action | Decision | This specification |
| --- | --- | --- |
| Close | APPROVED BUSINESS RULE for `sadmin`, `admin`, and `owner` only | Proposed role-name check on the close operation. No new permission key. Not inferred from menu or CRUD grants |
| Create | A05-10 UNRESOLVED | BLOCKED BY BOUNDARY. No handler |
| Reassign | A05-10 UNRESOLVED. Business meaning is close, then a new row | The close half is the close operation. The new-row half is BLOCKED BY BOUNDARY |
| View | A05-10 UNRESOLVED | BLOCKED BY BOUNDARY. CLOSED rows must remain readable once view is approved. This specification does not define who may read them |
| Edit | A05-10 UNRESOLVED | BLOCKED BY BOUNDARY. Even after a later approval, snapshot and closure facts of a CLOSED row stay unchanged |
| Clear a quarantined legacy row | A05-07 | Not granted by closure authority. No quarantine handler is specified |

Candidate-record visibility and the candidate create, edit, delete, and approve matrix stay A07 decisions. They do not grant assignment create, reassign, view, or edit.

## 6. Legacy data and quarantine strategy

No table is created for quarantine. No SQL is run. No row is classified.

### 6.1 Preservation

All 265 `agencies` rows and all 263 `companies` rows stay in those tables, including repeated `candidate_id` values and the four identical company groups recorded by the audit. This specification does not deduplicate them, does not assign them a sequence, and does not copy them into `historical_party_assignments`.

`src/lib/legacy-snapshots.ts` already refuses ordinary writes to those two tables. That behavior matches the approved immutability classification. This specification does not change that module.

### 6.2 How the unmatched references are represented

They are represented only as the recorded aggregates:

| Table | Rows to preserve | Rows held for review |
| --- | --- | --- |
| `agencies` | 265 | 11 whose `candidate_id` is absent from the dump's `candidates` table |
| `companies` | 263 | 10 whose `candidate_id` is absent from the dump's `candidates` table |

“Held for review” is the A05-05 rule. It is not a finding that those rows are invalid, orphaned by a business definition, or historical assignments. A matching id on the other rows is not a mapping. This document does not list the ids and does not copy names.

### 6.3 Future review

When a review happens, it follows A05-05, A05-06, and A05-07:

- The reviewer is the designated business owner or a person that owner has named in writing.
- Clearance cites source-data evidence. A candidate id or a non-blank name is not that evidence by itself.
- The outcome and the evidence are recorded before anyone treats the row as cleared.
- Blank or non-identifying names stay in review. A missing address does not, by itself, fail a row.
- Placeholder or test-name detection waits for written criteria. This specification does not supply them.
- No outcome is a silent delete.
- Exact duplicates stay until that reconciliation and a separate disposition decision.
- Migration of these rows is not approved. Row-level reconciliation is still required before any later migration approval. This document is not that reconciliation.

A database table for those outcomes would be a quarantine table. That crosses the current boundary. The proposal that stays inside the boundary is a written reconciliation record outside the schema. Choosing a table instead requires an explicit boundary change and is not part of this model.

## 7. API contract proposal

The current application has no assignment route. Candidate writes are server modules, not a general assignment API. The shapes below are proposals. This task creates no route and no service.

### 7.1 Close, specified and still not implemented

Operation: `closeHistoricalPartyAssignment`.

Proposed HTTP shape, if a route is later approved: `POST /api/historical-party-assignments/{id}/close`.

Request body:

```json
{ "reason": "free text, required, not a code" }
```

The actor comes from the session. A body field for user id is ignored.

Success: the same row, with `status` `CLOSED`, `closureReason`, `closedByUserId`, `closedAt`, and the original snapshot unchanged.

Failures:

| Condition | Result |
| --- | --- |
| Blank reason | Reject. Row stays ACTIVE |
| Caller is not `sadmin`, `admin`, or `owner` | Reject. No write |
| Row missing | Reject |
| Row already CLOSED | Reject. No reopen |
| Concurrent close lost the race | Reject. The first committed close stands |

### 7.2 Operations that cannot be implemented until A05-10

| Operation | Proposed shape, not implementable now | Block |
| --- | --- | --- |
| Create | `POST /api/historical-party-assignments` with `candidateId`, `partyCategory`, `partyId`. Server copies name and address. Client cannot send snapshot text, status, or `becameActiveAt` | A05-10 |
| Return / reassign | Not one overwrite call. Close, then create. Create stays blocked | A05-10 for the create half |
| View one or list | `GET /api/historical-party-assignments/{id}` and `GET /api/historical-party-assignments?candidateId=` | A05-10 |
| Edit | No payload is proposed. A later approval must not change snapshot or CLOSED facts | A05-10 |

Employer endpoints are not proposed. A05-11.

## 8. Validation and test strategy

No test is added or run by this task. The following tests apply only after the corresponding technical approval, and only against the proposed behavior. They must not assume a foreign key, a quarantine table, or create, view, or edit permission.

| Area | Future test |
| --- | --- |
| Unit, close | Blank reason is rejected. A non-empty reason is stored exactly as trimmed text. No code lookup exists |
| Unit, lifecycle | ACTIVE to CLOSED succeeds once. A second close fails. No path sets CLOSED back to ACTIVE |
| Unit, snapshot | After close, and after a simulated master rename, `original_name` and `original_address` are unchanged |
| Unit, activation | `became_active_at` is set at insert and is not read from a legacy `created_at` |
| Authorization | `sadmin`, `admin`, and `owner` can close. Another role cannot. A menu grant or a candidate `edit_` grant does not close |
| Authorization negative | The same three roles are not treated as authorized to create, view, or edit while A05-10 is unresolved |
| Concurrency | Two transactions inserting ACTIVE for the same candidate and category: one commits, one fails. Neither closes the other implicitly |
| Concurrency | Two closes of one ACTIVE row: one commits, the other fails |
| Duplicate preservation | A fixture with two identical legacy company payloads still has two rows after any preservation helper. No helper deletes by `updated_at` |
| Legacy non-inference | Inserting an assignment does not read `agencies` or `companies`, and does not write `candidates.company_status` |
| Boundary | Schema expectation has no foreign key on the new table, no `deleted_at`, and no sequence column |
| Quarantine | No test clears a held row from a matching id. Clearance stays unauthorized for the three closure roles |

Integration tests that need PostgreSQL wait until a migration is separately approved. They are not part of this task.

## 9. Technical decisions required

### 9.1 Proposals inside the current approvals

| ID | Proposed decision | Reason | Impact | Supports | Boundary conflict |
| --- | --- | --- | --- | --- | --- |
| D1 | Add `historical_party_assignments` as specified in section 3, with no foreign key, no `deleted_at`, and no sequence column | The approved history cannot be stored on the candidate's single live id | New table only. Existing rows are untouched | Distinct snapshot, A05-01, A05-02, A05-03, A05-04, one ACTIVE per category | No, if technical approval is given and no extra column is added |
| D2 | Partial unique index on `(candidate_id, party_category) WHERE status = 'ACTIVE'` | Two concurrent creates must not both stay ACTIVE | Database rejects the second ACTIVE row | One ACTIVE per category | No |
| D3 | Close updates only the four closure fields, in one transaction, actor from the session | A05-01 and A05-02 | One operation for the three named roles | A05-01, A05-02, closure authority | No. Does not grant create, view, or edit |
| D4 | Role-name check for close, not `hasFullAccess` and not menu grants | Closure authority is not candidate access and not a menu | Close cannot be reached through a candidate CRUD grant | Closure authority | No new permission key |
| D5 | `became_active_at` and `closed_at` use `clock_timestamp()` | A05-04 forbids assuming legacy `created_at` | New rows carry their own times | A05-04, A05-01 | No |
| D6 | Trigger or equivalent rejects snapshot and identity updates | Masters change today and the board shows the new name | Historical text stays | Do not overwrite snapshots | No |
| D7 | Copy Agencier and Companier `address` as-is, including null | That column is the single address on those masters | Null address does not fail the row | Original address | No |
| D8 | Leave all 265 and 263 legacy rows in place. Do not load them by candidate id | A05-05 and the separation rule | No legacy migration in the first schema change | A05-05, A05-08 | No |
| D9 | Record a future quarantine outcome in a written reconciliation, not in a new table | A05-07 requires a record. A table is forbidden | Migration stays blocked until the writing exists | A05-05, A05-07 | No, as long as no table is added |

### 9.2 Decisions that need an explicit boundary change

| ID | Decision | Why it is blocked | If approved later |
| --- | --- | --- | --- |
| B1 | Any foreign key from the new table to `candidates`, a party master, or `users` | A05-09 is PROPOSED and does not approve a key | The key must not be added by deleting rows that fail it |
| B2 | Create, reassign, view, and edit handlers or permission keys | A05-10 is UNRESOLVED | Each action needs its own decision. Closure does not imply the others |
| B3 | Employer status, screen, or reuse of this lifecycle | A05-11 and A20 | Employer stays outside until A20 says otherwise |
| B4 | A quarantine table, workflow, or migration of legacy rows | Explicit boundary. Reconciliation is not recorded | Still cannot deduplicate or infer assignments from candidate ids |
| B5 | Sequence or order column on legacy rows or on the new table | A05-08. No business order | `became_active_at` remains a fact, not a sequence column |
| B6 | Assignment `deleted_at` or a physical delete | A05-03 | Not available until legal and business retention requirements are documented |
| B7 | Changing party `deleted_at` behavior, or writing candidate party ids from this lifecycle | Do not change party delete. Do not modify candidate records | Would be a separate behavior change |
| B8 | Which Agent and Sub-Agent address parts form `original_address` | Not specified by the schema or by an approved rule | Must be a written field rule before those categories can store an address |
| B9 | Placeholder and test-name criteria | A05-06 says they must be written. They are not | No automatic name classification before that writing |
| B10 | Treating user status `A` as required for closure | Not decided. Previously left open beside A05-10 | Do not add it silently |

## 10. Implementation readiness matrix

| Requirement | Business rule | Technical design | Technical approval | Blocked by boundary |
| --- | --- | --- | --- | --- |
| A05-01 closure reason, actor, and time | Approved | Proposed columns and close transaction | Required before build | No, for the close operation |
| A05-02 no reopen; return is a new row; close previous ACTIVE first | Approved | Proposed state check, failed reopen, create that refuses an existing ACTIVE | Create half required, and A05-10 | Create and reassign blocked by A05-10 |
| A05-03 no physical delete; CLOSED stays readable; no extra archive state | Approved | No `deleted_at`, no delete statement | Required before build | Delete and archive state remain blocked |
| A05-04 activation time, not legacy `created_at` | Approved | Proposed `became_active_at` | Required before build | No |
| Original name and address on a distinct record | Approved | Proposed snapshot columns and trigger | Required before build | Agent and Sub-Agent address source is B8 |
| Do not overwrite snapshots when masters change | Approved | Proposed immutability of snapshot columns | Required before build | No |
| One ACTIVE per Agent, Sub-Agent, Agencier, and Companier | Approved | Proposed partial unique index | Required before build | No |
| `sadmin`, `admin`, and `owner` may close | Approved | Proposed role-name check | Required before build | No |
| A05-05 preserve 265 and 263; hold 11 and 10; no dedup; no id mapping | Approved | Leave the rows in place. Represent the 11 and 10 as counts | No build | Migration and classification blocked |
| A05-06 minimum name criterion; address not required; no invented placeholders | Approved | No classifier in this design | Written placeholder criteria still required before any name test | Automatic classification blocked |
| A05-07 owner or named reviewer; source-data evidence | Approved | Written reconciliation, not a table | The writing itself is still required | Quarantine table blocked |
| A05-08 no business order; keep duplicates | Approved | No sequence column and no collapse | No build | Order column and dedup blocked |
| A05-09 foreign key | Not approved. PROPOSED only | Explicitly omitted | Would be a boundary change | Blocked |
| A05-10 create, reassign, view, edit | Not approved. UNRESOLVED | Shapes only, in section 7.2 | A07 decision required | Blocked |
| A05-11 Employer | Not approved. UNRESOLVED | Omitted | A20 required | Blocked |

A05-01 through A05-08 are not unapproved business rules. The open cells are technical approval or an explicit boundary.

## 11. Implementation sequence

This sequence is for a later implementation. None of it is performed now.

1. Accept or reject D1 through D9 and B8 in writing. Rejecting D1 stops the sequence.
2. If B8 is still open, Agencier and Companier are the only categories whose address can be copied. Agent and Sub-Agent assignment creation stays blocked even after A05-10.
3. Add the table, checks, partial unique index, and snapshot trigger in a new migration. Do not alter `agencies`, `companies`, `candidates`, party masters, or `employer_candidates`. Do not insert legacy rows.
4. Add the close operation and its tests. Do not add create, list, view, or edit.
5. Stop until A05-10 names create, reassign, view, and edit. Then add only the actions that decision names.
6. Stop legacy disposition until the A05-07 reviewer writes the reconciliation. Do not deduplicate and do not match candidate ids onto the new table.
7. Add a foreign key only if A05-09 is explicitly approved, and do not delete rows to make it pass.
8. Touch Employer only after A20.

## 12. Assumptions stated as assumptions

- `users.id` is enough to record who closed an assignment. A copied display name is not required by A05-01 and is not proposed.
- The database clock is the activation and closure clock. No legacy timestamp is evidence for A05-04.
- The four category keys match the live master tables already named in the approvals.
- Integer ids without foreign keys can record candidate, party, and closer until A05-09 changes.
- READ COMMITTED, `FOR UPDATE`, and the partial unique index are sufficient concurrency protection.
- The 265, 263, 11, and 10 figures are the recorded section 5.4 audit. This task confirmed `CREATE TABLE` shape and did not re-count inserts.
- `docs/business-flow.pdf` was not used. It is not evidence.
- This design does not keep `candidates.agent_id` and the other three live ids aligned with the ACTIVE historical row. Doing so would modify candidate records.

## 13. What this document does not change

- No application source, Prisma schema, migration, seed, test, or configuration file.
- No database connection, query, or write.
- No commit, stash, reset, revert, or discard of existing work.
- No route, service, or test was added.
- Approved A05-01 through A05-08 wording is unchanged.
- A05-09, A05-10, and A05-11 are unchanged.
- A07 and A20 are unchanged.

## Technical Design Review — 2026-11-09

Phase: documentation only. This review read `docs/db.txt` `CREATE TABLE` text, `prisma/schema.prisma`, and the current session and permission modules. It did not connect to `manpower_db`, `mms_test`, or any other database. It did not classify a legacy row, copy row text, or count inserts again. The 265, 263, 11, and 10 figures remain the recorded section 5.4 aggregates cited in section 2.

### 1. Review verdict

**NOT READY — specific technical gaps or unresolved decisions remain.**

A05-01 through A05-08 stay approved. The proposed table, partial unique index, close transaction, Agencier and Companier address copy, and the decision to leave legacy rows untouched are compatible with those rules. They are not technically approved, and several controls are not specified tightly enough to implement. Agent and Sub-Agent address snapshots still have no evidenced single source. Create, reassign, view, and edit stay blocked by A05-10. Foreign keys stay blocked by A05-09. This review does not call the project production-ready and does not authorize implementation.

### 2. Findings

#### Critical

None. No proposed control contradicts an approved A05-01 through A05-08 rule when the stated blocks are kept: no foreign key, no create or edit handler, no Agent or Sub-Agent address composition, and no change to legacy rows.

#### High

| ID | Finding | Evidence | Technical impact | Recommended resolution | New approval |
| --- | --- | --- | --- | --- | --- |
| H1 | The immutability trigger is not specified for DELETE or for a second write of closure facts. | Section 3.3 limits the close statement to four fields and only from ACTIVE to CLOSED. Section 5 says closure facts of a CLOSED row stay unchanged. D6 names a trigger that rejects updates to six identity and snapshot columns. `assertLegacySnapshotPreserved` in `src/lib/legacy-snapshots.ts` protects `agencies` and `companies` only. | An UPDATE that does not go through the close statement can change `closure_reason`, `closed_by_user_id`, or `closed_at` on a CLOSED row. A DELETE removes history. The `WHERE status = 'ACTIVE'` clause protects only the specified close statement. | Extend the D6 trigger so the only permitted update is one ACTIVE-to-CLOSED change of `status`, `closure_reason`, `closed_by_user_id`, and `closed_at`, and so DELETE is rejected. Do not add `deleted_at`. | No business re-approval. Include the predicate in the technical approval of D6. |
| H2 | Closure authority is not tied to the session loader that actually resolves roles. | `src/server/current-user.ts` loads `AccessUser.roleName` from `users.role_id` → `roles.name` on every request. The session token in `src/lib/auth/jwt.ts` carries `sid`, `sub`, and expiry only. Dump `roles.name` values for the three closers are `sadmin`, `admin`, and `owner`. Display names are `Super Admin`, `Administrator`, and `owner`. `hasPermission` returns true for those three roles on every key that is not a candidate action. `hasGrant` follows stored menu grants. `loadCurrentUser` returns null when `users.status` is present and not `A`. | A check against `roleDisplayName` rejects `sadmin` and `admin`. A check through `hasPermission`, `hasFullAccess`, `hasGrant`, or `canMutateTable` either ignores the approved role list or lets a stored grant admit another role. A client-supplied role or user id is not the session. | The close operation must call `loadCurrentUser` or `requireUser` and compare `roleName` to `sadmin`, `admin`, and `owner`. Ignore a body user id. Do not call the four helpers above. Do not add a new status rule: the existing loader already refuses a non-`A` user. | No. B10 stays unresolved. Using the existing loader is not an approval of B10. |
| H3 | Candidate, party, and closer ids are unchecked integers. | Section 3.2 stores `candidate_id`, `party_id`, and `closed_by_user_id` with no foreign key. A05-09 remains PROPOSED. Live candidate party columns in `prisma/schema.prisma` use `ON DELETE RESTRICT ON UPDATE CASCADE`. The new table would not. Section 4.4 reads a live master at insert and does not say what happens when that read finds nothing. | Close writes only closure fields, so the close-only step does not create a new orphan. The first create can store a candidate id, a party id, or a category/table pair that matches nothing. After insert, a missing parent must not delete the history row. A later hard delete or id change of a parent leaves the stored id unresolved. The copied name and address still remain readable. | Do not add a foreign key. When create is eventually allowed, reject the insert if the candidate row is missing or the party id is missing from the table named by `party_category`. Take `closed_by_user_id` only from the loaded session user. Accept dangling ids after a later parent disappearance as the residual risk of A05-09. | No foreign key, so no A05-09 approval. The existence checks are part of future create and stay behind A05-10. Technical approval of D1 must record the residual risk. |

#### Medium

| ID | Finding | Evidence | Technical impact | Recommended resolution | New approval |
| --- | --- | --- | --- | --- | --- |
| M1 | `SELECT … FOR UPDATE` does not cover the first assignment in a category. | Section 4.4 locks existing rows, then inserts. PostgreSQL row locks do not lock an empty result. Section 3.5 defines one partial unique index. Existing services use `FOR UPDATE` under read committed, including `src/server/password-reset.ts`. | Two creates that both see no row can both attempt the insert. The partial unique index then admits one and rejects the other. Two closes of one row are serialized by the UPDATE row lock and `WHERE status = 'ACTIVE'`, not by that index. | Keep both the lock and the index. Map unique violation `23505` on `historical_party_assignments_one_active` to “an ACTIVE assignment already exists,” roll back, and do not retry the insert in that request. Do not close the winning row. | No. |
| M2 | `clock_timestamp()` is specified only in the application statement. | D5. `became_active_at` is `NOT NULL` and has no default in section 3.2. `now()` is the transaction start time; `clock_timestamp()` is the statement time. | A caller that binds its own timestamp can store a time that is not the database clock. Two calls inside one transaction can differ. Close and create are separate transactions, which keeps each stamp a single call. | Set `became_active_at` in a BEFORE INSERT trigger to `clock_timestamp()`, and set `closed_at` in the close path the same way. Do not bind a client or application clock. Do not merge close and insert into one transaction. | No. Fold it into the technical approval of D5. |
| M3 | Role check runs after the row lock and can distinguish missing from forbidden. | Section 4.3, steps 3 and 5. | An authenticated caller outside the three roles can learn whether an assignment id exists. | Resolve the session and the role before locking. Use one failure result for a caller who may not close. | No. |
| M4 | `original_address varchar(255)` matches only the single-column masters. | `Agencier.address` and `Companier.address` are `varchar(255)`. Agent `present_address_house` is `varchar(200)` and the other text parts are `varchar(20)`. Location names live on `thanas`, `districts`, and `divisions`. | A later concatenation does not fit this column and is not evidenced. Agent `name` is `varchar(100)` and does fit `original_name varchar(255)`. | Keep D7 for Agencier and Companier. Leave B8 closed to composition. | B8 still needs its own written field rule before Agent or Sub-Agent address is stored. |
| M5 | Quarantine outcomes have no store except a future document. | A05-07 requires a written outcome and evidence. D9 forbids a table. Section 6 stores nothing. | The 11 and 10 held references can be forgotten or cleared from memory of a candidate id alone, which A05-07 forbids. | The future reconciliation is a document outside the schema. It cites the recorded aggregates and the evidence the reviewer used. It does not add a column or a table. | No. The writing itself is still required before any migration approval. |

#### Low

| ID | Finding | Evidence | Technical impact | Recommended resolution | New approval |
| --- | --- | --- | --- | --- | --- |
| L1 | Category keys are table names, not role names. | Proposed check values are `agent`, `sub_agent`, `agencier`, `companier`. Role names include `Agent`, `Sub Agent`, `Agency`, and `Company`. | Using a role name as `party_category` fails the check or stores the wrong partition. | Keep the four lowercase table keys. Do not derive them from `roles.name`. | No. |
| L2 | Session role comes from `users.role_id` only. | `loadCurrentUser` uses `roleIdRef`. `User` also has `userRoleLinks0`. `roles` has no status column. | A second row in `user_roles` does not grant or remove closure. That matches every current authorization check. | Do not consult `user_roles` for close. | No. |
| L3 | Closer identity is an integer, not a copied name. | Section 12 assumption. A05-01 requires who closed the assignment. A05-09 blocks a user foreign key. | If that user row later disappears, the id remains and the display name does not. | Keep the session user id. Do not add a copied name or a foreign key in this design. | No. |

### 3. Data integrity analysis

Recommendation: do not add foreign keys. A05-09 stays PROPOSED. Application checks at a future insert are required and are not a substitute that removes the residual risk.

Candidate reference. `candidates.id` is the live key, and the four live party columns already reference their masters with `ON DELETE RESTRICT ON UPDATE CASCADE`. The proposed `candidate_id` is a plain integer. Validate it by reading `candidates` in the same create transaction and rejecting a missing id. Do not delete an assignment because a candidate is later soft-deleted (`candidates.deleted_at`). The snapshot columns are what keep the history readable. Close does not write `candidate_id`.

Party category and party id. The check constraint can limit `party_category` to the four keys. It cannot prove that `party_id` exists in that category’s table. A future insert must read `agents`, `sub_agents`, `agenciers`, or `companiers` according to the category and reject a miss. Storing an agent id under `companier` is a failed read of `companiers`, not a foreign key. Do not add a database trigger that reimplements referential integrity. That would cross A05-09.

Invalid or orphaned references. Prevent them at insert, while create remains blocked by A05-10. After a successful insert, a missing parent is tolerated: section 3.6 already says the historical row stays. `closed_by_user_id` is taken from `loadCurrentUser` at close, so the close path does not trust a client id. A later missing user row leaves the integer in place.

Deleted or inactive source parties. Party `deleted_at` must not close or rewrite the assignment. That proposal matches the snapshot rule. Live party `status` and `deleted_at` are not an assignment lifecycle. This review does not add a rule that an inactive party cannot be assigned. That question belongs with create, which A05-10 still blocks.

Application validation is not sufficient against a direct SQL insert, a bug that skips the read, or a parent change after commit. Those are the residual risks of omitting foreign keys. Technical approval of D1 has to state that those risks are accepted. It must not “fix” them by adding a key or by deleting rows that would fail a key.

Trade-off. A foreign key would reject a missing parent and would block parent removal, which is what the live candidate links do today. It would also force a decision about existing and future rows that do not match, which A05-09 does not allow. The snapshot columns, not the live join, are what satisfy the approved history rule.

### 4. Authorization analysis

The proposed closer set matches the stored role names `sadmin`, `admin`, and `owner`. It is compatible with the session architecture when the actor is the `AccessUser` from `loadCurrentUser`.

The token cannot carry a role. `verifySessionToken` accepts `sid`, subject, and expiry. The role is read from the database on the request. A client cannot grant itself `admin` by editing a claim. Changing `users.role_id` is a database write, not a client manipulation. The close function must ignore any user id or role in the request body.

Inactive users. `roles` has no status. Inactivity is `users.status`. `loadCurrentUser` already drops a session whose status is present and not `A`, so that user never reaches the role comparison. `hasFullAccess` itself does not test status. B10 remains unresolved. This review does not add “status must be `A`” as an assignment rule. It requires the close path to use the existing loader, which already applies that session gate.

Server-side enforcement. The role comparison belongs in the server operation, before the write. There is no assignment route today. A later route must not trust a client check.

Audit attribution. `closed_by_user_id` is `users.id` from that same loaded user. That records the actor A05-01 requires, as an id. It does not copy `users.name`. L3 is the accepted limit.

Menu and CRUD grants. `hasGrant` is menu visibility. `canCandidateAction` allows the three roles to create, edit, and approve candidates, and allows nobody to delete candidates. Those decisions are A07. They do not authorize assignment close, and a candidate `edit_candidates` grant must not close an assignment. `hasPermission` would treat any non-candidate key as allowed for the three roles, so it must not be the close predicate. Closure permission is not quarantine permission under A05-07.

Create, reassign, view, and edit stay unimplemented. A05-10 stays UNRESOLVED.

### 5. Address-field evidence matrix

Sources: `docs/db.txt` `CREATE TABLE` for `agents`, `sub_agents`, `agenciers`, and `companiers`, and the matching Prisma models. No row was classified. No address text is copied here.

| Category | Confirmed source fields | Structure | Ambiguous or missing | Safe snapshot proposal |
| --- | --- | --- | --- | --- |
| Agent | Present and permanent: `*_address_house` `varchar(200)`, `*_address_road` `varchar(20)`, `*_address_village` `varchar(20)`, `*_address_post` `varchar(20)`, `*_address_thana_id`, `*_address_district_id`, `*_address_division_id`. All nullable. `name` is a separate nullable `varchar(100)`. | Two parallel multi-part structures. The three id columns are identifiers. `thanas.name`, `districts.name`, and `divisions.name` are other tables. Prisma indexes those ids and does not declare a relation from `Agent` to those tables. | No column named `address`. Nothing names present versus permanent as the assignment address. Nothing authorizes joining the ids to names or concatenating the parts. | Do not fill `original_address`. B8 remains a required written field rule. Do not concatenate. |
| Sub-Agent | The same present and permanent columns as Agent. `agent_id` is required and is ownership, not an address. `name` is nullable `varchar(100)`. | Same multi-part pair as Agent. | Same gap as Agent. | Same block as Agent. |
| Agencier | `address varchar(255) NULL`. Dump and Prisma agree. `name` is nullable `varchar(255)`. | One string column. Not a house, road, village, and post split. | `country_id`, `owner_name`, `owner_mobile`, and `owner_email` are not address lines. The dump `CREATE TABLE` has no `deleted_at`; Prisma adds `deleted_at`. That difference is not an address field. | Copy `address` as stored, including null. D7. Do not split or trim a meaning into the string. |
| Companier | `address varchar(255) NULL`. Dump and Prisma agree. `name` is nullable `varchar(255)`. | One string column, same as Agencier. | Same non-address columns. The dump `CREATE TABLE` ends at `updated_at`; Prisma adds `deleted_at`. | Copy `address` as stored, including null. D7. |

`agencies.address` and `companies.address` are also single nullable `varchar(255)` columns. They are legacy snapshot columns, not the live master source for this assignment record. Copying them would cross the approved separation.

A null Agencier or Companier `address` stored as null preserves the source. It does not fail A05-06, and A05-06 applies to legacy agency and company rows rather than to these live masters. Agent and Sub-Agent still need an explicit technical and business clarification before any part is chosen. This review does not supply that choice.

### 6. Transaction and concurrency analysis

Two concurrent creates. If an ACTIVE row exists, `FOR UPDATE` on `(candidate_id, party_category)` serializes the readers. Each sees ACTIVE and rolls back without closing it. If no row exists, `FOR UPDATE` locks nothing. Both inserts proceed. The partial unique index `historical_party_assignments_one_active` admits one ACTIVE pair and makes the other statement fail. The index is the control that covers the empty category. The row lock is not.

Close beside create. Close locks the assignment id. Create locks rows for that candidate and category. They share the ACTIVE row, so one waits. After a committed close, a later create sees CLOSED and may insert. That is the approved order: close first, then a new row, in separate transactions. Create must not close inside its own transaction.

Two closes. The partial unique index does not serialize updates. PostgreSQL locks the row on UPDATE. Combined with `WHERE status = 'ACTIVE'`, the second update changes zero rows. The explicit `SELECT … FOR UPDATE` matches that behavior and matches locks already used in this codebase. Read committed is enough for this rule. Serializable isolation is not required and is not proposed.

The index is sufficient for “one ACTIVE pair.” It is not sufficient on its own for “close only once.” Both controls stay.

Unique conflicts. On `23505` for this index, roll back and report that an ACTIVE assignment already exists. Do not retry the insert in the same request. A retry after the other transaction committed would fail again or, if the winner had rolled back, could create an assignment the caller did not successfully submit. Do not close the row that won the race.

Timestamps. `clock_timestamp()` in the database is the approved clock for a new fact. Use it once per insert and once per close. Do not read `candidates.created_at`, `agencies.created_at`, or `companies.created_at`. Do not use the application clock. A BEFORE INSERT trigger that assigns `became_active_at` stops a bound client value. `closed_at` is assigned in the close update the same way. Separate transactions keep the close time and a later activation time ordered by their own commits.

No additional lifecycle state is added.

### 7. Snapshot immutability recommendations

Immutable after insert: `original_name`, `original_address`, `became_active_at`, `candidate_id`, `party_category`, and `party_id`.

Written once, on the ACTIVE-to-CLOSED transition, then immutable: `status`, `closure_reason`, `closed_by_user_id`, and `closed_at`.

No permitted operation in this specification may update the first six. The close operation is the only permitted update, and only for that transition. A05-10 still blocks edit. A later edit approval must not change these fields. The trigger is what enforces that if a statement bypasses the service.

Enforcement. Prefer the database trigger in H1 over service convention alone. Service code copies the live name and the allowed address and does not accept snapshot text from the client. The Agencier and Companier source is the single `address` column. Agent and Sub-Agent create stays blocked until B8, including a create that would store a null address while parts exist.

Readable history. The assignment row holds the name and address. A later change to a master name, an address column, or party `deleted_at` does not write back. A missing parent does not delete the assignment. View of that row is still blocked by A05-10, so “readable” here means the stored columns survive. It does not grant a reader.

### 8. Legacy preservation review

The design leaves all 265 `agencies` rows and all 263 `companies` rows in place, including repeated `candidate_id` values and the identical company groups recorded by the section 5.4 audit. It does not load them into `historical_party_assignments`. A matching candidate id is not a mapping. That matches A05-05 and A05-08.

The 11 agency references and 10 company references whose candidate ids were absent from the dump’s `candidates` table stay “held for review” as aggregates. This review did not list them, did not open the database, and does not classify them as invalid or orphaned.

Exact duplicates stay until a later reconciliation and an explicit disposition. Missing addresses do not, under A05-06, invalidate a legacy row. Placeholder and test-name criteria are not written, so this design correctly has no name classifier.

Future controls that do not change legacy data:

- Keep `assertLegacySnapshotPreserved` as the application refusal for ordinary writes. Do not extend this review into a code change.
- Record quarantine outcomes in a written reconciliation, not in a table, column, or workflow.
- Cite source-data evidence in that writing. A candidate id or a non-blank name is not clearance by itself.
- Do not deduplicate, do not order rows by `id`, `created_at`, or `updated_at`, and do not delete.
- Do not add a quarantine table. That remains B4.

Row-level reconciliation is still not recorded. Migration stays unapproved.

### 9. Decision classification matrix

| ID | Proposal | Class |
| --- | --- | --- |
| D1 | New `historical_party_assignments` table, no foreign key, no `deleted_at`, no sequence | 1. Technically sound within current approvals. Build still waits for technical approval, and that approval must record the H3 residual risk. |
| D2 | Partial unique index for one ACTIVE pair | 1. Technically sound. M1 is the handling rule for the unique violation. |
| D3 | Close transaction updates only the four closure fields | 2. Needs clarification before implementation: H1 trigger predicate and M3 check order. |
| D4 | Role-name authorization, not `hasFullAccess` and not menu grants | 2. Needs clarification before implementation: H2 session `roleName` predicate. |
| D5 | Database-clock timestamps | 2. Needs clarification before implementation: M2 trigger assignment so a client clock cannot be stored. |
| D6 | Snapshot immutability trigger | 2. Needs clarification before implementation: H1, including DELETE and CLOSED closure facts. |
| D7 | Copy Agencier and Companier `address` as-is, including null | 1. Technically sound. The single column is confirmed. |
| D8 | Legacy rows remain untouched and are not loaded by candidate id | 1. Technically sound within A05-05 and A05-08. |
| D9 | Quarantine outcomes recorded in writing, not in a table | 1. Technically sound. The writing is still absent, so migration stays blocked. |
| B1 | Foreign keys | 4. Conflicts with A05-09. Must not proceed. |
| B2 | Create, reassign, view, or edit handlers or permission keys | 4. Conflicts with unresolved A05-10. Must not proceed. |
| B3 | Employer lifecycle | 4. Conflicts with unresolved A05-11 and A20. Must not proceed. |
| B4 | Quarantine table, workflow, or legacy migration | 4. Conflicts with the current boundary. Must not proceed. |
| B5 | Sequence or order column | 4. Conflicts with A05-08. Must not proceed. |
| B6 | Assignment `deleted_at` or physical delete | 4. Conflicts with A05-03. Must not proceed. |
| B7 | Party-delete changes, or writing candidate party ids from this lifecycle | 4. Conflicts with the stated boundary. Must not proceed. |
| B8 | Which Agent and Sub-Agent parts form `original_address` | 3. Requires explicit technical approval, and a business field clarification. The dump does not establish the answer. Must not be invented. |
| B9 | Placeholder and test-name criteria | 3. Requires an explicit written rule under A05-06. Must not be invented here. |
| B10 | Requiring `users.status = 'A'` as an assignment rule | 2. Needs no new rule if close uses `loadCurrentUser`. Do not approve B10 silently. |

### 10. Remaining decisions before implementation

1. Technical approval or rejection of D1 through D9, including the H1 trigger text, the H2 role predicate, the H3 residual-risk statement, and the M1 and M2 conflict and clock rules.
2. B8, a written choice of Agent and Sub-Agent address parts, before either category can store `original_address`.
3. A05-10, before any create, reassign, view, or edit behavior.
4. A05-09 stays PROPOSED. No foreign key until that boundary changes.
5. A05-11 and A20, before any Employer behavior.
6. Written placeholder and test-name criteria, before any legacy name test.
7. The A05-07 reconciliation document, before any migration approval.
8. B10 stays open. The session loader’s existing non-`A` refusal is not a new assignment rule.

Rejecting D1 stops the sequence in section 11. None of that sequence is authorized by this review.

### 11. Final implementation-readiness verdict

**NOT READY — specific technical gaps or unresolved decisions remain.**

A05-01 through A05-08 are approved business rules. The open items are technical approval, the clarifications in this review, and the boundaries A05-09, A05-10, A05-11, B8, and B9. This review changed only this document. It did not change application source, Prisma schema, migrations, seeds, tests, configuration, or environment files. It did not connect to a database, run a migration, or modify legacy records.
