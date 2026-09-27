import type { Project } from "./domain/schema";
import type { CoordinationPointKey, Overlap } from "./engine/overlap";

export const WINDER_IMPACT_PROJECT_IDS = [
  "sertp-2029-gtc-clarksboro-winder-primary-230-kv-rebuild",
  "sertp-2030-soco-jefferson-road-winder-primary-115-kv-rebuild",
] as const;

export const impactAssumptionSource = {
  title:
    "Final Programmatic Environmental Impact Statement for the Designation of Energy Corridors on Federal Land in the 11 Western States, Chapter 3, Part 4",
  publisher: "U.S. Department of Energy, Office of NEPA Policy and Compliance",
  url: "https://www.energy.gov/sites/default/files/2015/08/f25/EIS-0386-FEIS-Ch3_Part4-2008.pdf",
  page: "3-275",
  note: "Generic guidance says electricity-transmission staging areas are generally 1–3 acres and are used to stockpile and store construction equipment and materials.",
} as const;

export const impactScenario = {
  stagingAcresPerProject: { min: 1, max: 3 },
  separateYardsAcres: { min: 2, max: 6 },
  sharedYardAcres: { min: 1, max: 3 },
  potentialDuplicatedFootprintAvoidedAcres: { min: 1, max: 3 },
} as const;

export const USER_ASSUMPTION_LABEL = "User-assumption scenario";

export const IMPACT_SCENARIO_ASSUMPTION =
  "Scenario assumption: each project would otherwise establish one comparable local 1–3 acre staging yard. The shared-yard case assumes one comparable yard can serve both projects without requiring material additional acreage.";

export const IMPACT_CAVEAT =
  "Illustrative planning scenario only. The 1–3 acre staging range is generic DOE transmission-construction guidance, not a published requirement for either Winder project. Actual sharing feasibility and site needs depend on final engineering, access, land ownership, equipment, permitting, construction sequencing, and agreements between the utilities.";

export const COST_CAVEAT =
  "Dollar estimates use the planner-entered all-in temporary staging cost per acre and are not a GridSync forecast or public land-sale pricing.";

const coordinationMechanismLabels: Record<CoordinationPointKey, string> = {
  outageCoordination: "Crossing / outage coordination",
  rowAccessPermitting: "ROW / access / permitting",
  siteLogistics: "Site logistics",
  crewEquipment: "Crews / equipment",
};

function samePair(a: string, b: string, expected: readonly [string, string]): boolean {
  return (a === expected[0] && b === expected[1]) || (a === expected[1] && b === expected[0]);
}

/** Returns the one approved scenario without attaching it to either project globally. */
export function impactScenarioForPair(a: string | Project, b: string | Project) {
  const aId = typeof a === "string" ? a : a.id;
  const bId = typeof b === "string" ? b : b.id;
  return samePair(aId, bId, WINDER_IMPACT_PROJECT_IDS) ? impactScenario : null;
}

export function costAvoidedRange(costPerAcre: unknown): { min: number; max: number } | null {
  if (costPerAcre === null || costPerAcre === undefined) return null;
  if (typeof costPerAcre === "string" && costPerAcre.trim() === "") return null;
  const cost = typeof costPerAcre === "number" ? costPerAcre : Number(costPerAcre);
  if (!Number.isFinite(cost) || cost < 0) return null;
  return {
    min: cost * impactScenario.potentialDuplicatedFootprintAvoidedAcres.min,
    max: cost * impactScenario.potentialDuplicatedFootprintAvoidedAcres.max,
  };
}

/** Keeps all pair-specific live facts sourced from the scoring engine's Overlap object. */
export function impactFactsFromOverlap(overlap: Overlap) {
  return {
    distanceMiles: overlap.distanceMiles,
    distanceKm: overlap.distanceKm,
    overlapMonths: overlap.overlapMonths,
    gapMonths: overlap.gapMonths,
    actualTimelineOverlap: overlap.actualTimelineOverlap,
    immediatelySequential: overlap.immediatelySequential,
    scheduleIsEstimated: overlap.scheduleIsEstimated,
    scorePoints: overlap.scores.points,
    scoreMaxPoints: overlap.scores.maxPoints,
    scoreNormalized: overlap.scores.normalized,
    earnedMechanisms: (Object.entries(overlap.scores.breakdown) as [CoordinationPointKey, Overlap["scores"]["breakdown"][CoordinationPointKey]][])
      .filter(([, item]) => item.earned)
      .map(([key]) => coordinationMechanismLabels[key]),
  };
}

