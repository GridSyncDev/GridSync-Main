import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { loadJsonDataset } from "./data";
import type { Project } from "./domain/schema";
import { compare } from "./engine/overlap";
import {
  COST_CAVEAT,
  IMPACT_CAVEAT,
  USER_ASSUMPTION_LABEL,
  WINDER_IMPACT_PROJECT_IDS,
  costAvoidedRange,
  impactAssumptionSource,
  impactFactsFromOverlap,
  impactScenario,
  impactScenarioForPair,
} from "./impact";
import { PRESETS } from "./ui/presets";

function projectById(projects: Project[], id: string): Project {
  const project = projects.find((candidate) => candidate.id === id);
  assert.ok(project, `missing canonical project ${id}`);
  return project;
}

test("the exact canonical Winder pair receives the scenario in either order", async () => {
  const { projects } = await loadJsonDataset();
  const a = projectById(projects, WINDER_IMPACT_PROJECT_IDS[0]);
  const b = projectById(projects, WINDER_IMPACT_PROJECT_IDS[1]);

  assert.equal(a.name, "Clarksboro - Winder Primary 230 kV Rebuild");
  assert.equal(a.utility, "georgia-transmission-corp");
  assert.equal(a.type, "transmission_line_upgrade");
  assert.equal(b.name, "Jefferson Road - Winder Primary 115 kV Rebuild");
  assert.equal(b.utility, "georgia-power-co");
  assert.equal(b.type, "transmission_line_upgrade");
  assert.equal(impactScenarioForPair(a, b), impactScenario);
  assert.equal(impactScenarioForPair(b, a), impactScenario);
});

test("unrelated pairs do not receive the Winder impact scenario", async () => {
  const { projects } = await loadJsonDataset();
  const a = projectById(projects, WINDER_IMPACT_PROJECT_IDS[0]);
  const unrelated = projects.find((project) => !WINDER_IMPACT_PROJECT_IDS.includes(project.id as (typeof WINDER_IMPACT_PROJECT_IDS)[number]));
  assert.ok(unrelated);
  assert.equal(impactScenarioForPair(a, unrelated), null);
});

test("the deterministic acreage scenario preserves the DOE-backed generic range", () => {
  assert.deepEqual(impactScenario.stagingAcresPerProject, { min: 1, max: 3 });
  assert.deepEqual(impactScenario.separateYardsAcres, { min: 2, max: 6 });
  assert.deepEqual(impactScenario.sharedYardAcres, { min: 1, max: 3 });
  assert.deepEqual(impactScenario.potentialDuplicatedFootprintAvoidedAcres, { min: 1, max: 3 });
});

test("planner cost assumptions produce only the deterministic duplicate-footprint range", () => {
  assert.equal(costAvoidedRange(""), null);
  assert.equal(costAvoidedRange("   "), null);
  assert.equal(costAvoidedRange(undefined), null);
  assert.equal(costAvoidedRange(null), null);
  assert.equal(costAvoidedRange(-1), null);
  assert.equal(costAvoidedRange(Number.NaN), null);
  assert.equal(costAvoidedRange("not a number"), null);
  assert.deepEqual(costAvoidedRange(50_000), { min: 50_000, max: 150_000 });
  assert.deepEqual(costAvoidedRange("100000"), { min: 100_000, max: 300_000 });
});

test("live Winder facts are copied from Overlap rather than impact constants", async () => {
  const { projects } = await loadJsonDataset();
  const a = projectById(projects, WINDER_IMPACT_PROJECT_IDS[0]);
  const b = projectById(projects, WINDER_IMPACT_PROJECT_IDS[1]);
  const overlap = compare(a, b);
  assert.ok(overlap);
  const facts = impactFactsFromOverlap(overlap);

  assert.equal(facts.distanceMiles, overlap.distanceMiles);
  assert.equal(facts.distanceKm, overlap.distanceKm);
  assert.equal(facts.overlapMonths, overlap.overlapMonths);
  assert.equal(facts.gapMonths, overlap.gapMonths);
  assert.equal(facts.actualTimelineOverlap, overlap.actualTimelineOverlap);
  assert.equal(facts.immediatelySequential, overlap.immediatelySequential);
  assert.equal(facts.scheduleIsEstimated, overlap.scheduleIsEstimated);
  assert.equal(facts.scorePoints, overlap.scores.points);
  assert.equal(facts.scoreMaxPoints, overlap.scores.maxPoints);
  assert.equal(facts.scoreNormalized, overlap.scores.normalized);
  assert.equal(facts.earnedMechanisms.length, Object.values(overlap.scores.breakdown).filter((point) => point.earned).length);
});

test("impact copy labels dollars as an assumption and avoids guaranteed or Winder-specific claims", async () => {
  const component = await readFile(path.join(process.cwd(), "src", "components", "ImpactScenario.tsx"), "utf8");
  const impactModule = await readFile(path.join(process.cwd(), "src", "lib", "impact.ts"), "utf8");
  const copy = `${USER_ASSUMPTION_LABEL} ${IMPACT_CAVEAT} ${COST_CAVEAT} ${component} ${impactModule}`;

  assert.match(USER_ASSUMPTION_LABEL, /user-assumption scenario/i);
  assert.match(IMPACT_CAVEAT, /generic DOE transmission-construction guidance/i);
  assert.match(IMPACT_CAVEAT, /not a published requirement for either Winder project/i);
  assert.match(COST_CAVEAT, /planner-entered all-in temporary staging cost per acre/i);
  assert.doesNotMatch(copy, /land (?:will|is guaranteed to) be saved/i);
  assert.doesNotMatch(copy, /Winder-specific published requirement/i);
  assert.match(component, /not public land-sale pricing/i);
});

test("impact-assumption provenance records the verified official DOE chapter and page", () => {
  assert.equal(impactAssumptionSource.publisher, "U.S. Department of Energy, Office of NEPA Policy and Compliance");
  assert.equal(impactAssumptionSource.page, "3-275");
  assert.match(impactAssumptionSource.url, /^https:\/\/www\.energy\.gov\//);
  assert.match(impactAssumptionSource.note, /generally 1–3 acres/i);
});

test("the sponsor-aligned Savannah hero remains unchanged at 2/4 and normalized 50", async () => {
  const { projects } = await loadJsonDataset();
  const [aId, bId] = PRESETS.savannah.pair;
  assert.deepEqual(PRESETS.savannah.pair, ["desc-jasper-okatie-230kv-2", "gp-mcintosh-purrysburg-230kv"]);
  const overlap = compare(projectById(projects, aId), projectById(projects, bId));
  assert.ok(overlap);
  assert.equal(overlap.scores.points, 2);
  assert.equal(overlap.scores.normalized, 50);
  assert.equal(impactScenarioForPair(aId, bId), null);
});


