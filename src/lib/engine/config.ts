/** Exact sponsor thresholds for the frozen GridSync v1 coordination rubric. */
export const coordinationThresholdsKm = Object.freeze({
  rowAccess: 1.6,
  siteLogistics: 8,
  candidate: 40,
});

export const KM_PER_MILE = 1.609344;
export const kmToMiles = (km: number) => km / KM_PER_MILE;
export const milesToKm = (miles: number) => miles * KM_PER_MILE;

export const coordinationThresholdsMiles = Object.freeze({
  rowAccess: kmToMiles(coordinationThresholdsKm.rowAccess),
  siteLogistics: kmToMiles(coordinationThresholdsKm.siteLogistics),
  candidate: kmToMiles(coordinationThresholdsKm.candidate),
});

/**
 * Legacy threshold shape retained in API responses and for older callers.
 * The frozen rubric does not accept overrides: all distance values derive from
 * the exact kilometer constants above, and schedule compatibility is computed
 * from overlapMonths()/gapMonths() directly.
 */
export interface OverlapThresholds {
  maxMiles: number;
  maxGapMonths: number;
  regionMiles: number;
}

export const overlapDefaults: Readonly<OverlapThresholds> = Object.freeze({
  maxMiles: coordinationThresholdsMiles.candidate,
  maxGapMonths: 0,
  regionMiles: coordinationThresholdsMiles.candidate,
});
