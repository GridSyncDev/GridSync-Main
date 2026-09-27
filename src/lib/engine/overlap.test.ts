import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project, ProjectType } from "../domain/schema";
import { loadJsonDataset } from "../data";
import { coordinationThresholdsKm, KM_PER_MILE } from "./config";
import { distanceMiles, haversineMiles } from "./geo";
import { compare, compareOverlaps, defaultParams, findOverlaps } from "./overlap";
import { gapMonths, overlapMonths } from "./time";

const base = (overrides: Partial<Project> = {}): Project => ({
  id: "p",
  utility: "u1",
  name: "p",
  type: "substation_new",
  voltageKv: 138,
  geometry: { type: "Point", coordinates: [0, 0] },
  locationPrecision: "exact",
  construction: { start: "2027-01", end: "2027-12", precision: "published" },
  inService: "2027-12",
  status: "planned",
  description: "",
  state: "FL",
  sources: [{ url: "https://example.com", title: "t" }],
  ...overrides,
});

const longitudeForKm = (km: number) => ((km / KM_PER_MILE) / 3958.8) * (180 / Math.PI);
const atKm = (km: number): Project["geometry"] => ({ type: "Point", coordinates: [longitudeForKm(km), 0] });
const other = (overrides: Partial<Project> = {}) => base({ id: "b", utility: "u2", ...overrides });
const schedules = {
  overlap: { start: "2027-06", end: "2028-03", precision: "published" as const },
  adjacent: { start: "2028-01", end: "2028-06", precision: "published" as const },
  separated: { start: "2029-01", end: "2029-06", precision: "published" as const },
};

test("haversine and closest-point geometry remain the distance basis", () => {
  const d = haversineMiles([-80.1918, 25.7617], [-80.4776, 25.4687]);
  assert.ok(d > 25 && d < 29, String(d));
  const point = base({ id: "a", geometry: { type: "Point", coordinates: [-80.1, 25.9] } });
  const line = other({ geometry: { type: "LineString", coordinates: [[-83, 25], [-80, 25], [-80, 27]] } });
  for (const vertex of [[-83, 25], [-80, 25], [-80, 27], [-81, 25.666667]] as [number, number][]) {
    assert.ok(haversineMiles([-80.1, 25.9], vertex) > 25);
  }
  assert.ok(distanceMiles(point.geometry, line.geometry) < 10);
  assert.equal(distanceMiles(point.geometry, line.geometry), distanceMiles(line.geometry, point.geometry));
  assert.ok(compare(point, line));
});

test(">40 km is rejected", () => {
  assert.equal(compare(base({ id: "a" }), other({ geometry: atKm(40.001) })), null);
});

test("exactly 40 km is an eligible boundary but does not earn the under-40 crew point", () => {
  const a = base({ id: "a", type: "transmission_line_new" });
  const b = other({ type: "transmission_line_upgrade", geometry: atKm(coordinationThresholdsKm.candidate) });
  const actualKm = distanceMiles(a.geometry, b.geometry) * KM_PER_MILE;
  assert.ok(Math.abs(actualKm - 40) < 1e-10, String(actualKm));
  const result = compare(a, b);
  assert.ok(result);
  assert.equal(result.scores.breakdown.crewEquipment.earned, false);
});

test("generation pairs are excluded", () => {
  assert.equal(compare(base({ id: "a", type: "generation_solar" }), other({ type: "generation_storage" })), null);
});

test("generation versus transmission is excluded", () => {
  assert.equal(compare(base({ id: "a", type: "generation_gas" }), other({ type: "transmission_line_new" })), null);
});

test("distribution versus transmission is excluded", () => {
  assert.equal(compare(base({ id: "a", type: "distribution" }), other({ type: "transmission_line_new" })), null);
});

test("other versus substation is excluded", () => {
  assert.equal(compare(base({ id: "a", type: "other" }), other({ type: "substation_new" })), null);
});

test("distribution versus other is excluded", () => {
  assert.equal(compare(base({ id: "a", type: "distribution" }), other({ type: "other" })), null);
});

test("all four transmission/substation project types remain eligible", () => {
  const supported: ProjectType[] = [
    "transmission_line_new",
    "transmission_line_upgrade",
    "substation_new",
    "substation_upgrade",
  ];
  for (const type of supported) {
    assert.ok(compare(base({ id: `a-${type}`, type }), other({ type: "transmission_line_new" })), type);
  }
});

test("touching/crossing plus actual overlap earns the outage point", () => {
  const a = base({ id: "a", type: "transmission_line_new", geometry: { type: "LineString", coordinates: [[-1, 0], [1, 0]] } });
  const b = other({ type: "transmission_line_upgrade", geometry: { type: "LineString", coordinates: [[0, -1], [0, 1]] }, construction: schedules.overlap });
  const result = compare(a, b)!;
  assert.equal(result.geometriesIntersect, true);
  assert.equal(result.actualTimelineOverlap, true);
  assert.equal(result.scores.breakdown.outageCoordination.earned, true);
});

test("touching/crossing plus immediate adjacency does not earn the outage point", () => {
  const a = base({ id: "a", type: "transmission_line_new", geometry: { type: "LineString", coordinates: [[-1, 0], [1, 0]] } });
  const b = other({ type: "transmission_line_upgrade", geometry: { type: "LineString", coordinates: [[0, -1], [0, 1]] }, construction: schedules.adjacent });
  const result = compare(a, b)!;
  assert.equal(result.immediatelySequential, true);
  assert.equal(result.actualTimelineOverlap, false);
  assert.equal(result.scores.breakdown.outageCoordination.earned, false);
});

test("under 1.6 km earns ROW/access without timing compatibility", () => {
  const result = compare(base({ id: "a" }), other({ geometry: atKm(1.599), construction: schedules.separated }))!;
  assert.equal(result.mobilizationCompatible, false);
  assert.equal(result.scores.breakdown.rowAccessPermitting.earned, true);
});

test("exactly 1.6 km does not earn the ROW/access point", () => {
  const result = compare(base({ id: "a" }), other({ geometry: atKm(coordinationThresholdsKm.rowAccess), construction: schedules.separated }))!;
  assert.ok(Math.abs(result.distanceKm - 1.6) < 1e-10, String(result.distanceKm));
  assert.equal(result.scores.breakdown.rowAccessPermitting.earned, false);
});

test("under 8 km plus actual overlap earns site logistics", () => {
  const result = compare(base({ id: "a" }), other({ geometry: atKm(7.999), construction: schedules.overlap }))!;
  assert.equal(result.scores.breakdown.siteLogistics.earned, true);
});

test("under 8 km plus immediate adjacency earns site logistics", () => {
  const result = compare(base({ id: "a" }), other({ geometry: atKm(7.999), construction: schedules.adjacent }))!;
  assert.equal(result.scores.breakdown.siteLogistics.earned, true);
});

test("under 8 km without compatible timing does not earn site logistics", () => {
  const result = compare(base({ id: "a" }), other({ geometry: atKm(7.999), construction: schedules.separated }))!;
  assert.equal(result.scores.breakdown.siteLogistics.earned, false);
});

test("exactly 8 km does not earn site logistics", () => {
  const result = compare(base({ id: "a" }), other({ geometry: atKm(coordinationThresholdsKm.siteLogistics), construction: schedules.overlap }))!;
  assert.ok(Math.abs(result.distanceKm - 8) < 1e-10, String(result.distanceKm));
  assert.equal(result.scores.breakdown.siteLogistics.earned, false);
});

test("site logistics does not require a matching family", () => {
  const result = compare(
    base({ id: "a", type: "transmission_line_new" }),
    other({ type: "substation_new", geometry: atKm(7), construction: schedules.overlap }),
  )!;
  assert.deepEqual(result.families.shared, []);
  assert.equal(result.scores.breakdown.siteLogistics.earned, true);
});

test("under 40 km plus compatible timing and shared transmission family earns crews/equipment", () => {
  const result = compare(
    base({ id: "a", type: "transmission_line_new" }),
    other({ type: "transmission_line_upgrade", geometry: atKm(39.999), construction: schedules.adjacent }),
  )!;
  assert.deepEqual(result.families.shared, ["transmission"]);
  assert.equal(result.scores.breakdown.crewEquipment.earned, true);
});

test("transmission and substation families do not earn the crew point", () => {
  const result = compare(
    base({ id: "a", type: "transmission_line_new" }),
    other({ type: "substation_upgrade", construction: schedules.overlap }),
  )!;
  assert.deepEqual(result.families, { a: ["transmission"], b: ["substation"], shared: [] });
  assert.equal(result.scores.breakdown.crewEquipment.earned, false);
});

test("actual overlap and immediate adjacency are represented separately", () => {
  const actual = compare(base({ id: "a" }), other({ construction: schedules.overlap }))!;
  assert.equal(actual.actualTimelineOverlap, true);
  assert.equal(actual.immediatelySequential, false);
  assert.deepEqual(actual.flags, ["spatial", "temporal"]);
  const adjacent = compare(base({ id: "a" }), other({ construction: schedules.adjacent }))!;
  assert.equal(adjacent.actualTimelineOverlap, false);
  assert.equal(adjacent.immediatelySequential, true);
  assert.equal(adjacent.mobilizationCompatible, true);
  assert.deepEqual(adjacent.flags, ["spatial"]);
  assert.match(adjacent.reasons.join(" "), /Immediately sequential schedules/);
  assert.doesNotMatch(adjacent.reasons.join(" "), /windows overlap/i);
});

test("maximum score is exactly 4 and normalized maximum is 100", () => {
  const a = base({ id: "a", type: "transmission_line_new", geometry: { type: "LineString", coordinates: [[-1, 0], [1, 0]] } });
  const b = other({ type: "transmission_line_upgrade", geometry: { type: "LineString", coordinates: [[0, -1], [0, 1]] }, construction: schedules.overlap });
  const result = compare(a, b)!;
  assert.equal(result.scores.points, 4);
  assert.equal(result.scores.maxPoints, 4);
  assert.equal(result.scores.normalized, 100);
  assert.equal(result.scores.total, 100);
});

test("sorting is deterministic by raw score, distance, actual overlap strength, then id", () => {
  const origin = base({ id: "origin", type: "transmission_line_new" });
  const higher = compare(origin, other({ id: "higher", type: "transmission_line_upgrade", geometry: atKm(1), construction: schedules.overlap }))!;
  const nearer = compare(origin, other({ id: "nearer", type: "transmission_line_upgrade", geometry: atKm(10), construction: schedules.overlap }))!;
  const farther = compare(origin, other({ id: "farther", type: "transmission_line_upgrade", geometry: atKm(20), construction: schedules.overlap }))!;
  const adjacent = compare(origin, other({ id: "adjacent", type: "transmission_line_upgrade", geometry: atKm(20), construction: schedules.adjacent }))!;
  const alpha = compare(origin, other({ id: "alpha", type: "transmission_line_upgrade", geometry: atKm(20), construction: schedules.overlap }))!;
  assert.deepEqual([farther, adjacent, higher, nearer, alpha].sort(compareOverlaps).map((item) => item.id), [higher.id, nearer.id, alpha.id, farther.id, adjacent.id]);
  const viaFinder = findOverlaps([origin, other({ id: "zeta", type: "transmission_line_upgrade", geometry: atKm(20), construction: schedules.overlap })]);
  assert.equal(viaFinder.length, 1);
});

test("estimated timing visibly qualifies explanations and timing-dependent points", () => {
  const result = compare(
    base({ id: "a", type: "transmission_line_new" }),
    other({ type: "transmission_line_upgrade", construction: { ...schedules.overlap, precision: "estimated" } }),
  )!;
  assert.equal(result.scheduleIsEstimated, true);
  assert.match(result.reasons.join(" "), /Estimated construction windows overlap/);
  assert.equal(result.scores.breakdown.siteLogistics.usesEstimatedSchedule, true);
  assert.equal(result.scores.breakdown.crewEquipment.usesEstimatedSchedule, true);
});

test("same utility and sister utilities retain their exclusions", () => {
  assert.equal(compare(base({ id: "a" }), base({ id: "b" })), null);
  const a = base({ id: "a", utility: "duke-c" });
  const b = other({ utility: "duke-p" });
  const parents = { "duke-c": "duke", "duke-p": "duke" };
  assert.equal(compare(a, b, { ...defaultParams, parents }), null);
  assert.ok(compare(a, b, { ...defaultParams, parents, includeAffiliates: true }));
});

test("month overlap and gap keep inclusive-window semantics", () => {
  assert.equal(overlapMonths({ start: "2027-01", end: "2027-12" }, { start: "2027-10", end: "2028-03" }), 3);
  assert.equal(gapMonths({ start: "2027-01", end: "2027-02" }, { start: "2027-03", end: "2027-05" }), 0);
});

test("the sponsor Savannah hero is scored from canonical data without a hardcoded desired result", async () => {
  const dataset = await loadJsonDataset();
  const a = dataset.projects.find((project) => project.id === "desc-jasper-okatie-230kv-2");
  const b = dataset.projects.find((project) => project.id === "gp-mcintosh-purrysburg-230kv");
  assert.ok(a && b);
  const result = compare(a, b);
  assert.ok(result);
  assert.equal(result.scores.points, Object.values(result.scores.breakdown).filter((item) => item.earned).length);
  assert.equal(result.scores.normalized, Math.round((result.scores.points / 4) * 100));
  assert.deepEqual(result.families.shared, ["transmission"]);
});

// Compile-time guard that the helper accepts every current canonical project type.
void ("other" satisfies ProjectType);
