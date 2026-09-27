/** GridSync v1 planning heuristics approved in EE domain review.
 * These are domain defaults, not universal industry constants; explicit overrides still apply.
 */
export interface OverlapThresholds {
  /** Projects within this distance are physically close. */
  maxMiles: number;
  /** Maximum gap between construction windows for a temporal flag. */
  maxGapMonths: number;
  /** Regional radius limiting time-only flags. */
  regionMiles: number;
}

// Equal distance radii disable wider regional candidate discovery at v1 defaults.
// A zero gap includes immediately adjacent construction months (February -> March).
export const overlapDefaults: Readonly<OverlapThresholds> = Object.freeze({
  maxMiles: 25,
  maxGapMonths: 0,
  regionMiles: 25,
});
