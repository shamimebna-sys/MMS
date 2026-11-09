import Link from "next/link";
import { notFound } from "next/navigation";
import { AnnouncementClassGroups } from "@/components/records/announcement-class-groups";
import { Experiences } from "@/components/records/experiences";
import { Educations } from "@/components/records/educations";
import { Skills } from "@/components/records/skills";
import { Trainings } from "@/components/records/trainings";
import { LanguageList } from "@/components/records/language-list";
import { Thanas } from "@/components/records/thanas";
import { Upazilas } from "@/components/records/upazilas";
import { NotificationClassGroups } from "@/components/records/notification-class-groups";
import { CandidateInside } from "@/components/records/candidate-inside";
import { InvoiceCandidates } from "@/components/records/invoice-candidates";
import { LicensePositions } from "@/components/records/license-positions";
import { InvoiceLines } from "@/components/records/invoice-lines";
import { TicketInvoiceLines } from "@/components/records/ticket-invoice-lines";
import { RecordComposer } from "@/components/records/record-composer";
import { FileValue } from "@/components/media/file-value";
import { RowActions } from "@/components/records/row-actions";
import { canOperateArc, isArcSlug } from "@/lib/arc-records";
import { canOperateMoneyReceipt, isMoneyReceiptSlug } from "@/lib/money-receipts";
import { canOperateSubAgentPaymentRequest, isSubAgentPaymentRequestSlug } from "@/lib/sub-agent-payment-requests";
import { canOperateClassSchedule, isClassScheduleSlug } from "@/lib/class-schedules";
import { canOperateEuroToBdtRate, isEuroToBdtRateSlug } from "@/lib/euro-to-bdt-rates";
import { canOperateCurrency, isCurrencySlug } from "@/lib/currencies";
import { canOperateTicketInvoiceMoneyReceipt, isTicketInvoiceMoneyReceiptSlug } from "@/lib/ticket-invoice-money-receipts";
import { canMutateTable, hasGrant } from "@/lib/auth/permissions";
import { displayValue } from "@/lib/utils";
import { readBread, readCandidateDetailAccess } from "@/server/browse";
import { requireUser } from "@/server/current-user";
import { loadAnnouncementClassGroups } from "@/server/announcement-class-groups";
import { loadExperiences } from "@/server/experiences";
import { loadEducations } from "@/server/educations";
import { loadSkills } from "@/server/skills";
import { loadTrainings } from "@/server/trainings";
import { loadLanguageList } from "@/server/language-list";
import { loadThanas } from "@/server/thanas";
import { loadUnions } from "@/server/unions";
import { loadUpazilas } from "@/server/upazilas";
import { loadNotificationClassGroups } from "@/server/notification-class-groups";
import { loadInvoiceCandidates } from "@/server/invoice-candidates";
import { loadLicensePositions } from "@/server/license-positions";
import { loadInvoiceLines } from "@/server/invoice-lines";
import { loadTicketInvoiceLines } from "@/server/ticket-invoice-lines";
import { readRecord, resolveResource } from "@/server/resources";

export const dynamic = "force-dynamic";

export default async function RecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string; id: string }>;
  searchParams: Promise<{ stamp?: string; error?: string; edit?: string }>;
}) {
  const { resource: slug, id } = await params;
  const query = await searchParams;
  const resource = resolveResource(slug);
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();
  const user = await requireUser();
  if ((isArcSlug(slug) || resource?.table === "arcs") && !canOperateArc(user, "read")) {
    return <p className="text-sm text-muted">You do not have access to this record.</p>;
  }
  if ((isMoneyReceiptSlug(slug) || resource?.table === "invoice_money_receipts") && !canOperateMoneyReceipt(user, "read")) {
    return <p className="text-sm text-muted">You do not have access to this record.</p>;
  }
  if ((isSubAgentPaymentRequestSlug(slug) || resource?.table === "sub_agent_payment_requests") && !canOperateSubAgentPaymentRequest(user, "read")) {
    return <p className="text-sm text-muted">You do not have access to this record.</p>;
  }
  if ((isClassScheduleSlug(slug) || resource?.table === "class_schedules") && !canOperateClassSchedule(user, "read")) {
    return <p className="text-sm text-muted">You do not have access to this record.</p>;
  }
  if ((isEuroToBdtRateSlug(slug) || resource?.table === "euro_to_bdt_rates") && !canOperateEuroToBdtRate(user, "read")) {
    return <p className="text-sm text-muted">You do not have access to this record.</p>;
  }
  if ((isCurrencySlug(slug) || resource?.table === "currencies") && !canOperateCurrency(user, "read")) {
    return <p className="text-sm text-muted">You do not have access to this record.</p>;
  }
  if ((isTicketInvoiceMoneyReceiptSlug(slug) || resource?.table === "ticket_invoice_money_receipts") && !canOperateTicketInvoiceMoneyReceipt(user, "read")) {
    return <p className="text-sm text-muted">You do not have access to this record.</p>;
  }
  if (resource?.slug === "candidates") {
    try {
      const visible = await readCandidateDetailAccess(user, numericId);
      if (visible === true) return <CandidateInside id={numericId} stamp={query.stamp === "Y"} error={query.error} />;
      if (visible === false) notFound();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("access")) throw error;
      return <p className="text-sm text-muted">You do not have access to this module.</p>;
    }
  }
  let bread: Awaited<ReturnType<typeof readBread>> = null;
  try {
    bread = await readBread(user, slug, numericId);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("access")) throw error;
    return <p className="text-sm text-muted">You do not have access to this module.</p>;
  }
  let row: Record<string, unknown> | null = null;
  if (!bread && resource) {
    try {
      row = await readRecord(resource, user, numericId);
    } catch {
      return <p className="text-sm text-muted">You do not have access to this module.</p>;
    }
  }
  if (!bread && !row) notFound();
  const invoiceVisible = bread?.table === "invoices" || resource?.table === "invoices";
  const invoiceLines = invoiceVisible ? await loadInvoiceLines(numericId) : null;
  const invoiceCandidates = invoiceVisible ? await loadInvoiceCandidates(numericId) : null;
  const licenseVisible = bread?.table === "licenses" || resource?.table === "licenses";
  const licensePositions = licenseVisible ? await loadLicensePositions(numericId) : null;
  const announcementVisible = bread?.table === "announcements" || resource?.table === "announcements";
  const announcementClassGroups = announcementVisible ? await loadAnnouncementClassGroups(numericId) : null;
  const notificationVisible = bread?.table === "notifications" || resource?.table === "notifications";
  const notificationClassGroups = notificationVisible ? await loadNotificationClassGroups(numericId) : null;
  const userVisible = bread?.table === "users" || resource?.table === "users";
  const experiences = userVisible ? await loadExperiences(numericId) : null;
  const educations = userVisible ? await loadEducations(numericId) : null;
  const skills = userVisible ? await loadSkills(numericId) : null;
  const trainings = userVisible ? await loadTrainings(numericId) : null;
  const languageList = userVisible ? await loadLanguageList(numericId) : null;
  const districtVisible = bread?.table === "districts" || resource?.table === "districts";
  const thanas = districtVisible ? await loadThanas(numericId) : null;
  const upazilas = districtVisible ? await loadUpazilas(numericId) : null;
  const unions = upazilas ? await loadUnions(upazilas.map((row) => row.id)) : null;
  const ticketInvoiceVisible = bread?.table === "ticket_invoices" || resource?.table === "ticket_invoices";
  const ticketInvoiceLines = ticketInvoiceVisible ? await loadTicketInvoiceLines(numericId) : null;
  const title = bread?.title ?? resource?.title ?? slug;
  const listSlug = bread?.slug ?? resource?.slug ?? slug;
  const isCandidate = resource?.slug === "candidates" || bread?.table === "candidates" || slug === "candidates";
  if (isCandidate) return <CandidateInside id={numericId} stamp={query.stamp === "Y"} error={query.error} />;

  const editing = query.edit === String(numericId);
  const closeHref = `/records/${listSlug}/${numericId}${query.stamp === "Y" ? "?stamp=Y" : ""}`;
  return (
    <>
    <section className="record-canvas">
      <header className="record-header">
        <div className="min-w-0">
          <Link href={`/records/${listSlug}`} className="record-kicker">
            {title}
          </Link>
          <h1 className="record-title">
            {title} {numericId}
          </h1>
          <p className="record-lead">Review the details stored on this record.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bread ? (
            <RowActions
              slug={listSlug}
              id={numericId}
              canEdit={bread.table === "settings" ? hasGrant(user, "edit_settings") : canMutateTable(user, bread.table, "edit")}
              canDelete={bread.table === "settings" ? false : canMutateTable(user, bread.table, "delete")}
              canView={bread.table !== "settings" || hasGrant(user, "read_settings")}
              appearance="icons"
            />
          ) : null}
          {resource ? (
            <Link href={`/api/exports/pdf?resource=${resource.slug}&id=${numericId}`} className="listing-btn">
              PDF
            </Link>
          ) : null}
        </div>
      </header>
      <div className="record-card">
        <div className="record-card-body">
          <h2 className="record-section-title">Record details</h2>
          <p className="record-section-copy">Values currently stored for this record.</p>
          <dl className="record-grid record-facts">
            {bread
              ? bread.fields.map((field, index) => (
                  <div key={`${field.label}-${index}`} className="record-fact">
                    <dt>{field.label}</dt>
                    <dd>
                      <FileValue value={field.value} className="h-28 w-24 rounded-lg object-cover" />
                    </dd>
                  </div>
                ))
              : resource?.columns.map((column) => (
                  <div key={column} className="record-fact">
                    <dt>{column}</dt>
                    <dd>
                      <FileValue value={displayValue(row?.[column])} className="h-28 w-24 rounded-lg object-cover" />
                    </dd>
                  </div>
                ))}
          </dl>
        </div>
      </div>
      {invoiceLines ? <InvoiceLines lines={invoiceLines} /> : null}
      {invoiceCandidates ? <InvoiceCandidates rows={invoiceCandidates} /> : null}
      {licensePositions ? <LicensePositions rows={licensePositions} /> : null}
      {announcementClassGroups ? <AnnouncementClassGroups rows={announcementClassGroups} /> : null}
      {notificationClassGroups ? <NotificationClassGroups rows={notificationClassGroups} /> : null}
      {experiences ? <Experiences rows={experiences} /> : null}
      {educations ? <Educations rows={educations} /> : null}
      {skills ? <Skills rows={skills} /> : null}
      {trainings ? <Trainings rows={trainings} /> : null}
      {languageList ? <LanguageList rows={languageList} /> : null}
      {thanas ? <Thanas rows={thanas} /> : null}
      {upazilas ? <Upazilas rows={upazilas} unions={unions ?? []} /> : null}
      {ticketInvoiceLines ? <TicketInvoiceLines lines={ticketInvoiceLines} /> : null}
    </section>
    {editing ? <RecordComposer slug={listSlug} mode="edit" id={numericId} error={query.error} closeHref={closeHref} /> : null}
    </>
  );
}
