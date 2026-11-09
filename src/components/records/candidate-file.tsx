import Link from "next/link";
import { Check, X } from "lucide-react";
import { CandidateJourney } from "@/components/records/candidate-journey";
import { Portrait } from "@/components/media/portrait";
import { CANDIDATE_STEPS, type CandidateFile as CandidateFileData } from "@/server/candidate-file";

function chipTone(mark: string): "complete" | "failed" {
  return mark === "✕" ? "failed" : "complete";
}

const chipChrome = {
  complete: {
    card: "border-[color-mix(in_srgb,#0f766e_26%,var(--rc-line))] bg-[color-mix(in_srgb,#0f766e_8%,var(--rc-card))] hover:border-[color-mix(in_srgb,#0f766e_42%,var(--rc-line))]",
    rule: "bg-[#0f766e] [.dark_&]:bg-[#6ee7b7]",
    icon: "bg-[color-mix(in_srgb,#0f766e_16%,var(--rc-card))] text-[#0f766e] [.dark_&]:text-[#6ee7b7]",
    value: "text-[#115e59] [.dark_&]:text-[#99f6e4]",
  },
  failed: {
    card: "border-[color-mix(in_srgb,#e11d48_24%,var(--rc-line))] bg-[color-mix(in_srgb,#e11d48_7%,var(--rc-card))] hover:border-[color-mix(in_srgb,#e11d48_40%,var(--rc-line))]",
    rule: "bg-[#e11d48] [.dark_&]:bg-[#fda4af]",
    icon: "bg-[color-mix(in_srgb,#e11d48_14%,var(--rc-card))] text-[#be123c] [.dark_&]:text-[#fda4af]",
    value: "text-[#be123c] [.dark_&]:text-[#fda4af]",
  },
} as const;

export function CandidateFile({ file, step }: { file: CandidateFileData; step: number }) {
  const name = file.name || `Candidate ${file.id}`;
  const code = file.code || file.id;
  const agency = file.agency || "Candidate file";

  return (
    <section className="record-card overflow-hidden">
      <div className="h-1 bg-[#102033] [.dark_&]:bg-[#8eabc8]" />

      <div className="flex flex-col gap-5 px-5 py-5 md:flex-row md:items-center md:gap-6 md:px-7 md:py-6">
        <div className="flex min-w-0 flex-1 items-center gap-4 md:gap-5">
          <div className="shrink-0 rounded-[20px] bg-[#102033] p-1 shadow-[0_16px_32px_-20px_rgba(16,32,51,0.9)] [.dark_&]:bg-[#1c314c]">
            <Portrait path={file.photo} name={file.name} className="h-[88px] w-[72px] rounded-[16px] sm:h-[104px] sm:w-[84px]" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--rc-muted)]">Edit Candidate</p>
            <h1 className="mt-1.5 break-words text-[1.55rem] font-semibold leading-[1.12] tracking-[-0.03em] text-[#102033] [.dark_&]:text-[var(--rc-heading)] sm:text-[1.7rem] md:text-[1.9rem]">
              {name}
            </h1>
          </div>
        </div>

        <dl className="grid w-full grid-cols-2 overflow-hidden rounded-xl border border-[var(--rc-line)] bg-[var(--rc-soft)] md:w-auto md:min-w-[22rem]">
          <div className="min-w-0 px-3.5 py-2.5 sm:px-4">
            <dt className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--rc-muted)]">Candidate ID</dt>
            <dd className="mt-1 truncate font-mono text-[13px] font-semibold tracking-tight text-[var(--rc-heading)]" title={String(code)}>
              {code}
            </dd>
          </div>
          <div className="min-w-0 border-l border-[var(--rc-line)] px-3.5 py-2.5 sm:px-4">
            <dt className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--rc-muted)]">Agency</dt>
            <dd className="mt-1 truncate text-[13px] font-semibold text-[var(--rc-heading)]" title={agency}>
              {agency}
            </dd>
          </div>
        </dl>
      </div>

      <div className="border-t border-[var(--rc-line)] px-5 py-4 md:px-7 md:py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--rc-muted)]">Manpower status</p>
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9.25rem,1fr))] gap-2">
          {file.chips.map((chip) => {
            const tone = chipTone(chip.mark);
            const chrome = chipChrome[tone];
            const body = (
              <>
                <span aria-hidden className={`absolute inset-x-0 top-0 h-0.5 ${chrome.rule}`} />
                <span className="block text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] text-[var(--rc-muted)]">
                  {chip.label}
                </span>
                <span className="mt-2 flex items-center gap-1.5">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${chrome.icon}`}>
                    {tone === "complete" ? <Check className="h-3 w-3" strokeWidth={2.6} /> : <X className="h-3 w-3" strokeWidth={2.6} />}
                  </span>
                  <span className={`truncate text-[13px] font-semibold leading-none ${chrome.value}`}>
                    {chip.mark === "✓" ? "Complete" : chip.mark === "✕" ? "Failed" : chip.mark}
                  </span>
                </span>
              </>
            );
            const className = `relative flex h-full min-h-[76px] flex-col justify-between overflow-hidden rounded-xl border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102033]/30 [.dark_&]:focus-visible:ring-[#8eabc8]/40 ${chrome.card}`;
            return chip.href ? (
              <Link key={chip.label} href={chip.href} className={className}>
                {body}
              </Link>
            ) : (
              <div key={chip.label} className={className}>
                {body}
              </div>
            );
          })}
        </div>
      </div>

      <CandidateJourney
        step={step}
        completion={file.journey}
        steps={CANDIDATE_STEPS.map((item) => ({
          step: item.step,
          label: item.label,
          href: item.href(file.id),
        }))}
      />
    </section>
  );
}
