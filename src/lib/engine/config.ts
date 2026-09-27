/** Shared startup defaults; explicit overrides still apply. */
export interface OverlapThresholds {
  /** Projects within this distance are physically close. */
  maxMiles: number;
  /** Maximum gap between construction windows for a temporal flag. */
  maxGapMonths: number;
  /** Regional radius limiting time-only flags. */
  regionMiles: number;
}

// Preserve the existing frontend thresholds across all entrypoints.
export const overlapDefaults: Readonly<OverlapThresholds> = Object.freeze({
  maxMiles: 25,
  maxGapMonths: 6,
  regionMiles: 75,
});
