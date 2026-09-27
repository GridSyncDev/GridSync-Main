import { projectFamiliesFor, sharedProjectFamilies, type ProjectFamily } from "../domain/projectFamilies";
import { resourcesFor } from "../domain/resources";
import type { Project } from "../domain/schema";
import {
  coordinationThresholdsKm,
  milesToKm,
  overlapDefaults,
  type OverlapThresholds,
} from "./config";
import { distanceMiles } from "./geo";
import { geometriesTouchOrCross } from "./intersection";
import { addMonths, gapMonths, overlapMonths, type Interval } from "./time";

// Deterministic, explainable coordination scoring. No LLM touches these numbers.

export interface OverlapParams extends Partial<OverlapThresholds> {
  /** What-if: months to shift a project's construction window, by project id. */
  shifts?: Record<string, number>;
  /** Utility id -> holding company. Sister utilities are skipped unless includeAffiliates. */
  parents?: Record<string, string | undefined>;
  includeAffiliates?: boolean;
}

// Threshold fields are compatibility aliases only; compare() always uses the frozen rubric.
export const defaultParams: Readonly<OverlapParams> = overlapDefaults;

export type CoordinationPointKey = "outageCoordination" | "rowAccessPermitting" | "siteLogistics" | "crewEquipment";

export interface CoordinationPoint {
  earned: boolean;
  points: 0 | 1;
  explanation: string;
  usesEstimatedSchedule: boolean;
}

export interface Overlap {
  id: string;
  a: string;
  b: string;
  /** `temporal` means actual construction-window overlap; adjacency is separate. */
  flags: ("spatial" | "temporal")[];
  crossesStateLine: boolean;
  /** Kept for existing clients. The frozen model emits coordination opportunities only. */
  kind: "sharing_opportunity" | "collision_risk";
  distanceMiles: number;
  distanceKm: number;
  overlapMonths: number;
  gapMonths: number;
  actualTimelineOverlap: boolean;
  immediatelySequential: boolean;
  mobilizationCompatible: boolean;
  geometriesIntersect: boolean;
  scheduleIsEstimated: boolean;
  families: { a: ProjectFamily[]; b: ProjectFamily[]; shared: ProjectFamily[] };
  /** Descriptive metadata only; resources do not affect score or rank. */
  sharedResources: string[];
  scores: {
    points: number;
    maxPoints: 4;
    normalized: number;
    /** Backward-compatible 0–100 display value. */
    total: number;
    breakdown: Record<CoordinationPointKey, CoordinationPoint>;
  };
  reasons: string[];
}

export function windowOf(project: Project, shifts?: Record<string, number>): Interval {
  const shift = shifts?.[project.id] ?? 0;
  return { start: addMonths(project.construction.start, shift), end: addMonths(project.construction.end, shift) };
}

const round = (value: number, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;
const boundaryTolerance = (threshold: number) => Math.max(1, threshold) * Number.EPSILON * 16;
const withinInclusive = (value: number, threshold: number) => value <= threshold + boundaryTolerance(threshold);
const strictlyUnder = (value: number, threshold: number) => value < threshold - boundaryTolerance(threshold);
const point = (earned: boolean, explanation: string, usesEstimatedSchedule = false): CoordinationPoint => ({
  earned,
  points: earned ? 1 : 0,
  explanation,
  usesEstimatedSchedule: earned && usesEstimatedSchedule,
});

function timingReason(actualOverlap: boolean, immediatelySequential: boolean, overlap: number, gap: number, estimated: boolean): string {
  if (actualOverlap) {
    return `${estimated ? "Estimated construction windows" : "Construction windows"} overlap by ${overlap} months.`;
  }
  if (immediatelySequential) {
    return estimated
      ? "Estimated construction schedules are immediately sequential — potential direct logistics or crew handoff."
      : "Immediately sequential schedules — potential direct logistics or crew handoff.";
  }
  return `${estimated ? "Estimated construction windows are" : "Construction windows are"} ${gap} months apart.`;
}

export function compare(a: Project, b: Project, params: OverlapParams = defaultParams): Overlap | null {
  if (a.utility === b.utility) return null;
  const parent = params.parents?.[a.utility];
  if (!params.includeAffiliates && parent && parent === params.parents?.[b.utility]) return null;
  if (a.type.startsWith("generation_") || b.type.startsWith("generation_")) return null;

  // Keep the established closest-point engine as the sole source of distance.
  const exactDistanceMiles = distanceMiles(a.geometry, b.geometry);
  const distanceKm = milesToKm(exactDistanceMiles);
  if (!withinInclusive(distanceKm, coordinationThresholdsKm.candidate)) return null;

  const windowA = windowOf(a, params.shifts);
  const windowB = windowOf(b, params.shifts);
  const overlap = overlapMonths(windowA, windowB);
  const gap = gapMonths(windowA, windowB);
  const actualTimelineOverlap = overlap > 0;
  const immediatelySequential = overlap === 0 && gap === 0;
  const mobilizationCompatible = actualTimelineOverlap || immediatelySequential;
  const intersects = geometriesTouchOrCross(a.geometry, b.geometry);
  const estimatedSchedule = a.construction.precision === "estimated" || b.construction.precision === "estimated";
  const sharedFamilies = sharedProjectFamilies(a, b);
  const breakdown: Overlap["scores"]["breakdown"] = {
    outageCoordination: point(
      intersects && actualTimelineOverlap,
      "Crossing/touching projects with overlapping construction windows may benefit from coordinated outage timing and crossing work.",
      estimatedSchedule,
    ),
    rowAccessPermitting: point(
      strictlyUnder(distanceKm, coordinationThresholdsKm.rowAccess),
      "Potential right-of-way, access-road, or permitting coordination.",
    ),
    siteLogistics: point(
      strictlyUnder(distanceKm, coordinationThresholdsKm.siteLogistics) && mobilizationCompatible,
      "Potential shared site logistics, such as laydown areas or coordinated deliveries.",
      estimatedSchedule,
    ),
    crewEquipment: point(
      strictlyUnder(distanceKm, coordinationThresholdsKm.candidate) && mobilizationCompatible && sharedFamilies.length > 0,
      "Potential crew and equipment mobilization coordination.",
      estimatedSchedule,
    ),
  };
  const points = Object.values(breakdown).reduce((sum, item) => sum + item.points, 0);
  const normalized = Math.round((points / 4) * 100);
  const resourcesA = resourcesFor(a);
  const resourcesB = new Set(resourcesFor(b));
  const sharedResources = resourcesA.filter((resource) => resourcesB.has(resource));
  const reasons = [
    `${round(exactDistanceMiles)} mi (${round(distanceKm)} km) closest-point distance.`,
    timingReason(actualTimelineOverlap, immediatelySequential, overlap, gap, estimatedSchedule),
    ...Object.values(breakdown).filter((item) => item.earned).map((item) => item.explanation),
  ];
  if (a.state !== b.state) reasons.push(`Cross-state opportunity across the ${a.state}–${b.state} planning boundary.`);

  return {
    id: [a.id, b.id].sort().join("__"),
    a: a.id,
    b: b.id,
    flags: actualTimelineOverlap ? ["spatial", "temporal"] : ["spatial"],
    crossesStateLine: a.state !== b.state,
    kind: "sharing_opportunity",
    distanceMiles: exactDistanceMiles,
    distanceKm,
    overlapMonths: overlap,
    gapMonths: gap,
    actualTimelineOverlap,
    immediatelySequential,
    mobilizationCompatible,
    geometriesIntersect: intersects,
    scheduleIsEstimated: estimatedSchedule,
    families: { a: projectFamiliesFor(a), b: projectFamiliesFor(b), shared: sharedFamilies },
    sharedResources,
    scores: { points, maxPoints: 4, normalized, total: normalized, breakdown },
    reasons,
  };
}

export function compareOverlaps(a: Overlap, b: Overlap): number {
  return (
    b.scores.points - a.scores.points ||
    a.distanceMiles - b.distanceMiles ||
    Number(b.actualTimelineOverlap) - Number(a.actualTimelineOverlap) ||
    b.overlapMonths - a.overlapMonths ||
    a.id.localeCompare(b.id)
  );
}

/** All eligible cross-utility pairs, ordered by the deterministic rubric. */
export function findOverlaps(projects: Project[], params: OverlapParams = defaultParams): Overlap[] {
  const results: Overlap[] = [];
  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const overlap = compare(projects[i], projects[j], params);
      if (overlap) results.push(overlap);
    }
  }
  return results.sort(compareOverlaps);
}
