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
    base({ id: "c", utility: "u3", geometry: { type: "Point", coordinates: [-80.9, 26.0] }, type: "generation_solar" }),
  ]);
  assert.ok(list.length >= 2);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].scores.total >= list[i].scores.total);
});
