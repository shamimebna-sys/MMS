"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { journeyStepVisual, type JourneyCompletion } from "@/lib/candidate-journey-status";

export type JourneyStep = {
  step: number;
  label: string;
  href: string;
};

export function CandidateJourney({
  step,
  steps,
  completion,
}: {
  step: number;
  steps: JourneyStep[];
  completion?: JourneyCompletion;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const syncEdges = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setEdges({
      left: scroller.scrollLeft > 8,
      right: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 8,
    });
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;
    const scrollerBox = scroller.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    const delta = activeBox.left - scrollerBox.left - (scroller.clientWidth - activeBox.width) / 2;
    scroller.scrollTo({ left: Math.max(0, scroller.scrollLeft + delta), behavior: "smooth" });
    const frame = window.requestAnimationFrame(syncEdges);
    return () => window.cancelAnimationFrame(frame);
  }, [step, syncEdges]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    syncEdges();
    const observer = new ResizeObserver(syncEdges);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [steps.length, syncEdges]);

  const mask =
    edges.left && edges.right
      ? "[mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)]"
      : edges.left
        ? "[mask-image:linear-gradient(to_right,transparent,black_12px)]"
        : edges.right
          ? "[mask-image:linear-gradient(to_right,black_calc(100%-12px),transparent)]"
          : "";

  return (
    <div className="border-t border-[var(--rc-line)] bg-[color-mix(in_srgb,var(--rc-heading)_3%,var(--rc-card))] px-4 py-4 md:px-6 md:py-5">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--rc-muted)]">Navigation steps</p>
        <p className="rounded-full border border-[var(--rc-line)] bg-[var(--rc-card)] px-2.5 py-1 text-[11px] font-semibold tabular-nums tracking-wide text-[var(--rc-muted)]">
          Step {step} of {steps.length}
        </p>
      </div>
      <div
        ref={scrollerRef}
        onScroll={syncEdges}
        className={`overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${mask}`}
      >
        <ol className="flex w-max items-start py-1">
          {steps.map((item, index) => {
            const active = item.step === step;
            const done = journeyStepVisual(item.step, step, completion) === "completed";
            const last = index === steps.length - 1;
            const indexLabel = String(item.step).padStart(2, "0");
            const railOn = "bg-[#102033] [.dark_&]:bg-[#8eabc8]";
            const railOff = "bg-[var(--rc-line)]";
            return (
              <li key={item.step} className="w-[7.75rem] shrink-0">
                <Link
                  ref={active ? activeRef : undefined}
                  href={item.href}
                  aria-current={active ? "step" : undefined}
                  title={item.label}
                  className={`group flex w-full flex-col items-center rounded-xl px-0.5 py-1.5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#102033]/30 [.dark_&]:focus-visible:ring-[#8eabc8]/40 ${
                    active ? "bg-[color-mix(in_srgb,#102033_6%,var(--rc-card))]" : "hover:bg-[var(--rc-hover)]"
                  }`}
                >
                  <span className="flex h-8 w-full items-center gap-1.5">
                    <span aria-hidden className={`h-px flex-1 ${index === 0 ? "invisible" : done || active ? railOn : railOff}`} />
                    <span
                      aria-hidden
                      className={`grid shrink-0 place-items-center rounded-full font-semibold tabular-nums ${
                        active
                          ? "h-8 w-8 bg-[#102033] text-[12px] text-white shadow-[0_8px_16px_-10px_rgba(16,32,51,0.9)] ring-4 ring-[color-mix(in_srgb,#102033_14%,var(--rc-card))] [.dark_&]:bg-[#e7eef8] [.dark_&]:text-[#102033] [.dark_&]:ring-[color-mix(in_srgb,#e7eef8_16%,transparent)]"
                          : done
                            ? "h-7 w-7 border border-[color-mix(in_srgb,#0f766e_45%,var(--rc-line))] bg-[color-mix(in_srgb,#0f766e_10%,var(--rc-card))] text-[#0f766e] [.dark_&]:text-[#6ee7b7]"
                            : "h-7 w-7 border border-[var(--rc-line)] bg-[var(--rc-card)] text-[11px] text-[var(--rc-faint)] group-hover:border-[color-mix(in_srgb,var(--rc-heading)_28%,var(--rc-line))] group-hover:text-[var(--rc-heading)]"
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : indexLabel}
                    </span>
                    <span aria-hidden className={`h-px flex-1 ${last ? "invisible" : done ? railOn : railOff}`} />
                  </span>
                  <span
                    className={`mt-2 line-clamp-2 min-h-[2.3em] w-full px-1 text-[11.5px] leading-[1.25] ${
                      active
                        ? "font-semibold text-[#102033] [.dark_&]:text-[var(--rc-heading)]"
                        : done
                          ? "font-medium text-[var(--rc-heading)]"
                          : "font-medium text-[var(--rc-muted)] group-hover:text-[var(--rc-heading)]"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
