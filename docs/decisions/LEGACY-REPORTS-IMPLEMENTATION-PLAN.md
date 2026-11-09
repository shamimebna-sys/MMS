# Legacy reports — implementation plan

Date: 2026-11-09
Phase: documentation and investigation only
Principle: Legacy First — Rebuild, Don't Redesign

This plan investigates the 17 stored legacy report URIs. It does not implement a report runner, and it does not reopen A05 or any other completed module.

No database was connected to. No migration, seed, or legacy loader was run. No application source, Prisma schema, test, or configuration was changed. Dump evidence below was read from `docs/db.txt` (phpMyAdmin dump, MariaDB 11.8.9, generated 28 October 2026). That file is a captured dump, not a live query.

## 1. Executive summary

The legacy catalog contains 17 active report rows, ids 8 through 24. Each row stores a display name, a `report_uri`, status `A`, and a `params` JSON list of filter keys. Descriptions are null.

Those rows are not queries. The dump names `App\Http\Controllers\Admin\VoyagerReportController` and `App\Models\Report`, and the menu route `voyager.reports.index`. This repository has no PHP, Blade, or other legacy controller source, no SQL for any of the 17 URIs, no column layout, no sort, and no PDF, Excel, or print sample. An exact search of the dump outside the 17 `reports` rows found none of the 17 URIs.

The current application already lists the catalog at `/records/reports`. That list is not a report runner. The generic PDF route writes an audit row with entity type `reports` for dashboard and record exports. It does not read `report_uri`.

Classification: **0 READY, 0 PARTIALLY READY, 17 BLOCKED.**

Known filter labels are not enough to rebuild a report. Building a runner from a URI name, or from a similarly named BREAD screen, would invent the output. All 17 runners stay deferred until the legacy controller, or an equivalent query plus a sample output, is supplied.

## 2. How findings are labeled

| Label | Meaning in this plan |
| --- | --- |
| VERIFIED FROM DATABASE | Read from `docs/db.txt`. Not from a live database connection. |
| VERIFIED FROM SOURCE | Read from application source, Prisma, or repository docs. |
| INFERRED — NOT APPROVED | A name looks related. It is not a query, a join, or a business approval. |
| MISSING EVIDENCE | Not in the dump and not in the repository. |

## 3. Shared evidence

### 3.1 Catalog table

VERIFIED FROM DATABASE. `reports` columns are `id`, `name`, `description`, `params`, `status` (default `A`), `created_at`, `updated_at`, and `report_uri`. The only index is the primary key on `id`. `AUTO_INCREMENT` is 25. Stored ids are 8–24. Ids 1–7 are not in the dump. What those missing ids were is MISSING EVIDENCE.

VERIFIED FROM SOURCE. `prisma/schema.prisma` model `Report` maps those columns. `docs/legacy/column-catalog.json` classifies the table `direct`. `scripts/legacy/build-prisma.mjs` maps the table name to `Report`. None of those files contains a report query.

### 3.2 The 17 rows

VERIFIED FROM DATABASE. Every description is null. Every status is `A`. `params` is a JSON array of objects with `key`, `label`, and `required`. The stored `required` values are the strings `"true"` and `"false"`. The JSON does not store an input type, an option list, a default, a column, or a table.

| Id | Name | URI | Created | Updated |
| --- | --- | --- | --- | --- |
| 8 | Agent Ledger | `agent-ledger` | 2022-07-15 18:22:04 | 2025-04-16 21:22:00 |
| 9 | Agent Report | `agent-report` | 2025-09-03 00:15:24 | 2025-09-03 00:15:24 |
| 10 | Selected Candidate Report | `selected-candidate-report` | 2025-09-03 00:40:27 | 2025-09-03 00:40:27 |
| 11 | Flight Report | `flight-report` | 2025-09-03 00:40:27 | 2025-09-03 00:40:27 |
| 12 | Employee Report | `employee-report` | 2025-09-03 00:40:27 | 2025-09-03 00:40:27 |
| 13 | Exam Report | `exam-report` | 2025-09-03 00:40:27 | 2025-09-03 00:40:27 |
| 14 | Flight Schedule | `flight-schedule` | 2026-06-18 10:32:11 | 2026-06-18 10:35:13 |
| 15 | Teacher Schedule Report | `teacher-schedule` | 2026-06-18 10:52:34 | 2026-06-18 10:52:34 |
| 16 | Exam Result Sheet Report | `exam-result-sheet` | 2026-06-18 10:53:35 | 2026-06-18 10:53:35 |
| 17 | Candidate Resume Report | `candidate-resume-report` | 2026-06-18 10:55:14 | 2026-06-18 10:55:14 |
| 18 | Candidate List Report | `candidate-list-report` | 2026-06-18 10:55:14 | 2026-06-18 10:55:14 |
| 19 | Company Report | `company-report` | 2026-06-18 10:58:03 | 2026-06-18 10:58:03 |
| 20 | Police Clearance Report | `police-clearance-report` | 2026-06-18 10:58:03 | 2026-06-18 10:58:03 |
| 21 | ARC Report | `arc-report` | 2026-06-18 10:58:03 | 2026-06-18 10:58:03 |
| 22 | Visa Report | `visa-report` | 2026-06-18 10:58:03 | 2026-06-18 10:58:03 |
| 23 | Tickets Report | `tickets-report` | 2026-06-18 10:58:03 | 2026-06-18 10:58:03 |
| 24 | Money Receipt Report | `money-receipt-report` | 2026-06-18 10:58:03 | 2026-06-18 10:58:03 |

### 3.3 Voyager metadata for the catalog, not for a runner

VERIFIED FROM DATABASE. `data_types` id 27:

- Name and slug: `reports`
- Labels: Report / Reports
- Icon: `voyager-book-download`
- Model: `App\Models\Report`
- Policy: null
- Controller: `App\Http\Controllers\Admin\VoyagerReportController`
- Description: null
- `generate_permissions`: 1
- `server_side`: 0
- Details: `order_column` null, `order_display_column` null, `order_direction` `asc`, `default_search_key` null, `scope` null

The icon name is not a file format. PDF, Excel, and print are MISSING EVIDENCE.

`data_rows` for data type 27, with flags in the dump's column order `required`, `browse`, `read`, `edit`, `add`, `delete`:

| Field | Type | Browse | Read | Edit | Add | Delete | Order |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | text | 0 | 0 | 0 | 0 | 0 | 1 |
| `name` | text | 1 | 1 | 1 | 1 | 1 | 2 |
| `status` | select_dropdown | 1 | 1 | 1 | 1 | 1 | 3 |
| `report_uri` | text | 0 | 1 | 1 | 1 | 1 | 4 |
| `params` | text_area | 0 | 1 | 1 | 1 | 1 | 5 |
| `description` | text_area | 0 | 1 | 1 | 1 | 1 | 6 |
| `created_at` | timestamp | 0 | 0 | 0 | 0 | 0 | 7 |
| `updated_at` | timestamp | 0 | 0 | 0 | 0 | 0 | 8 |

`status` details: default `A`, options `A` = Active and `I` = Inactive. That option list is the catalog row status. It is not the option list for a report filter that happens to be named `status`.

The legacy browse list therefore shows `name` and `status`. It does not show `report_uri`. `order_column` is null, so the `asc` value is not evidence of report-output ordering.

Menu item id 46, menu id 1, title Reports, empty URL, parent null, order 10, route `voyager.reports.index`, parameters null, same icon. No child menu item exists for any of the 17 URIs.

### 3.4 Permissions

VERIFIED FROM DATABASE. The only permission keys whose name contains `report` are the catalog BREAD keys:

| Permission id | Key | Table | Roles in `permission_role` |
| --- | --- | --- | --- |
| 111 | `browse_reports` | `reports` | 1 `sadmin`, 106 `owner` |
| 112 | `read_reports` | `reports` | 1 `sadmin`, 106 `owner` |
| 113 | `edit_reports` | `reports` | 1 `sadmin` |
| 114 | `add_reports` | `reports` | 1 `sadmin` |
| 115 | `delete_reports` | `reports` | 1 `sadmin` |

Role 2 `admin` has none of these five grants in the dump. Neither do Agent, Sub Agent, Agency, Company, Candidate, Teacher, Employee, Employer, User, or others.

There is no permission key per `report_uri`. Who may run a report, and whether running differs from browsing the catalog, is MISSING EVIDENCE. These grants are not approval to execute the 17 URIs.

### 3.5 What this repository implements

VERIFIED FROM SOURCE.

- `src/server/resources.ts` exposes slug `reports` with columns `id`, `name`, `status`, `report_uri`, search on `name`, no soft delete, scope mode `reference`. List queries order by `id` descending. That column set is wider than the legacy browse flags. This plan does not change it.
- `src/server/menu.ts` maps `voyager.reports.index` to `/records/reports` when the resource exists. Menu visibility uses the stored grant `browse_reports` (`hasGrant`). `hasPermission` still returns true for `sadmin`, `admin`, and `owner` without a stored grant. That is current application behavior for the catalog. It is not a legacy role grant, and it is not a runner permission.
- `src/lib/auth/row-scope.ts` shows every `reports` row when the user can browse the table, after the full-access and inactive-role checks. It does not filter by `report_uri`.
- `src/components/records/listing.ts` describes the screen as "Browse saved reports and their status."
- `src/app/api/exports/pdf/route.ts` builds a text PDF of the dashboard pipeline or of one browsable record. The audit entity type is the string `reports` for every such export. The route does not read `reports.report_uri`. It is not evidence of a legacy report format.
- No PHP, Blade, Vue report template, or sample `.xlsx` / report PDF was found. `docs/business-flow.pdf` is an org-flow export, not one of these 17 reports.

### 3.6 Names that must not be reused as the report

VERIFIED FROM DATABASE. These are separate `data_types` rows. None of their slugs equals a report URI. Using one as the body of a report would be INFERRED — NOT APPROVED.

| Report URI | Nearby module that is not that report |
| --- | --- |
| `flight-schedule` | `flight_schedules`, slug `flight-schedules`, controller `VoyagerFlightScheduleController` |
| `teacher-schedule` | `class_schedules`, slug `class-schedules`; `teachers`, slug `teachers` |
| `exam-report` | `exams`, slug `exams` |
| `exam-result-sheet` | `exam_results`, slug `exam-results` |
| `selected-candidate-report` | `selected_candidates`, slug `selected-candidates`, label Banner Candidates |
| `employee-report` | `employees`, slug `employees` |
| `company-report` | `companiers`, slug `companiers`, label Company; also `companies`, slug `companies` |
| `agent-ledger`, `agent-report` | `agents`, slug `agents`; also `payments` |
| `police-clearance-report` | `police_clearances`, slug `police-clearances`; also stale `police_clearance` |
| `arc-report` | `arcs`, slug `arcs` |
| `visa-report` | `visa_immigrations`, slug `visa-immigrations` |
| `tickets-report` | `ticket_invoices`, slug `ticket-invoices`; `ticket_companies` |
| `money-receipt-report` | `invoice_money_receipts` and `ticket_invoice_money_receipts` |
| `candidate-resume-report`, `candidate-list-report` | `candidates`, slug `candidates` |

A filter key such as `agent_id` matches a column name that exists on other tables. That name match is INFERRED — NOT APPROVED. It does not identify the table, the join, or the date column a `from_date` filter applies to.

## 4. Inventory of the 17 reports

Shared gaps, for every row below:

- SQL, joins, and output columns: MISSING EVIDENCE
- Output ordering: MISSING EVIDENCE
- PDF, Excel, print, or on-screen layout: MISSING EVIDENCE
- Option lists and input widgets for filters: MISSING EVIDENCE
- Which table a date filter uses: MISSING EVIDENCE
- Permission to run the URI, separate from catalog BREAD: MISSING EVIDENCE
- Legacy controller body and model body: MISSING EVIDENCE
- Classification: BLOCKED

### 4.1 Agent Ledger — `agent-ledger` — id 8

VERIFIED FROM DATABASE. Params:

- `agent_id`, label Agent, required `"true"`

This is the only report with a required filter. Updated on the same day the catalog BREAD was created, from a 2022 created timestamp. No other dump line contains this URI.

### 4.2 Agent Report — `agent-report` — id 9

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `from_date`, Created From Date
- `to_date`, Created To Date
- `agent_id`, Agent

### 4.3 Selected Candidate Report — `selected-candidate-report` — id 10

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `from_date`, Created From Date
- `to_date`, Created To Date
- `agent_id`, Agent
- `agencier_id`, Agency
- `companier_id`, Company

The Banner Candidates screen is a different slug. INFERRED — NOT APPROVED to treat that screen as this report.

### 4.4 Flight Report — `flight-report` — id 11

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `from_date`, Created From Date
- `to_date`, Created To Date
- `agent_id`, Agent
- `agencier_id`, Agency

### 4.5 Employee Report — `employee-report` — id 12

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `from_date`, Created From Date
- `to_date`, Created To Date
- `agent_id`, Agent
- `agencier_id`, Agency
- `companier_id`, Company

The label Employee does not, by itself, select the `employees` table. INFERRED — NOT APPROVED.

### 4.6 Exam Report — `exam-report` — id 13

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `from_date`, Created From Date
- `to_date`, Created To Date
- `agent_id`, Agent
- `agencier_id`, Agency

### 4.7 Flight Schedule — `flight-schedule` — id 14

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `flight_from_date`, Flight From Date
- `flight_to_date`, Flight To Date
- `from_date`, Created From Date
- `to_date`, Created To Date
- `agencier_id`, Agency
- `agent_id`, Agent
- `payment_status`, Payment Status

The URI is singular. The operational module slug is `flight-schedules`. They are different records. Payment Status has no stored option list on this report row.

### 4.8 Teacher Schedule Report — `teacher-schedule` — id 15

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `teacher_id`, Teacher
- `class_group_id`, Class Group
- `week_day`, Week Day

`class_schedules.week_day` has its own dropdown in that module's BREAD. Copying those day names, or that module's columns, into this report is INFERRED — NOT APPROVED.

### 4.9 Exam Result Sheet Report — `exam-result-sheet` — id 16

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `exam_id`, Exam
- `class_group_id`, Class Group
- `result`, Result Status

Result Status has no stored option list on this row. The `exam_results` module is not this report.

### 4.10 Candidate Resume Report — `candidate-resume-report` — id 17

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `from_date`, Created From Date
- `to_date`, Created To Date
- `agent_id`, Agent
- `agencier_id`, Agency
- `companier_id`, Company
- `position_id`, License Position
- `class_group_id`, Class Group
- `gender`, Gender
- `status`, Status

Gender and Status have no option lists on this row. "Resume" does not identify which candidate columns or files are printed.

### 4.11 Candidate List Report — `candidate-list-report` — id 18

VERIFIED FROM DATABASE. Params match Candidate Resume Report, key for key and label for label, including `position_id` labeled License Position, `gender`, and `status`. All required `"false"`.

The identical filter list is not evidence that the two outputs are the same. Columns and layout remain MISSING EVIDENCE for each URI separately.

### 4.12 Company Report — `company-report` — id 19

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `from_date`, Created From Date
- `to_date`, Created To Date
- `status`, Status

There is no company id filter on this row. Choosing `companiers` or `companies` as the source would be INFERRED — NOT APPROVED.

### 4.13 Police Clearance Report — `police-clearance-report` — id 20

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `from_date`, Created From Date
- `to_date`, Created To Date
- `candidate_id`, Candidate
- `status`, Status

### 4.14 ARC Report — `arc-report` — id 21

VERIFIED FROM DATABASE. Params match Police Clearance Report: `from_date`, `to_date`, `candidate_id`, `status`. All required `"false"`. Same filters are not the same report.

### 4.15 Visa Report — `visa-report` — id 22

VERIFIED FROM DATABASE. Params match Police Clearance Report and ARC Report. All required `"false"`. The visa module slug is `visa-immigrations`, not `visa-report`.

### 4.16 Tickets Report — `tickets-report` — id 23

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `from_date`, Invoice From Date
- `to_date`, Invoice To Date
- `candidate_id`, Candidate
- `companier_id`, Company
- `status`, Status

The date labels say Invoice. Which invoice table, and whether ticket invoices are included, is MISSING EVIDENCE.

### 4.17 Money Receipt Report — `money-receipt-report` — id 24

VERIFIED FROM DATABASE. Params, all required `"false"`:

- `from_date`, Receipt From Date
- `to_date`, Receipt To Date
- `payment_method`, Payment Method

Two money-receipt modules exist. This row does not say which one, or whether both, are included. Payment Method has no stored option list.

## 5. Data-source and query mapping

No query is verified for any URI.

VERIFIED FROM DATABASE where a mapping would have to come from: only `reports.params`. That JSON names filter keys and labels. It names no table and no SQL.

INFERRED — NOT APPROVED: any join from those keys to `agents`, `agenciers`, `companiers`, `candidates`, `teachers`, `class_groups`, `exams`, `positions`, `payments`, `flight_schedules`, `employees`, `police_clearances`, `arcs`, `visa_immigrations`, `ticket_invoices`, `invoice_money_receipts`, or `ticket_invoice_money_receipts`.

## 6. Filters, columns, and output formats

Filters: verified only as the key, label, and required flag in section 4.

Columns: MISSING EVIDENCE for all 17.

Ordering: MISSING EVIDENCE for all 17. Catalog `order_direction: asc` with a null `order_column` is BREAD metadata, not a report sort.

Formats: MISSING EVIDENCE for all 17. The Voyager icon `voyager-book-download` is not a format decision. The current PDF route is not a legacy report sample.

## 7. Permission mapping

Verified mapping is the catalog only. See section 3.4.

| Action | Legacy dump grant | Per-URI run permission |
| --- | --- | --- |
| Browse the report catalog | `sadmin`, `owner` | Not applicable |
| Read a catalog row | `sadmin`, `owner` | Not applicable |
| Edit, add, or delete a catalog row | `sadmin` | Not applicable |
| Run `agent-ledger` or any other URI | MISSING EVIDENCE | MISSING EVIDENCE |

`admin` is not in the dump grants for `browse_reports`. The current app's full-access permission check is a separate, already shipped catalog behavior. This plan does not extend it to a runner and does not change it.

## 8. Missing evidence

One controller gap blocks all 17:

1. `App\Http\Controllers\Admin\VoyagerReportController` source, or the route file that dispatches `report_uri`.
2. `App\Models\Report` source, if it contains scopes, accessors, or query helpers. The dump's `policy_name` is null, so no policy class is named.
3. Any view, Blade, Vue, export class, or print stylesheet referenced by that controller.
4. The SQL or query builder for each URI, including joins, date columns, and `ORDER BY`.
5. Output columns, headings, totals, and grouping for each URI.
6. Filter widgets and option lists, especially `status`, `payment_status`, `result`, `gender`, `week_day`, and `payment_method`.
7. One sample output per URI, with the filter values that produced it. PDF, Excel, and a printed page are all useful. A sample without the filters used is weaker, but still evidence of columns.
8. Who may run each URI. Catalog BREAD grants do not answer that.
9. What report ids 1–7 were, if anything. Not required to rebuild the 17 surviving rows, and not something to invent.

## 9. Classification and sequence

| URI | Class | Why |
| --- | --- | --- |
| All 17 URIs in section 4 | BLOCKED | Identity and filter labels are known. Query, columns, order, format, and run permission are not. |

READY: 0. PARTIALLY READY: 0. BLOCKED: 17.

No report can be implemented independently without new source evidence. Filter forms would still invent the result. Similarly named BREAD screens are already separate modules and are not substitutes.

Sequence, which is an evidence request order and not a build order:

1. Obtain the controller and model before writing any runner. One file may unblock every URI, or it may show that each URI is still custom.
2. After that source is in hand, reclassify each URI. Do not start the ones the controller still does not define.
3. For sample collection, start with Agent Ledger (`agent-ledger`). It is the oldest row and the only row with a required filter, so one sample has a small input. It is still BLOCKED until the sample or the query exists. Do not implement it from the name.
4. Then collect samples for the remaining ids in numeric order. Candidate Resume Report and Candidate List Report need separate samples even though their filters match. Police Clearance, ARC, and Visa need separate samples for the same reason. Money Receipt needs a sample that shows which receipt tables are included.

There is no first report to implement on the evidence in this repository.

## 10. Files or samples needed from the user

Exact files, if they can be copied from the legacy application tree:

- `app/Http/Controllers/Admin/VoyagerReportController.php`
- `app/Models/Report.php`
- Any view under `resources/views` referenced by that controller, including exports
- Any class the controller calls for Excel, PDF, or print
- Routes that mention `report_uri` or the 17 slugs, if they are not inside the controller

If the PHP tree is gone, one output sample per URI is the replacement. Minimum useful sample: the rendered file plus the filter values used. A blank run and a filtered run are both useful for Agent Ledger, because its agent filter is required.

Not sufficient:

- A screenshot of the catalog list
- The `params` JSON, which this plan already records
- An export of `flight-schedules`, `exam-results`, `invoice-money-receipts`, or another nearby module

## 11. Reports that remain deferred

All 17 runners remain deferred:

`agent-ledger`, `agent-report`, `selected-candidate-report`, `flight-report`, `employee-report`, `exam-report`, `flight-schedule`, `teacher-schedule`, `exam-result-sheet`, `candidate-resume-report`, `candidate-list-report`, `company-report`, `police-clearance-report`, `arc-report`, `visa-report`, `tickets-report`, `money-receipt-report`.

The existing `/records/reports` catalog stays as it is. This plan does not add a runner, a filter form, a query, or a new permission.

## 12. What was not done

- No report UI and no report API.
- No application source, Prisma schema, migration, seed, test, or configuration edit.
- No database connection, query, or write.
- No migration, seed, or legacy loader.
- No commit, stash, reset, revert, restore, clean, or discard.
- No staging or production operation.
- A05 and other completed modules were not reopened.
