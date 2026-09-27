import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../domain/schema";
import { distanceMiles, haversineMiles } from "./geo";
import { compare, defaultParams, findOverlaps } from "./overlap";
import { gapMonths, overlapMonths } from "./time";

const base = (over: Partial<Project>): Project => ({
  id: "p",
  utility: "u1",
  name: "p",
  type: "substation_new",
  voltageKv: 138,
  geometry: { type: "Point", coordinates: [-80.45, 25.47] },
  locationPrecision: "exact",
  construction: { start: "2027-01", end: "2027-12", precision: "published" },
  inService: "2027-12",
  status: "planned",
  description: "",
  state: "FL",
  sources: [{ url: "https://example.com", title: "t" }],
  ...over,
});

test("haversine: Miami to Homestead is about 27 miles", () => {
  const d = haversineMiles([-80.1918, 25.7617], [-80.4776, 25.4687]);
  assert.ok(d > 25 && d < 29, String(d));
});

test("point-to-line distance and crossing lines", () => {
  const line = { type: "LineString" as const, coordinates: [[-81, 25], [-80, 25]] as [number, number][] };
  const onLine = distanceMiles({ type: "Point", coordinates: [-80.5, 25] }, line);
  assert.ok(onLine < 0.01);
  const crossing = { type: "LineString" as const, coordinates: [[-80.5, 24.5], [-80.5, 25.5]] as [number, number][] };
  assert.equal(distanceMiles(line, crossing), 0);
});

test("month overlap and gap", () => {
  assert.equal(overlapMonths({ start: "2027-01", end: "2027-12" }, { start: "2027-10", end: "2028-03" }), 3);
  assert.equal(gapMonths({ start: "2027-01", end: "2027-06" }, { start: "2027-10", end: "2028-03" }), 3);
});

test("same utility is never flagged", () => {
  assert.equal(compare(base({ id: "a" }), base({ id: "b" })), null);
});

test("nearby, concurrent substations are a collision risk on transformers", () => {
  const o = compare(base({ id: "a" }), base({ id: "b", utility: "u2", geometry: { type: "Point", coordinates: [-80.4, 25.5] } }));
  assert.ok(o);
  assert.deepEqual(o.flags, ["spatial", "temporal"]);
  assert.equal(o.kind, "collision_risk");
  assert.ok(o.scarceShared.includes("power_transformers"));
  assert.ok(o.scores.total > 80);
});

test("far apart and years apart is not flagged", () => {
  const o = compare(
    base({ id: "a" }),
    base({ id: "b", utility: "u2", geometry: { type: "Point", coordinates: [-84.4, 33.7] }, construction: { start: "2031-01", end: "2031-12", precision: "published" } }),
  );
  assert.equal(o, null);
});

test("what-if shift changes temporal overlap", () => {
  const a = base({ id: "a" });
  const b = base({ id: "b", utility: "u2", geometry: { type: "Point", coordinates: [-80.4, 25.5] }, construction: { start: "2028-06", end: "2029-06", precision: "published" } });
  const before = compare(a, b)!;
  const after = compare(a, b, { ...defaultParams, shifts: { b: -12 } })!;
  assert.equal(before.overlapMonths, 0);
  assert.ok(after.overlapMonths > 0);
  assert.ok(after.scores.total > before.scores.total);
});

test("findOverlaps sorts by score", () => {
  const list = findOverlaps([
    base({ id: "a" }),
    base({ id: "b", utility: "u2", geometry: { type: "Point", coordinates: [-80.4, 25.5] } }),
    base({ id: "c", utility: "u3", geometry: { type: "Point", coordinates: [-80.6, 25.6] }, type: "generation_solar" }),
  ]);
  assert.ok(list.length >= 2);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].scores.total >= list[i].scores.total);
});

test("sister utilities are skipped unless asked", () => {
  const a = base({ id: "a", utility: "duke-c" });
  const b = base({ id: "b", utility: "duke-p", geometry: { type: "Point", coordinates: [-80.4, 25.5] } });
  const parents = { "duke-c": "duke", "duke-p": "duke" };
  assert.equal(compare(a, b, { ...defaultParams, parents }), null);
  assert.ok(compare(a, b, { ...defaultParams, parents, includeAffiliates: true }));
});

test("cross-state pairs are marked", () => {
  const o = compare(base({ id: "a", state: "GA" }), base({ id: "b", utility: "u2", state: "SC", geometry: { type: "Point", coordinates: [-80.4, 25.5] } }));
  assert.equal(o?.crossesStateLine, true);
});

test("v1 distance boundary includes 25 miles and excludes farther concurrent projects", () => {
  const a = base({ id: "a", geometry: { type: "Point", coordinates: [0, 0] } });
  for (const miles of [24.999, 25, 25.001, 60]) {
    const b = base({
      id: "b",
      utility: "u2",
      geometry: { type: "Point", coordinates: [(miles / 3958.8) * (180 / Math.PI), 0] },
    });
    const actualDistance = distanceMiles(a.geometry, b.geometry);
    assert.ok(Math.abs(actualDistance - miles) < 1e-10);
    const o = compare(a, b);
    if (miles <= 25) {
      assert.ok(o, `expected candidate at ${miles} miles`);
      assert.deepEqual(o.flags, ["spatial", "temporal"]);
    } else {
      assert.equal(o, null, `concurrent schedules must not admit a ${miles}-mile pair`);
    }
  }
});

test("v1 temporal flags include February-to-March adjacency but not a full intervening month", () => {
  const a = base({ id: "a", construction: { start: "2027-01", end: "2027-02", precision: "published" } });
  const b = base({ id: "b", utility: "u2", construction: { start: "2027-03", end: "2027-05", precision: "published" } });
  assert.equal(gapMonths(a.construction, b.construction), 0);
  assert.equal(overlapMonths(a.construction, b.construction), 0);
  const adjacent = compare(a, b)!;
  assert.deepEqual(adjacent.flags, ["spatial", "temporal"]);
  assert.equal(adjacent.kind, "sharing_opportunity");
  assert.equal(adjacent.scores.temporal, 50);

  const separated = { ...b, construction: { ...b.construction, start: "2027-04" } };
  assert.equal(gapMonths(a.construction, separated.construction), 1);
  assert.deepEqual(compare(a, separated)?.flags, ["spatial"]);

  const distant = { ...b, geometry: { type: "Point" as const, coordinates: [-80.45, 26.47] as [number, number] } };
  assert.equal(compare(a, distant), null, "adjacent schedules cannot bypass the 25-mile radius");
});

test("point-to-line candidates use the closest segment interior, not a line center or endpoint", () => {
  const a = base({ id: "a", geometry: { type: "Point", coordinates: [-80.1, 25.9] } });
  const b = base({ id: "b", utility: "u2", geometry: { type: "LineString", coordinates: [[-83, 25], [-80, 25], [-80, 27]] } });
  // Every stored vertex and the vertex-average center are farther than the cutoff.
  for (const vertex of [[-83, 25], [-80, 25], [-80, 27], [-81, 25.666667]] as [number, number][]) {
    assert.ok(haversineMiles([-80.1, 25.9], vertex) > 25);
  }
  assert.ok(distanceMiles(a.geometry, b.geometry) < 10);
  assert.equal(distanceMiles(a.geometry, b.geometry), distanceMiles(b.geometry, a.geometry));
  assert.ok(compare(a, b));
});

test("line-to-line closest approach admits a pair whose centers are far apart", () => {
  const a = base({ id: "a", geometry: { type: "LineString", coordinates: [[-82, 25], [-80, 25]] } });
  const b = base({ id: "b", utility: "u2", geometry: { type: "LineString", coordinates: [[-80, 25.1], [-78, 25.1]] } });
  assert.ok(haversineMiles([-81, 25], [-79, 25.1]) > 25);
  assert.ok(distanceMiles(a.geometry, b.geometry) < 10);
  assert.ok(compare(a, b));
});
