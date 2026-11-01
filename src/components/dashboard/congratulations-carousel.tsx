"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  cardsPerView,
  chunk,
  clampPage,
  COMPANY_LINE,
  MEDICAL_INSTRUCTION,
  nextIndex,
  restartCarouselTimer,
  ROTATE_MS,
  SELECTION_LINE,
  splitInstruction,
  type CarouselTimer,
} from "@/components/dashboard/congratulations";
import { mediaUrl } from "@/lib/media";

type SelectedBanner = {
  id: number;
  name: string;
  position: string;
  passportNo: string;
  photo: string;
};

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "—";
}

function CandidatePhoto({ path, name }: { path: string; name: string }) {
  const src = mediaUrl(path);
  const [failed, setFailed] = useState(false);
  const frame = "relative block h-[136px] w-[136px] overflow-hidden rounded-full border-4 border-[#2E7CF6]";

  if (!src || failed) {
    return (
      <div
        className="grid h-[136px] w-[136px] place-items-center rounded-full border-4 border-[#2E7CF6] bg-[#E6EBF1] text-[28px] font-bold tracking-wide text-[#34465D]"
        aria-hidden
      >
        {initials(name)}
      </div>
    );
  }

  return (
    <span className={frame}>
      <Image
        src={src}
        alt={`${name} photo`}
        fill
        unoptimized
        sizes="136px"
        className="object-cover"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function Pill({
  children,
  className,
  breakWords = false,
}: {
  children: ReactNode;
  className?: string;
  breakWords?: boolean;
}) {
  return (
    <div
      className={`flex w-full min-w-0 items-center justify-center rounded-full bg-[#5D6D80] px-4 text-center text-white ${className ?? ""}`}
    >
      <span className={`w-full min-w-0 ${breakWords ? "break-words" : ""}`}>{children}</span>
    </div>
  );
}

function MedicalInstruction({ text }: { text: string }) {
  const parts = splitInstruction(text);
  return (
    <p className="rounded-[16px] bg-[#374B64] px-5 py-[18px] text-center text-[13px] leading-[1.6] text-white">
      {parts ? (
        <>
          {parts[0]}
          <span className="font-semibold uppercase text-[#E4572E]">{parts[1]}</span>
          {parts[2]}
        </>
      ) : (
        text
      )}
    </p>
  );
}

function CongratulationCard({ candidate }: { candidate: SelectedBanner }) {
  return (
    <article className="@container flex h-full min-w-0 flex-col gap-3.5 rounded-[20px] bg-white p-7 shadow-[0_10px_28px_rgb(52_70_93/0.10)] sm:p-[30px]">
      <div className="flex flex-col gap-2.5">
        <Pill className="min-h-[52px] py-2.5 text-[clamp(16px,5.2cqi,21px)] font-bold leading-snug tracking-[1px] sm:tracking-[1.5px]">
          CONGRATULATIONS 🎉 🎉
        </Pill>
        <Pill className="min-h-10 py-2 text-[13px] font-semibold tracking-[1.2px] sm:text-[14px]">
          {SELECTION_LINE}
        </Pill>
        <Pill className="min-h-10 py-2 text-[13px] font-semibold tracking-[1.2px] sm:text-[14px]">
          {COMPANY_LINE}
        </Pill>
      </div>

      <div className="flex justify-center py-3">
        <CandidatePhoto path={candidate.photo} name={candidate.name} />
      </div>

      <h3 className="break-words text-center text-[26px] font-bold uppercase leading-tight tracking-[1.5px] text-[#34465D]">
        <Link
          href={`/records/candidates/${candidate.id}`}
          className="text-[#34465D] hover:text-[#243246]"
        >
          {candidate.name}
        </Link>
      </h3>

      <div className="flex flex-col gap-2.5">
        <Pill breakWords className="min-h-12 py-2 text-[14px] font-semibold leading-snug">
          POSITION : {candidate.position || "—"}
        </Pill>
        <Pill breakWords className="min-h-12 py-2 text-[14px] font-semibold leading-snug">
          PASSPORT NO : {candidate.passportNo || "—"}
        </Pill>
      </div>

      <div className="mt-auto pt-1">
        <MedicalInstruction text={MEDICAL_INSTRUCTION} />
      </div>
    </article>
  );
}

function subscribeToResize(onStoreChange: () => void) {
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}

function readCardsPerView(): 1 | 2 | 3 {
  return cardsPerView(window.innerWidth);
}

function serverCardsPerView(): 1 | 2 | 3 {
  return 3;
}

function subscribeToMotion(onStoreChange: () => void) {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  motion.addEventListener("change", onStoreChange);
  return () => motion.removeEventListener("change", onStoreChange);
}

function readReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeToVisibility(onStoreChange: () => void) {
  document.addEventListener("visibilitychange", onStoreChange);
  return () => document.removeEventListener("visibilitychange", onStoreChange);
}

function readDocumentHidden(): boolean {
  return document.hidden;
}

function subscribeNoop() {
  return () => {};
}

function previewClass(index: number): string {
  if (index === 0) return "min-w-0";
  if (index === 1) return "hidden min-w-0 md:block";
  return "hidden min-w-0 lg:block";
}

export function CongratulationsCarousel({ candidates }: { candidates: SelectedBanner[] }) {
  const ready = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const perPage = useSyncExternalStore(subscribeToResize, readCardsPerView, serverCardsPerView);
  const reducedMotion = useSyncExternalStore(subscribeToMotion, readReducedMotion, () => false);
  const hidden = useSyncExternalStore(subscribeToVisibility, readDocumentHidden, () => false);
  const [page, setPage] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [frameWidth, setFrameWidth] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const frameObserver = useRef<ResizeObserver | null>(null);
  const timer = useRef<CarouselTimer>({ id: null });
  const onFrame = useCallback((node: HTMLDivElement | null) => {
    frameObserver.current?.disconnect();
    frameObserver.current = null;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      setFrameWidth((current) => (current === next ? current : next));
    });
    observer.observe(node);
    frameObserver.current = observer;
  }, []);

  const pages = chunk(candidates, perPage);
  const safePage = clampPage(page, pages.length);
  if (page !== safePage) setPage(safePage);

  useEffect(() => {
    const handle = timer.current;
    const count = pages.length;
    const active = ready && !hovered && !hidden && !reducedMotion && count > 1;
    restartCarouselTimer(
      handle,
      active,
      () => {
        setPage((current) => nextIndex(clampPage(current, count), count, 1));
      },
      (fn, ms) => window.setInterval(fn, ms),
      (id) => window.clearInterval(id),
      ROTATE_MS,
    );
    return () => {
      restartCarouselTimer(handle, false, () => {}, () => 0, (id) => window.clearInterval(id));
    };
  }, [ready, hovered, hidden, reducedMotion, pages.length, safePage]);

  const go = (direction: 1 | -1) => {
    const count = pages.length;
    restartCarouselTimer(timer.current, false, () => {}, () => 0, (id) => window.clearInterval(id));
    setPage((current) => nextIndex(clampPage(current, count), count, direction));
  };

  if (!ready) {
    return (
      <div className="grid grid-cols-1 gap-[22px] md:grid-cols-2 lg:grid-cols-3">
        {candidates.slice(0, 3).map((candidate, index) => (
          <div key={candidate.id} className={previewClass(index)}>
            <CongratulationCard candidate={candidate} />
          </div>
        ))}
      </div>
    );
  }

  const canNavigate = pages.length > 1;

  return (
    <div
      className="relative min-w-0"
      role="region"
      aria-roledescription="carousel"
      aria-label="Selected candidates"
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setHovered(false);
      }}
      onTouchStart={(event) => {
        const touch = event.changedTouches[0];
        if (!touch) return;
        touchStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || pages.length < 2) return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
        go(dx < 0 ? 1 : -1);
      }}
    >
      {canNavigate ? (
        <button
          type="button"
          aria-label="Previous candidates"
          onClick={() => go(-1)}
          className="absolute left-0 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-[#5D6D80] shadow-[0_6px_18px_rgb(52_70_93/0.16)] transition-colors hover:bg-[#f7f9fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5D6D80]"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </button>
      ) : null}

      <div className={canNavigate ? "px-2 sm:px-14" : "px-1"}>
        <div ref={onFrame} className="min-w-0 overflow-hidden py-5">
        <div
          className={
            reducedMotion
              ? "flex"
              : "flex transition-transform duration-700 ease-out motion-reduce:transition-none"
          }
          style={{ transform: `translate3d(-${safePage * frameWidth}px, 0, 0)` }}
        >
          {pages.map((group, index) => (
            <div
              key={group.map((candidate) => candidate.id).join("-")}
              className="grid shrink-0 items-stretch gap-[22px]"
              style={{
                width: frameWidth > 0 ? frameWidth : "100%",
                gridTemplateColumns: `repeat(${perPage}, minmax(0, 1fr))`,
              }}
              aria-hidden={index === safePage ? undefined : true}
              inert={index === safePage ? undefined : true}
            >
              {group.map((candidate) => (
                <CongratulationCard key={candidate.id} candidate={candidate} />
              ))}
            </div>
          ))}
        </div>
        </div>
      </div>

      {canNavigate ? (
        <button
          type="button"
          aria-label="Next candidates"
          onClick={() => go(1)}
          className="absolute right-0 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-[#5D6D80] shadow-[0_6px_18px_rgb(52_70_93/0.16)] transition-colors hover:bg-[#f7f9fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5D6D80]"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
