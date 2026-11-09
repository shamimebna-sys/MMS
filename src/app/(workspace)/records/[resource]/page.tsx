import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canOperateArc } from "@/lib/arc-records";
import { canOperateMoneyReceipt } from "@/lib/money-receipts";
import { canOperateSubAgentPaymentRequest } from "@/lib/sub-agent-payment-requests";
import { canOperateClassSchedule } from "@/lib/class-schedules";
import { canOperateEuroToBdtRate } from "@/lib/euro-to-bdt-rates";
import { canOperateCurrency } from "@/lib/currencies";
import { canOperateTicketInvoiceMoneyReceipt } from "@/lib/ticket-invoice-money-receipts";
import { canBrowseTable, canMutateTable, hasFullAccess, hasGrant } from "@/lib/auth/permissions";
import { pool } from "@/lib/db";
import { BreadTable } from "@/components/records/bread-table";
import { RecordComposer } from "@/components/records/record-composer";
import { ListingPager, ListingShell, StatusPill } from "@/components/records/listing-frame";
import { addLabel, columnHeading, isStatusColumn, listingDescription } from "@/components/records/listing";
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

const LIST_QUERY = ["q", "page", "size", "field", "group", "agent", "agency", "company", "position", "candidate", "exam"] as const;

function closeHref(slug: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const key of LIST_QUERY) {
    const value = query[key];
    if (!value) continue;
    if (key === "page" && value === "1") continue;
    if (key === "size" && value === "10") continue;
    params.set(key, value);
  }
  const text = params.toString();
  return text ? `/records/${slug}?${text}` : `/records/${slug}`;
}

function formOverlay(
  slug: string,
  query: { create?: string; edit?: string; error?: string; invoice?: string; ticket_invoice?: string; candidate?: string; idempotency_key?: string },
  href: string,
) {
  if (query.create === "1") {
    return (
      <RecordComposer
        slug={slug}
        mode="add"
        invoice={query.invoice}
        ticketInvoice={query.ticket_invoice}
        candidate={query.candidate}
        idempotencyKey={query.idempotency_key}
        error={query.error}
        closeHref={href}
      />
    );
  }
  if (query.edit && /^\d+$/.test(query.edit)) {
    return <RecordComposer slug={slug} mode="edit" id={Number(query.edit)} error={query.error} closeHref={href} />;
  }
  return null;
}

export default async function ResourceListPage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ q?: string; page?: string; size?: string; field?: string; group?: string; agent?: string; agency?: string; company?: string; position?: string; candidate?: string; exam?: string; create?: string; edit?: string; error?: string; invoice?: string; ticket_invoice?: string; idempotency_key?: string }>;
}) {
  const { resource: slug } = await params;
  const query = await searchParams;
  const resource = resolveResource(slug);
  const user = await requireUser();
  if (resource?.slug === "candidates") {
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
    let board: Awaited<ReturnType<typeof listCandidateBoard>> | null = null;
    let denied = false;
    try {
      board = await listCandidateBoard(user, filters);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("access")) throw error;
      denied = true;
    }
    if (denied || !board) {
      return (
        <section className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">Candidates</h1>
          <p className="mt-2 text-sm text-muted">You do not have access to this module.</p>
        </section>
      );
    }
    return (
      <>
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
        {formOverlay("candidates", query, closeHref("candidates", query))}
      </>
    );
  }
  const candidate = /^\d+$/.test(query.candidate ?? "") ? query.candidate ?? "" : "";
  const exam = /^\d+$/.test(query.exam ?? "") ? query.exam ?? "" : "";
  let bread: Awaited<ReturnType<typeof listBread>> = null;
  let denied = false;
  try {
    bread = await listBread(user, slug, query.q ?? "", Number(query.page ?? "1"), candidate ? Number(candidate) : null, breadPageSize(query.size), exam ? Number(exam) : null);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("access")) throw error;
    denied = true;
  }
  if (denied) {
    return (
      <section className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold">{resource?.title ?? slug}</h1>
        <p className="mt-2 text-sm text-muted">You do not have access to this module.</p>
      </section>
    );
  }
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
    const ticketReceiptByInvoice = new Map<number, number>();
    if (bread.table === "ticket_invoices" && bread.rows.length) {
      const receipts = await pool.query(
        `SELECT DISTINCT ON (ticket_invoice_id) ticket_invoice_id, id
         FROM ticket_invoice_money_receipts
         WHERE ticket_invoice_id = ANY($1::int[])
         ORDER BY ticket_invoice_id, id DESC`,
        [bread.rows.map((row) => row.id)],
      );
      for (const row of receipts.rows as Array<{ ticket_invoice_id: number; id: number }>) {
        ticketReceiptByInvoice.set(Number(row.ticket_invoice_id), Number(row.id));
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
        canEdit={bread.table === "settings" ? hasGrant(user, "edit_settings") : canMutateTable(user, bread.table, "edit")}
        canDelete={bread.table === "settings" ? false : canMutateTable(user, bread.table, "delete")}
        canView={(bread.table !== "settings" || hasGrant(user, "read_settings")) && (bread.table !== "arcs" || canOperateArc(user, "read")) && (bread.table !== "invoice_money_receipts" || canOperateMoneyReceipt(user, "read")) && (bread.table !== "sub_agent_payment_requests" || canOperateSubAgentPaymentRequest(user, "read")) && (bread.table !== "class_schedules" || canOperateClassSchedule(user, "read")) && (bread.table !== "euro_to_bdt_rates" || canOperateEuroToBdtRate(user, "read")) && (bread.table !== "currencies" || canOperateCurrency(user, "read")) && (bread.table !== "ticket_invoice_money_receipts" || canOperateTicketInvoiceMoneyReceipt(user, "read"))}
        linkRows={bread.table !== "media" && (bread.table !== "settings" || hasGrant(user, "read_settings") || hasGrant(user, "edit_settings"))}
        embedded={Boolean(file && step)}
        extraFor={(id) => {
          if (bread.slug === "exams" && canBrowseTable(user, "exam_results")) {
            return [{ href: `/records/exam-results?exam=${id}`, label: "Result" }];
          }
          if (bread.table === "ticket_invoices") {
            const receiptId = ticketReceiptByInvoice.get(id);
            return [
              receiptId
                ? { href: `/records/ticket-invoice-money-receipts/${receiptId}`, label: "Receipt" }
                : { href: `/records/ticket-invoice-money-receipts?create=1&ticket_invoice=${id}`, label: "Add Receipt" },
            ];
          }
          if (bread.table !== "invoices") return [];
          const receiptId = receiptByInvoice.get(id);
          return [
            { href: `/api/exports/pdf?resource=invoices&id=${id}`, label: "Export Invoice" },
            receiptId
              ? { href: `/records/invoice-money-receipts/${receiptId}`, label: "Export Receipt" }
              : { href: `/records/invoice-money-receipts?create=1&invoice=${id}`, label: "Add Receipt" },
          ];
        }}
      />
    );
    const overlay = formOverlay(bread.slug, query, closeHref(slug, query));
    if (file && step) {
      return (
        <div className="record-canvas">
          <CandidateFile file={file} step={step} />
          {table}
          {overlay}
        </div>
      );
    }
    return (
      <>
        {table}
        {overlay}
      </>
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

  const matchLabel = result.totalCapped > 1000 ? "More than 1000 matches." : `${result.totalCapped} matches.`;

  return (
    <>
    <ListingShell
      title={resource.title}
      description={listingDescription(resource.slug, resource.title)}
      count={`Page ${page}. ${matchLabel} ${PAGE_SIZE} rows per page.`}
      action={
        <>
          <Link href={`/api/exports/excel?resource=${resource.slug}&q=${encodeURIComponent(q)}`} className="listing-btn">
            Excel
          </Link>
          {hasFullAccess(user) ? (
            <form action={queueExportAction}>
              <input type="hidden" name="resource" value={resource.slug} />
              <button type="submit" className="listing-btn">
                Queue export
              </button>
            </form>
          ) : null}
          {canMutateTable(user, resource.table, "add") ? (
            <Link
              href={`/records/${resource.slug}?${new URLSearchParams({ ...(q ? { q } : {}), ...(page > 1 ? { page: String(page) } : {}), create: "1" }).toString()}`}
              scroll={false}
              className="listing-cta"
            >
              <Plus className="h-4 w-4" />
              {addLabel(resource.title)}
            </Link>
          ) : null}
        </>
      }
      toolbar={
        <form className="listing-toolbar" action={`/records/${resource.slug}`}>
          <label className="listing-search">
            <span className="sr-only">Search {resource.title}</span>
            <Search className="listing-search-icon" />
            <input name="q" defaultValue={q} placeholder={`Search ${resource.title.toLowerCase()}…`} className="listing-field" />
          </label>
          <button type="submit" className="listing-btn">
            Search
          </button>
          {q ? (
            <Link href={`/records/${resource.slug}`} className="listing-clear">
              Clear all
            </Link>
          ) : null}
        </form>
      }
      footer={
        <ListingPager
          page={page}
          previousHref={page > 1 ? `/records/${resource.slug}?page=${page - 1}${search}` : null}
          nextHref={result.hasMore ? `/records/${resource.slug}?page=${page + 1}${search}` : null}
        />
      }
    >
      <table className="listing-table">
        <thead>
          <tr>
            {resource.columns.map((column) => (
              <th key={column}>{columnHeading(column)}</th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.length === 0 ? (
            <tr>
              <td className="listing-empty-cell" colSpan={resource.columns.length + 1}>
                No rows in your scope.
              </td>
            </tr>
          ) : null}
          {result.rows.map((row) => (
            <tr key={String(row.id)}>
              {resource.columns.map((column) => {
                const text = displayValue(row[column]);
                return (
                  <td key={column}>
                    {column === "id" && (resource.table !== "arcs" || canOperateArc(user, "read")) && (resource.table !== "invoice_money_receipts" || canOperateMoneyReceipt(user, "read")) && (resource.table !== "sub_agent_payment_requests" || canOperateSubAgentPaymentRequest(user, "read")) && (resource.table !== "ticket_invoice_money_receipts" || canOperateTicketInvoiceMoneyReceipt(user, "read")) ? (
                      <Link href={`/records/${resource.slug}/${String(row.id)}`} className="listing-id">
                        {text}
                      </Link>
                    ) : isStatusColumn(column) ? (
                      <StatusPill value={text} />
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
              <td className="listing-actions-cell">
                <RowActions
                  slug={resource.slug}
                  id={Number(row.id)}
                  canEdit={canMutateTable(user, resource.table, "edit")}
                  canDelete={canMutateTable(user, resource.table, "delete")}
                  canView={(resource.table !== "arcs" || canOperateArc(user, "read")) && (resource.table !== "invoice_money_receipts" || canOperateMoneyReceipt(user, "read")) && (resource.table !== "sub_agent_payment_requests" || canOperateSubAgentPaymentRequest(user, "read")) && (resource.table !== "class_schedules" || canOperateClassSchedule(user, "read")) && (resource.table !== "euro_to_bdt_rates" || canOperateEuroToBdtRate(user, "read")) && (resource.table !== "currencies" || canOperateCurrency(user, "read")) && (resource.table !== "ticket_invoice_money_receipts" || canOperateTicketInvoiceMoneyReceipt(user, "read"))}
                  appearance="icons"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListingShell>
    {formOverlay(resource.slug, query, closeHref(slug, query))}
  </>
  );
}
