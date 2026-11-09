import {
  Download,
  GraduationCap,
  Handshake,
  IdCard,
  School,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { CongratulationsCarousel } from "@/components/dashboard/congratulations-carousel";
import { PipelineChart } from "@/components/dashboard/pipeline-chart";
import { isImagePath, mediaUrl } from "@/lib/media";
import { formatMoney } from "@/lib/utils";
import { canOperateClassSchedule } from "@/lib/class-schedules";
import { loadDashboard, type ScheduleRow } from "@/server/dashboard";
import { requireUser, sessionRoleLabel } from "@/server/current-user";

export const dynamic = "force-dynamic";

const STAGES: Array<{ key: keyof Awaited<ReturnType<typeof loadDashboard>>["pipeline"]; label: string }> = [
  { key: "registration", label: "Registration" },
  { key: "grouped", label: "Group" },
  { key: "selection", label: "Selected" },
  { key: "medical", label: "Medical" },
  { key: "visa", label: "Visa" },
  { key: "manpower", label: "Manpower" },
  { key: "flight", label: "Flight" },
];

function WidgetShell({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-[#E3EAF2] bg-white shadow-[0_1px_2px_rgb(38_54_74/0.04),0_8px_20px_rgb(38_54_74/0.05)] ${className ?? ""}`}
    >
      <h2
        className="flex min-h-14 items-center justify-center px-4 py-2 text-center text-[16px] font-bold uppercase leading-5 tracking-[0.03em] text-white"
        style={{ background: "linear-gradient(90deg, #55A9EF 0%, #398FD5 100%)" }}
      >
        {title}
      </h2>
      <div className="flex min-h-[220px] flex-1 flex-col bg-white px-4 py-4">
        {action ? <div className="mb-3 flex justify-end">{action}</div> : null}
        {children}
      </div>
    </section>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center px-4 text-center text-[14px] text-[#8291A5]">
      {children}
    </p>
  );
}

function SchedulePanel({ title, rows, empty, action }: { title: string; rows: ScheduleRow[]; empty: string; action?: ReactNode }) {
  return (
    <WidgetShell title={title} action={action}>
      {rows.length === 0 ? (
        <EmptyNote>{empty}</EmptyNote>
      ) : (
        <ul className="divide-y divide-[#E3EAF2]">
          {rows.map((row, index) => (
            <li key={`${row.title}-${row.when}-${row.detail}-${index}`} className="py-3">
              <p className="text-[14px] font-semibold text-[#26364A]">{row.title}</p>
              <p className="mt-1 text-[13px] leading-5 text-[#8291A5]">
                {[row.when, row.detail].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  from,
  to,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  from: string;
  to: string;
}) {
  return (
    <article
      className="flex h-full items-center justify-between gap-4 rounded-[18px] px-6 py-6 text-white shadow-[0_8px_22px_rgb(15_22_35/0.14)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgb(15_22_35/0.2)] sm:px-7 sm:py-7"
      style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
    >
      <div className="min-w-0 flex-1">
        <p className="break-words text-[30px] font-bold leading-[1.15] tracking-tight tabular-nums sm:text-[32px]">
          {value}
        </p>
        <p className="mt-2 break-words text-[14px] font-semibold capitalize leading-5 text-white">
          {label}
        </p>
      </div>
      <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl bg-white/20">
        <Icon className="h-6 w-6 text-white" strokeWidth={1.75} aria-hidden />
      </span>
    </article>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await loadDashboard(user);
  const roleLabel = sessionRoleLabel(user);
  const chart = STAGES.map((item) => ({ name: item.label, count: data.pipeline[item.key] }));

  return (
    <div className="space-y-6">
      {/* ── Hero / welcome banner ───────────────────────── */}
      <section
        className="overflow-hidden rounded-3xl text-white"
        style={{
          background: "#0f1723",
          boxShadow: "0 4px 8px rgb(15 22 35 / 0.10), 0 20px 56px rgb(15 22 35 / 0.15)",
        }}
      >
        <div className="p-6 md:p-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-200/80">
            E &amp; A Air International
          </p>
          <h2 className="mt-3 text-[1.75rem] font-semibold tracking-tight leading-tight text-white">
            {roleLabel}
          </h2>
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-white/55">
            Signed in. Selection, medical, visa, and flight stay on this desk.
          </p>
        </div>
      </section>

      {/* ── KPI stats ──────────────────────────────────── */}
      <section aria-label="Key figures" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Agent balance"
          value={formatMoney(data.agentBalance)}
          icon={Wallet}
          from="#5547EE"
          to="#5278F8"
        />
        <KpiCard
          label="Total candidates"
          value={data.totalCandidates.toLocaleString()}
          icon={UsersRound}
          from="#2685D8"
          to="#2366B5"
        />
        <KpiCard
          label="Total agents"
          value={data.totalAgents.toLocaleString()}
          icon={UserRound}
          from="#36B77D"
          to="#27996C"
        />
      </section>

      {/* ── Roster summary (if available) ──────────────── */}
      {data.roster ? (
        <section aria-label="Roster summary" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Students"
            value={Number(data.roster.students).toLocaleString()}
            icon={School}
            from="#13A89E"
            to="#087F83"
          />
          <KpiCard
            label="Teachers"
            value={Number(data.roster.teachers).toLocaleString()}
            icon={GraduationCap}
            from="#F2A000"
            to="#D77C00"
          />
          <KpiCard
            label="Agents"
            value={Number(data.roster.agents).toLocaleString()}
            icon={Handshake}
            from="#36B77D"
            to="#27996C"
          />
          <KpiCard
            label="Employees"
            value={Number(data.roster.employees).toLocaleString()}
            icon={IdCard}
            from="#2685D8"
            to="#2366B5"
          />
        </section>
      ) : null}

      {/* ── Selected candidates ─────────────────────────── */}
      <section aria-label="Congratulations" className="min-w-0 overflow-hidden rounded-[24px] bg-[#eef1f5] px-3 py-6 sm:px-4 sm:py-8">
        <h2 className="sr-only">Congratulations. Selected from Cyprus reputed companies</h2>
        {data.selected.length === 0 ? (
          <article className="rounded-[20px] bg-white p-6 text-[13px] text-[#5D6D80] shadow-[0_10px_28px_rgb(52_70_93/0.08)]">
            No selected candidates in your scope.
          </article>
        ) : (
          <CongratulationsCarousel candidates={data.selected} />
        )}
      </section>

      {/* ── Schedule panels + summaries ─────────────────── */}
      <section className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
        <SchedulePanel
          title="Today's Class"
          rows={data.classes}
          empty="No active records found."
          action={
            canOperateClassSchedule(user, "browse") ? (
              <Link
                href="/records/class-schedules"
                className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#C9D6E5] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#5E738C] transition-colors hover:bg-[#F7FAFD]"
              >
                Class Schedules
              </Link>
            ) : null
          }
        />
        <SchedulePanel
          title="Upcoming Interview Schedule"
          rows={data.interviews}
          empty="No active records found."
        />
        <SchedulePanel
          title="Upcoming Flight Schedule"
          rows={data.flights}
          empty="No active records found."
        />

        <WidgetShell title="Agent Candidate Summary">
          <ul className="divide-y divide-[#E3EAF2]">
            {STAGES.map((stage) => (
              <li key={stage.key} className="flex items-center justify-between gap-4 py-3">
                <span className="text-[14px] text-[#26364A]">{stage.label}</span>
                <span className="text-[14px] font-bold tabular-nums text-[#26364A]">
                  {data.pipeline[stage.key].toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </WidgetShell>

        <WidgetShell
          title="Stage Presence"
          action={
            <Link
              href="/api/exports/pdf?kind=pipeline"
              className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#C9D6E5] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#5E738C] transition-colors hover:bg-[#F7FAFD]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download PDF
            </Link>
          }
        >
          <PipelineChart data={chart} />
        </WidgetShell>

        <WidgetShell title="Agent Balance">
          {data.money.length === 0 ? (
            <EmptyNote>No active records found.</EmptyNote>
          ) : (
            <ul className="divide-y divide-[#E3EAF2]">
              {data.money.map((row) => (
                <li key={row.type || "blank"} className="flex items-center justify-between gap-4 py-3">
                  <span className="text-[14px] text-[#26364A]">{row.type || "(blank type)"}</span>
                  <span className="text-[14px] font-bold tabular-nums text-[#26364A]">
                    {formatMoney(row.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WidgetShell>

        <WidgetShell title="Announcements" className="md:col-span-2 xl:col-span-3">
          {data.announcements.length === 0 ? (
            <EmptyNote>No Data Found</EmptyNote>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="data-grid min-w-full">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>Date</th>
                    <th>File</th>
                  </tr>
                </thead>
                <tbody>
                  {data.announcements.map((row) => (
                    <tr key={`${row.topic}-${row.date}`}>
                      <td className="text-[13px] text-[#26364A]">{row.topic || "—"}</td>
                      <td className="text-[13px] text-[#26364A]">{row.date || "—"}</td>
                      <td>
                        {row.file && isImagePath(row.file) ? (
                          <a href={mediaUrl(row.file)} target="_blank" rel="noreferrer">
                            <img
                              src={mediaUrl(row.file)}
                              alt=""
                              className="h-12 w-12 rounded-lg object-cover"
                            />
                          </a>
                        ) : row.file ? (
                          <a
                            href={mediaUrl(row.file)}
                            className="text-[13px] font-medium text-[#398FD5] hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            View
                          </a>
                        ) : (
                          <span className="text-[13px] text-[#8291A5]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WidgetShell>
      </section>
    </div>
  );
}
