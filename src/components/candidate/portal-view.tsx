import Link from "next/link";
import type { ReactNode } from "react";
import type { CandidateNotices, CandidatePortalData, PortalFact, PortalFile, PortalProcess } from "@/server/candidate-portal";
import type { StageMark } from "@/lib/candidate-live-status";

const CONTACT_ORDER = ["Email", "Secondary email", "Mobile", "Secondary mobile", "Emergency mobile"];
const PASSPORT_ORDER = ["Passport", "Passport issued", "Passport expires"];
const ADDRESS_ORDER = ["Present address", "Permanent address"];
const PERSONAL_ORDER = [
  "NID",
  "Date of birth",
  "Gender",
  "Blood group",
  "Nationality",
  "Father",
  "Mother",
  "Marital status",
  "Height",
  "Weight",
];

const LABEL = "text-[13px] font-medium leading-5 text-[#3f4b5b]";
const VALUE = "break-words text-[15px] font-medium leading-6 text-foreground";

function orderedFacts(facts: PortalFact[], order: string[]): PortalFact[] {
  const byLabel = new Map(facts.map((fact) => [fact.label, fact]));
  return order.flatMap((label) => {
    const fact = byLabel.get(label);
    return fact ? [fact] : [];
  });
}

function stageTone(stage: StageMark): "current" | "filed" | "open" {
  if (stage.current) return "current";
  if (stage.onFile) return "filed";
  return "open";
}

function stageStateLabel(tone: "current" | "filed" | "open"): string {
  if (tone === "current") return "Current";
  if (tone === "filed") return "On file";
  return "Pending";
}

function recordedLines(process: PortalProcess[], label: string): string[] {
  const group = process.find((item) => item.label === label);
  if (!group) return [];
  return group.items.flatMap((item) => item.lines);
}

function nodeClass(tone: "current" | "filed" | "open"): string {
  if (tone === "current") return "h-9 w-9 bg-[#dc2626] text-[14px] text-white shadow-[0_0_0_4px_rgb(220_38_38/0.16)]";
  if (tone === "filed") return "h-8 w-8 bg-[#0f1723] text-[13px] text-white";
  return "h-8 w-8 border border-[#d5dbe3] bg-card text-[13px] text-[#3f4b5b]";
}

function stateClass(tone: "current" | "filed" | "open"): string {
  if (tone === "current") return "font-semibold text-[#b91c1c]";
  if (tone === "filed") return "font-semibold text-foreground";
  return "font-medium text-[#3f4b5b]";
}

function Panel({ id, title, action, children }: { id?: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="rounded-xl border border-border bg-card px-5 py-5 shadow-[0_1px_2px_rgb(15_22_35/0.04)] sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[19px] font-semibold leading-7 tracking-tight">{title}</h2>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function FactBlock({ title, facts, wide }: { title: string; facts: PortalFact[]; wide?: boolean }) {
  return (
    <div className={wide ? "lg:col-span-2" : undefined}>
      <h3 className="text-[16px] font-semibold leading-6">{title}</h3>
      {facts.length ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className={fact.label.includes("address") ? "sm:col-span-2" : undefined}>
              <dt className={LABEL}>{fact.label}</dt>
              <dd className={`mt-0.5 ${VALUE}`}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-[15px] leading-6 text-[#3f4b5b]">Nothing is stored here yet.</p>
      )}
    </div>
  );
}

function FileLink({ file }: { file: PortalFile }) {
  return (
    <a href={`/candidate/file?ref=${encodeURIComponent(file.ref)}`} className="text-[15px] font-semibold leading-6 text-[#b91c1c] underline-offset-2 hover:underline">
      {file.name}
    </a>
  );
}

function Journey({ stages, linesFor }: { stages: StageMark[]; linesFor: (label: string) => string[] }) {
  return (
    <>
      <ol className="lg:hidden">
        {stages.map((stage, index) => {
          const tone = stageTone(stage);
          const lines = linesFor(stage.label);
          return (
            <li key={stage.label} className="relative flex gap-4 pb-5 last:pb-0" aria-current={stage.current ? "step" : undefined}>
              {index < stages.length - 1 ? <span aria-hidden className="absolute bottom-0 left-4 top-9 w-px bg-[#d5dbe3]" /> : null}
              <span className={`relative z-10 grid shrink-0 place-items-center rounded-full font-semibold tabular-nums ${nodeClass(tone)}`}>{index + 1}</span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[16px] font-semibold leading-6">{stage.label}</p>
                  <p className={`shrink-0 text-[14px] leading-5 ${stateClass(tone)}`}>{stageStateLabel(tone)}</p>
                </div>
                {lines.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {lines.map((line) => (
                      <li key={line} className="text-[15px] leading-6 text-foreground">
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <ol className="hidden lg:grid lg:grid-cols-10">
        {stages.map((stage, index) => {
          const tone = stageTone(stage);
          return (
            <li key={stage.label} className="relative flex min-w-0 flex-col items-center px-1 text-center" aria-current={stage.current ? "step" : undefined}>
              {index < stages.length - 1 ? <span aria-hidden className="absolute left-1/2 top-[17px] z-0 h-0.5 w-full bg-[#d5dbe3]" /> : null}
              <span className="relative z-10 grid h-9 w-9 place-items-center">
                <span className={`grid place-items-center rounded-full font-semibold tabular-nums ${nodeClass(tone)}`}>{index + 1}</span>
              </span>
              <p className="mt-3 min-h-10 w-full text-[13px] font-semibold leading-5 text-foreground">{stage.label}</p>
              <p className={`mt-1 text-[13px] leading-5 ${stateClass(tone)}`}>{stageStateLabel(tone)}</p>
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function PortalView({ portal, notices }: { portal: CandidatePortalData; notices: CandidateNotices }) {
  const title = portal.name || "Candidate";
  const used = new Set([...CONTACT_ORDER, ...PASSPORT_ORDER, ...ADDRESS_ORDER, ...PERSONAL_ORDER]);
  const groups = [
    { title: "Personal details", facts: orderedFacts(portal.profile, PERSONAL_ORDER) },
    { title: "Contact information", facts: orderedFacts(portal.profile, CONTACT_ORDER) },
    { title: "Address information", facts: orderedFacts(portal.profile, ADDRESS_ORDER), wide: true },
    { title: "Passport information", facts: orderedFacts(portal.profile, PASSPORT_ORDER) },
    { title: "Other profile information", facts: portal.profile.filter((fact) => !used.has(fact.label)) },
  ];
  const onFile = portal.stages.filter((stage) => stage.onFile).length;
  const recorded = portal.stages.flatMap((stage) => {
    const lines = recordedLines(portal.process, stage.label);
    return lines.length ? [{ label: stage.label, lines }] : [];
  });

  return (
    <div className="space-y-6" style={{ ["--rc-red" as string]: "#dc2626", ["--rc-red-hover" as string]: "#b91c1c" }}>
      <section className="overflow-hidden rounded-2xl bg-[#0f1723] text-white shadow-[0_8px_24px_rgb(15_23_35/0.12)]">
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:px-6 sm:py-6">
          {portal.photoRef ? (
            <img
              src={`/candidate/file?ref=${encodeURIComponent(portal.photoRef)}`}
              alt=""
              className="h-[5.25rem] w-[5.25rem] shrink-0 rounded-xl border border-white/20 object-cover"
            />
          ) : (
            <div className="grid h-[5.25rem] w-[5.25rem] shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-[22px] font-semibold">
              {title.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium leading-5 text-white/70">Candidate</p>
            <h1 className="mt-0.5 text-[26px] font-semibold leading-8 tracking-tight">{title}</h1>
            <p className="mt-1 text-[15px] leading-6 text-white/85">{portal.code ? `Code ${portal.code}` : "No candidate code is stored yet."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5">
              <p className="text-[13px] font-medium leading-5 text-white/70">Recruitment status</p>
              <p className="text-[16px] font-semibold leading-6 text-white">{portal.liveStatus}</p>
            </div>
            <Link href="/candidate/profile" className="record-save no-underline">
              Edit profile
            </Link>
          </div>
        </div>
      </section>

      <Panel id="status" title="Recruitment progress">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-2xl text-[15px] leading-6 text-[#3f4b5b]">
            {portal.liveStatus} is the furthest placement record on this file. An earlier paper can still be missing.
          </p>
          <p className="shrink-0 text-[15px] font-semibold leading-6 text-foreground">
            {onFile} of {portal.stages.length} on file
          </p>
        </div>
        <div className="mb-6 grid grid-cols-10 gap-1.5" aria-hidden>
          {portal.stages.map((stage) => {
            const tone = stageTone(stage);
            const color = tone === "current" ? "bg-[#dc2626]" : tone === "filed" ? "bg-[#0f1723]" : "bg-[#e6ebf1]";
            return <span key={stage.label} className={`h-1.5 rounded-full ${color}`} />;
          })}
        </div>
        <Journey stages={portal.stages} linesFor={(label) => recordedLines(portal.process, label)} />
        {recorded.length ? (
          <div className="mt-6 hidden border-t border-border pt-5 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:gap-y-4">
            {recorded.map((item) => (
              <div key={item.label}>
                <p className="text-[13px] font-semibold leading-5 text-[#3f4b5b]">{item.label}</p>
                <ul className="mt-1 space-y-0.5">
                  {item.lines.map((line) => (
                    <li key={line} className={VALUE}>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel id="profile" title="Personal information">
        <div className="grid gap-8 lg:grid-cols-2">
          {groups.map((group) => (
            <FactBlock key={group.title} title={group.title} facts={group.facts} wide={group.wide} />
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel id="application" title="Placement">
          {portal.application.length ? (
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              {portal.application.map((fact) => (
                <div key={fact.label}>
                  <dt className={LABEL}>{fact.label}</dt>
                  <dd className={`mt-0.5 ${VALUE}`}>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[15px] leading-6 text-[#3f4b5b]">Nothing is stored here yet.</p>
          )}
        </Panel>

        <Panel id="documents" title="Documents">
          {portal.documents.length ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {portal.documents.map((file) => (
                <li key={file.ref}>
                  <p className={LABEL}>{file.label}</p>
                  <FileLink file={file} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] leading-6 text-[#3f4b5b]">No documents are stored on your file yet.</p>
          )}
        </Panel>
      </div>

      {portal.process.length ? (
        <Panel id="process" title="Records on your file">
          <div className="grid gap-6 lg:grid-cols-2">
            {portal.process.map((group) => (
              <div key={group.label}>
                <h3 className="text-[16px] font-semibold leading-6">{group.label}</h3>
                <p className="mt-0.5 text-[14px] leading-6 text-[#3f4b5b]">{group.note}</p>
                <ul className="mt-2 space-y-3">
                  {group.items.map((item, index) => (
                    <li key={`${group.label}-${index}`}>
                      <p className={VALUE}>{item.title}</p>
                      {item.lines.length ? (
                        <ul className="mt-0.5 space-y-0.5">
                          {item.lines.map((line) => (
                            <li key={line} className="text-[15px] leading-6 text-foreground">
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {item.files.length ? (
                        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          {item.files.map((file) => (
                            <FileLink key={file.ref} file={file} />
                          ))}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel
        id="notices"
        title="Notices"
        action={
          <Link href="/candidate/notices" className="btn-quiet">
            Open notices
          </Link>
        }
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <NoticeList title="Notifications" items={notices.notifications.slice(0, 4)} empty="No notifications are stored for your account." />
          <NoticeList title="Announcements" items={notices.announcements.slice(0, 4)} empty="No announcements are published." />
        </div>
      </Panel>
    </div>
  );
}

function NoticeList({ title, items, empty }: { title: string; items: CandidateNotices["notifications"]; empty: string }) {
  return (
    <div>
      <h3 className="text-[16px] font-semibold leading-6">{title}</h3>
      {items.length ? (
        <ul className="mt-3 space-y-4">
          {items.map((item, index) => (
            <li key={`${item.title}-${item.when}-${index}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className={VALUE}>{item.title}</p>
                {item.when ? <p className="shrink-0 text-[13px] leading-5 text-[#3f4b5b]">{item.when}</p> : null}
              </div>
              {item.detail ? <p className="mt-0.5 text-[15px] leading-6 text-[#3f4b5b]">{item.detail}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[15px] leading-6 text-[#3f4b5b]">{empty}</p>
      )}
    </div>
  );
}
