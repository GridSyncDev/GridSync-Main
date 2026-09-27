// Months are "YYYY-MM"; internally they are month indexes (year*12 + month-1).

export const toIndex = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return y * 12 + (mo - 1);
};

export const fromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

export const addMonths = (m: string, n: number) => fromIndex(toIndex(m) + n);

export interface Interval {
  start: string;
  end: string;
}

/** Months the two windows share (inclusive), or 0. */
export function overlapMonths(a: Interval, b: Interval): number {
  const lo = Math.max(toIndex(a.start), toIndex(b.start));
  const hi = Math.min(toIndex(a.end), toIndex(b.end));
  return Math.max(0, hi - lo + 1);
}

/** Months between the windows when they don't overlap, else 0. */
export function gapMonths(a: Interval, b: Interval): number {
  const lo = Math.max(toIndex(a.start), toIndex(b.start));
  const hi = Math.min(toIndex(a.end), toIndex(b.end));
  return Math.max(0, lo - hi - 1);
}

export const durationMonths = (i: Interval) => toIndex(i.end) - toIndex(i.start) + 1;
