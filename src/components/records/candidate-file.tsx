import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Portrait } from "@/components/media/portrait";
import { CANDIDATE_STEPS, type CandidateFile as CandidateFileData } from "@/server/candidate-file";

export function CandidateFile({ file, step }: { file: CandidateFileData; step: number }) {
  return (
    <section className="surface overflow-hidden">
      {/* Candidate identity header */}
      <div className="flex flex-wrap items-center gap-5 border-b border-border px-5 py-5 md:px-7">
        <Portrait
          path={file.photo}
          name={file.name}
          className="h-24 w-20 shrink-0 rounded-2xl shadow-sm"
        />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {file.agency || "Candidate file"}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            Edit Candidate
          </p>
          <h1 className="page-title mt-1">{file.name || `Candidate ${file.id}`}</h1>
          <p className="mt-1 text-[12.5px] text-muted">{file.code || file.id}</p>
        </div>
      </div>

      {/* Manpower status chips */}
      <div className="border-b border-border px-5 py-4 md:px-7">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          Manpower status
        </p>
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {file.chips.map((chip) => {
            const passed = chip.mark !== "✕";
            const body = (
              <>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {chip.label}
                </span>
                <div className="mt-1.5 flex items-center gap-1">
                  {passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                  )}
                  <span
                    className={`text-[12.5px] font-semibold ${passed ? "text-emerald-700" : "text-rose-600"}`}
                  >
                    {chip.mark}
                  </span>
                </div>
              </>
            );
            const className =
              "min-w-[100px] shrink-0 rounded-xl border border-border bg-background px-3 py-2.5 transition-colors hover:border-border/60";
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

      {/* Navigation steps */}
      <div className="px-5 py-4 md:px-7">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          Navigation steps
        </p>
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {CANDIDATE_STEPS.map((item) => {
            const active = item.step === step;
            return (
              <Link
                key={item.step}
                href={item.href(file.id)}
                className={`flex min-w-[136px] shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[13px] transition-colors ${
                  active
                    ? "bg-sidebar text-sidebar-foreground shadow-sm"
                    : "border border-border bg-background text-foreground hover:border-accent/30 hover:bg-background"
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    active ? "bg-amber-100 text-[#0f1723]" : "bg-sidebar text-amber-100"
                  }`}
                >
                  {item.step}
                </span>
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
