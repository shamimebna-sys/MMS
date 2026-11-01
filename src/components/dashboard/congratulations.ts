/** Existing congratulations announcement copy. Not candidate records. */
export const SELECTION_LINE = "FOR SELECTED FROM";
export const COMPANY_LINE = "CYPRUS REPUTED COMPANY";

/** Existing medical instruction shown on every selected-candidate card. */
export const MEDICAL_INSTRUCTION =
  "Please complete your medical report from your own city as per your agent instructions. Please send your original passport by your agent instructions.";

export const PASSPORT_HIGHLIGHT = "original passport";

export const ROTATE_MS = 5000;

export function cardsPerView(width: number): 1 | 2 | 3 {
  if (width < 768) return 1;
  if (width < 1024) return 2;
  return 3;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0 || items.length === 0) return [];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

export function nextIndex(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return 0;
  return (current + direction + count) % count;
}

export function clampPage(page: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(page, 0), count - 1);
}

export type CarouselTimer = { id: number | null };

/** Replace any running interval with at most one new interval. */
export function restartCarouselTimer(
  timer: CarouselTimer,
  active: boolean,
  tick: () => void,
  schedule: (fn: () => void, ms: number) => number,
  clear: (id: number) => void,
  intervalMs = ROTATE_MS,
): void {
  if (timer.id != null) {
    clear(timer.id);
    timer.id = null;
  }
  if (!active) return;
  timer.id = schedule(tick, intervalMs);
}

export function splitInstruction(
  text: string,
  phrase = PASSPORT_HIGHLIGHT,
): [string, string, string] | null {
  const index = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (index < 0) return null;
  return [text.slice(0, index), text.slice(index, index + phrase.length), text.slice(index + phrase.length)];
}
