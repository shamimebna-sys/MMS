import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CongratulationsCarousel } from "@/components/dashboard/congratulations-carousel";
import {
  cardsPerView,
  chunk,
  clampPage,
  COMPANY_LINE,
  MEDICAL_INSTRUCTION,
  nextIndex,
  PASSPORT_HIGHLIGHT,
  restartCarouselTimer,
  ROTATE_MS,
  SELECTION_LINE,
  splitInstruction,
  type CarouselTimer,
} from "@/components/dashboard/congratulations";
import { uniqueSelectedBanners, type SelectedBannerRow } from "@/server/selected-banners";

function walkGroups(ids: number[], perPage: number): { seen: number[]; page: number; groups: number[][] } {
  const groups = chunk(ids, perPage);
  let page = 0;
  const seen: number[] = [];
  for (let step = 0; step < groups.length; step += 1) {
    seen.push(...groups[page]);
    page = nextIndex(page, groups.length, 1);
  }
  return { seen, page, groups };
}

describe("congratulations carousel", () => {
  it("keeps the existing selection, company, and medical copy", () => {
    expect(SELECTION_LINE).toBe("FOR SELECTED FROM");
    expect(COMPANY_LINE).toBe("CYPRUS REPUTED COMPANY");
    expect(MEDICAL_INSTRUCTION).toBe(
      "Please complete your medical report from your own city as per your agent instructions. Please send your original passport by your agent instructions.",
    );
    expect(splitInstruction(MEDICAL_INSTRUCTION)).toEqual([
      "Please complete your medical report from your own city as per your agent instructions. Please send your ",
      PASSPORT_HIGHLIGHT,
      " by your agent instructions.",
    ]);
  });

  it("groups candidates by the visible page size and wraps the index", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7];
    expect(chunk(ids, 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(chunk(ids, 2)).toEqual([[1, 2], [3, 4], [5, 6], [7]]);
    expect(chunk(ids, 1)).toEqual([[1], [2], [3], [4], [5], [6], [7]]);
    expect(nextIndex(2, 3, 1)).toBe(0);
    expect(nextIndex(0, 3, -1)).toBe(2);
    expect(clampPage(8, 3)).toBe(2);
  });

  it("renders stored candidate fields inside the announcement card", () => {
    const html = renderToStaticMarkup(
      createElement(CongratulationsCarousel, {
        candidates: [
          {
            id: 7,
            name: "Amina Rahman",
            position: "Cleaner",
            passportNo: "A1234567",
            photo: "",
          },
        ],
      }),
    );

    expect(html).toContain("CONGRATULATIONS");
    expect(html).toContain("FOR SELECTED FROM");
    expect(html).toContain("CYPRUS REPUTED COMPANY");
    expect(html).toContain("Amina Rahman");
    expect(html).toContain("POSITION : Cleaner");
    expect(html).toContain("PASSPORT NO : A1234567");
    expect(html).toContain("Please complete your medical report from your own city as per your agent instructions. Please send your ");
    expect(html).toContain("original passport");
    expect(html).toContain(" by your agent instructions.");
    expect(html).toContain("/records/candidates/7");
    expect(html).toContain("AR");
    expect(html).not.toContain("overflow-x-auto");
  });

  it("shows three cards on desktop, two on tablet, and one on mobile", () => {
    expect(cardsPerView(1440)).toBe(3);
    expect(cardsPerView(1024)).toBe(3);
    expect(cardsPerView(1023)).toBe(2);
    expect(cardsPerView(768)).toBe(2);
    expect(cardsPerView(767)).toBe(1);
  });

  it("walks every group of a 24-candidate set exactly once and wraps", () => {
    const ids = Array.from({ length: 24 }, (_, index) => index + 1);
    const { seen, page, groups } = walkGroups(ids, 3);
    expect(groups).toHaveLength(8);
    expect(groups[0]).toEqual([1, 2, 3]);
    expect(groups[1]).toEqual([4, 5, 6]);
    expect(groups[7]).toEqual([22, 23, 24]);
    expect(seen).toEqual(ids);
    expect(new Set(seen).size).toBe(24);
    expect(page).toBe(0);
    expect(nextIndex(0, groups.length, -1)).toBe(7);
    expect(nextIndex(7, groups.length, 1)).toBe(0);
    expect(nextIndex(0, groups.length, 1)).toBe(1);
    expect(nextIndex(1, groups.length, -1)).toBe(0);
  });

  it("keeps a short final group instead of dropping those candidates", () => {
    const ids = Array.from({ length: 25 }, (_, index) => index + 1);
    const groups = chunk(ids, 3);
    expect(groups.at(-1)).toEqual([25]);
    const { seen } = walkGroups(ids, 3);
    expect(seen).toEqual(ids);
    expect(clampPage(99, groups.length)).toBe(groups.length - 1);
  });

  it("loads every unique selected candidate and does not cap the query", () => {
    const rows: SelectedBannerRow[] = Array.from({ length: 22 }, (_, index) => ({
      id: index + 1,
      name: `Candidate ${index + 1}`,
      position: "Construction",
      passport_no: `P${index + 1}`,
      photo: "",
    }));
    rows.push({ ...rows[2], name: "Older duplicate" });
    const banners = uniqueSelectedBanners(rows);
    expect(banners).toHaveLength(22);
    expect(banners.map((banner) => banner.id)).toEqual(Array.from({ length: 22 }, (_, index) => index + 1));
    expect(banners[2]?.name).toBe("Candidate 3");

    const source = readFileSync(path.resolve("src/server/dashboard.ts"), "utf8");
    const marker = "DISTINCT ON (c.id)";
    const bannerAt = source.indexOf(marker);
    const flightAt = source.indexOf("FROM flight_schedules f");
    expect(bannerAt).toBeGreaterThan(-1);
    expect(flightAt).toBeGreaterThan(bannerAt);
    const query = source.slice(bannerAt - 500, flightAt);
    expect(query).toContain("FROM selected_candidates s");
    expect(query).toContain("ORDER BY c.id, s.id DESC");
    expect(query).toContain("ORDER BY b.selection_id DESC");
    expect(source.slice(bannerAt, flightAt)).not.toMatch(/LIMIT/i);
  });

  it("restarts manual navigation with a single timer", () => {
    const timer: CarouselTimer = { id: null };
    const scheduled: number[] = [];
    const cleared: number[] = [];
    const schedule = (fn: () => void, ms: number) => {
      fn();
      scheduled.push(ms);
      return scheduled.length;
    };
    const clear = (id: number) => {
      cleared.push(id);
    };

    restartCarouselTimer(timer, true, () => {}, schedule, clear);
    restartCarouselTimer(timer, true, () => {}, schedule, clear);
    restartCarouselTimer(timer, false, () => {}, schedule, clear);

    expect(scheduled).toEqual([ROTATE_MS, ROTATE_MS]);
    expect(cleared).toEqual([1, 2]);
    expect(timer.id).toBeNull();
  });
});
