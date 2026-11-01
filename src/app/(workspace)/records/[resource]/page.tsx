import Link from "next/link";
import { notFound } from "next/navigation";
import { canBrowseTable, canMutateTable, hasFullAccess } from "@/lib/auth/permissions";
import { pool } from "@/lib/db";
import { BreadTable } from "@/components/records/bread-table";
import { CandidateFile } from "@/components/records/candidate-file";
import { CandidateBoard } from "@/components/records/candidate-board";
import { RowActions } from "@/components/records/row-actions";
import { displayValue } from "@/lib/utils";
import { breadPageSize, listBread } from "@/server/browse";
import { listCandidateBoard } from "@/server/candidate-board";
import { CANDIDATE_STEP_BY_SLUG, loadCandidateFile } from "@/server/candidate-file";
import { requireUser } from "@/server/current-user";
import { listRecords, PAGE_SIZE, resolveResource } from "@/server/resources";
import { queueExportAction } from "@/app/(workspace)/records/actions";

export const dynamic = "force-dynamic";

export default async function ResourceListPage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ q?: string; page?: string; size?: string; field?: string; group?: string; agent?: string; agency?: string; company?: string; position?: string; candidate?: string; exam?: string }>;
}) {
  const { resource: slug } = await params;
  const query = await searchParams;
  const resource = resolveResource(slug);
  const user = await requireUser();
  if (resource?.slug === "candidates") {
    try {
      const filters = {
        q: query.q ?? "",
        field: query.field ?? "name",
        group: query.group ?? "",
        agent: query.agent ?? "",
        agency: query.agency ?? "",
        company: query.company ?? "",
        position: query.position ?? "",
        page: Number(query.page ?? "1"),
      };
      const board = await listCandidateBoard(user, filters);
      return (
        <CandidateBoard
          rows={board.rows}
          total={board.total}
          page={board.page}
          filters={filters}
          canCreate={canMutateTable(user, resource.table, "add")}
          canEdit={canMutateTable(user, resource.table, "edit")}
          canDelete={canMutateTable(user, resource.table, "delete")}
          options={board.options}
          showGroupAndAgent={user.roleName !== "Agency" && user.roleName !== "Agencier"}
        />
      );
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("access")) throw error;
      return (
        <section className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">Candidates</h1>
          <p className="mt-2 text-sm text-muted">You do not have access to this module.</p>
        </section>
      );
    }
  }
  const candidate = /^\d+$/.test(query.candidate ?? "") ? query.candidate ?? "" : "";
  const exam = /^\d+$/.test(query.exam ?? "") ? query.exam ?? "" : "";
  try {
    const bread = await listBread(user, slug, query.q ?? "", Number(query.page ?? "1"), candidate ? Number(candidate) : null, breadPageSize(query.size), exam ? Number(exam) : null);
    if (bread) {
      const receiptByInvoice = new Map<number, number>();
      if (bread.table === "invoices" && bread.rows.length) {
        const receipts = await pool.query(
          `SELECT DISTINCT ON (invoice_id) invoice_id, id
           FROM invoice_money_receipts
           WHERE invoice_id = ANY($1::int[])
           ORDER BY invoice_id, id DESC`,
          [bread.rows.map((row) => row.id)],
        );
        for (const row of receipts.rows as Array<{ invoice_id: number; id: number }>) {
          receiptByInvoice.set(Number(row.invoice_id), Number(row.id));
        }
      }
      const step = CANDIDATE_STEP_BY_SLUG[slug] ?? CANDIDATE_STEP_BY_SLUG[bread.slug];
      const file = candidate && step ? await loadCandidateFile(user, Number(candidate)) : null;
      const table = (
        <BreadTable
          bread={bread}
          q={query.q ?? ""}
          candidate={candidate}
          exam={exam}
          canCreate={bread.table !== "media" && bread.table !== "settings" && canMutateTable(user, bread.table, "add")}
          canEdit={canMutateTable(user, bread.table, "edit")}
          canDelete={canMutateTable(user, bread.table, "delete")}
          linkRows={bread.table !== "media" && bread.table !== "settings"}
          extraFor={(id) => {
            if (bread.slug === "exams" && canBrowseTable(user, "exam_results")) {
              return [{ href: `/records/exam-results?exam=${id}`, label: "Result" }];
            }
            if (bread.table !== "invoices") return [];
            const receiptId = receiptByInvoice.get(id);
            return [
              { href: `/api/exports/pdf?resource=invoices&id=${id}`, label: "Export Invoice" },
              receiptId
                ? { href: `/records/invoice-money-receipts/${receiptId}`, label: "Export Receipt" }
                : { href: `/records/invoice-money-receipts/new?invoice=${id}`, label: "Add Receipt" },
            ];
          }}
        />
      );
      if (file && step) {
        return (
          <div className="space-y-5">
            <CandidateFile file={file} step={step} />
            {table}
          </div>
        );
      }
      return table;
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("access")) throw error;
    return (
      <section className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">{resource?.title ?? slug}</h1>
        <p className="mt-2 text-sm text-muted">You do not have access to this module.</p>
      </section>
    );
  }
  if (!resource) notFound();
  let result: Awaited<ReturnType<typeof listRecords>>;
  try {
    result = await listRecords(resource, user, query.q ?? "", Number(query.page ?? "1"));
  } catch {
    return (
      <section className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">{resource.title}</h1>
        <p className="mt-2 text-sm text-muted">You do not have access to this module.</p>
      </section>
    );
  }
  const page = result.page;
  const q = query.q ?? "";
  const search = q ? `&q=${encodeURIComponent(q)}` : "";

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{resource.group}</p>
          <h1 className="page-title mt-1">{resource.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {canMutateTable(user, resource.table, "add") ? (
            <Link href={`/records/${resource.slug}/new`} className="btn-primary">
              Add New
            </Link>
          ) : null}
          <Link href={`/api/exports/excel?resource=${resource.slug}&q=${encodeURIComponent(q)}`} className="btn-quiet">
            Excel
          </Link>
          {hasFullAccess(user) ? (
            <form action={queueExportAction}>
              <input type="hidden" name="resource" value={resource.slug} />
              <button type="submit" className="btn-quiet">
                Queue export
              </button>
            </form>
          ) : null}
        </div>
      </div>
      <form className="surface flex items-center gap-3 p-3" action={`/records/${resource.slug}`}>
        <input name="q" defaultValue={q} placeholder="Search records" className="control min-w-0 flex-1" />
        <button type="submit" className="btn-primary">
          Search
        </button>
      </form>
      <div className="surface overflow-x-auto">
        <table className="data-grid min-w-full">
          <thead>
            <tr>
              {resource.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td className="text-muted" colSpan={resource.columns.length + 1}>
                  No rows in your scope.
                </td>
              </tr>
            ) : null}
            {result.rows.map((row) => (
              <tr key={String(row.id)}>
                {resource.columns.map((column) => (
                  <td key={column} className="max-w-xs truncate">
                    {column === "id" ? (
                      <Link href={`/records/${resource.slug}/${String(row.id)}`} className="text-accent">
                        {displayValue(row[column])}
                      </Link>
                    ) : (
                      displayValue(row[column])
                    )}
                  </td>
                ))}
                <td>
                  <RowActions
                    slug={resource.slug}
                    id={Number(row.id)}
                    canEdit={canMutateTable(user, resource.table, "edit")}
                    canDelete={canMutateTable(user, resource.table, "delete")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <p className="text-muted">
          Page {page}. {result.totalCapped > 1000 ? "More than 1000 matches." : `${result.totalCapped} matches.`} {PAGE_SIZE} rows per page.
        </p>
        <div className="flex gap-2">
          {page > 1 ? <Link href={`/records/${resource.slug}?page=${page - 1}${search}`} className="btn-quiet h-9">Previous</Link> : null}
          {result.hasMore ? <Link href={`/records/${resource.slug}?page=${page + 1}${search}`} className="btn-quiet h-9">Next</Link> : null}
        </div>
      </div>
    </section>
  );
}
