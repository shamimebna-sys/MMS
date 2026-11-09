const DESCRIPTIONS: Record<string, string> = {
  users: "Review accounts, roles, and sign-in access.",
  employees: "Browse staff records, contact details, and employment status.",
  employers: "Track employer organizations and the people tied to each record.",
  agents: "Manage recruiting agents and the records they own.",
  sub_agents: "Browse sub-agents and the agent they report to.",
  "sub-agents": "Browse sub-agents and the agent they report to.",
  companies: "Browse company records used across placements and billing.",
  companiers: "Browse company records used across placements and billing.",
  agencies: "Browse agencies and the contacts responsible for each account.",
  agenciers: "Browse agencies and the contacts responsible for each account.",
  candidates: "Search, filter, and follow candidates through their placement lifecycle.",
  teachers: "Review teacher records, contact details, and status.",
  document_types: "Maintain the document types used on candidate files.",
  "document-types": "Maintain the document types used on candidate files.",
  roles: "Review the roles that control what each account can access.",
  positions: "Browse positions used on candidate and employer records.",
  exams: "Review scheduled exams and open a result list from each row.",
  announcements: "Browse announcements published to the workspace.",
  invoices: "Review invoices, export a copy, or open the related receipt.",
  "invoice-money-receipts": "Review money receipts stored against an invoice. Amounts stay the saved values.",
  invoice_money_receipts: "Review money receipts stored against an invoice. Amounts stay the saved values.",
  payments: "Review payment records and their approval status.",
  payment_requests: "Review payment requests and their current status.",
  sub_agent_payment_requests: "Review sub-agent payment requests, bill titles, and the stored status.",
  "payment-requests": "Review payment requests and their current status.",
  notifications: "Review notifications for your account.",
  licenses: "Browse licenses, holders, and expiry dates.",
  settings: "Review workspace settings and their current values.",
  media: "Browse files stored across announcements, documents, and pages.",
  class_groups: "Browse class groups, fees, and status.",
  "class-groups": "Browse class groups, fees, and status.",
  class_schedules: "Review class schedules, subjects, days, and times.",
  "class-schedules": "Review class schedules, subjects, days, and times.",
  euro_to_bdt_rates: "Review stored euro to BDT conversion dates and rates.",
  "euro-to-bdt-rates": "Review stored euro to BDT conversion dates and rates.",
  currencies: "Review stored currencies, short names, symbols, and amount placement.",
  districts: "Browse districts used on addresses and records.",
  ticket_companies: "Browse ticket companies and their contact details.",
  "ticket-companies": "Browse ticket companies and their contact details.",
  ticket_invoices: "Review ticket invoices, numbers, and status.",
  "ticket-invoices": "Review ticket invoices, numbers, and status.",
  "ticket-invoice-money-receipts": "Review money receipts stored against a ticket invoice. Amounts stay the saved values.",
  ticket_invoice_money_receipts: "Review money receipts stored against a ticket invoice. Amounts stay the saved values.",
  live_status: "Browse the pipeline steps used to track candidate progress.",
  "live-status": "Browse the pipeline steps used to track candidate progress.",
  selected_candidates: "Review candidates selected for banner display.",
  "selected-candidates": "Review candidates selected for banner display.",
  reports: "Browse saved reports and their status.",
  arcs: "Review ARC compliance records stored for a candidate. This list is not the Flight live-status step.",
};

const KEEP_SINGULAR = new Set(["status", "news", "series", "species", "business", "address"]);

const SUCCESS = new Set([
  "active",
  "approved",
  "complete",
  "completed",
  "done",
  "paid",
  "pass",
  "passed",
  "selected",
  "stock",
  "yes",
  "open",
  "seen",
]);

const WARNING = new Set(["pending", "reserved", "hold", "on hold", "processing", "draft", "partial", "review"]);

const DANGER = new Set([
  "inactive",
  "rejected",
  "cancelled",
  "canceled",
  "failed",
  "unpaid",
  "closed",
  "deleted",
  "no",
  "expired",
]);

const INFO = new Set(["registration", "flight", "visa", "medical", "police", "labour", "group", "new"]);

export function listingDescription(slug: string, title: string): string {
  const known = DESCRIPTIONS[slug] ?? DESCRIPTIONS[slug.replace(/-/g, "_")];
  if (known) return known;
  const name = title.trim().toLowerCase();
  return name ? `Search, review, and manage ${name}.` : "Search, review, and manage these records.";
}

export function singularize(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  const last = parts.at(-1);
  if (!last) return title.trim();
  if (KEEP_SINGULAR.has(last.toLowerCase())) return parts.join(" ");
  let next = last;
  if (/ies$/i.test(last) && last.length > 3) {
    const stem = last.slice(0, -3);
    next = last.endsWith("IES") ? `${stem}Y` : `${stem}y`;
  } else if (/s$/i.test(last) && !/ss$/i.test(last) && !/(us|is)$/i.test(last)) {
    next = last.slice(0, -1);
  }
  parts[parts.length - 1] = next;
  return parts.join(" ");
}

export function addLabel(title: string): string {
  const name = singularize(title);
  return name ? `Add ${name}` : "Add New";
}

export function recordNoun(title: string, total: number): string {
  const name = title.trim().toLowerCase();
  if (!name) return total === 1 ? "record" : "records";
  return name;
}

export function listingCountLabel(title: string, from: number, to: number, total: number): string {
  const noun = recordNoun(title, total);
  if (total === 0) return `0 ${noun}`;
  if (from <= 1 && to >= total) return `${total.toLocaleString()} of ${total.toLocaleString()} ${noun}`;
  return `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} ${noun}`;
}

export function isStatusColumn(label: string): boolean {
  const normalized = label.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return normalized === "status" || normalized.endsWith(" status");
}

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export function statusTone(value: string): StatusTone | null {
  const text = value.trim();
  if (!text || text === "—" || text.length < 2 || text.length > 32 || /^\d+$/.test(text)) return null;
  const key = text.toLowerCase();
  if (SUCCESS.has(key)) return "success";
  if (WARNING.has(key)) return "warning";
  if (DANGER.has(key)) return "danger";
  if (INFO.has(key)) return "info";
  return "neutral";
}

export function columnHeading(column: string): string {
  if (column === column.toLowerCase() && /[_-]/.test(column)) return column.replace(/[_-]+/g, " ");
  return column;
}
