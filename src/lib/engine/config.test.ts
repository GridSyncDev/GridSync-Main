import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { GET as candidatesGET } from "../../app/api/candidates/route";
import { GET as overlapsGET } from "../../app/api/overlaps/route";
import { factSheet, template } from "../brief";
import { loadJsonDataset } from "../data";
import { KIND } from "../ui/format";
import { coordinationThresholdsKm, coordinationThresholdsMiles, overlapDefaults } from "./config";
import { compare, findOverlaps, type OverlapParams } from "./overlap";

test("overlap API uses frozen thresholds and ignores legacy distance overrides", async () => {
  const previousUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const dataset = await loadJsonDataset();
    const utilityIds = ["homestead-public-services", "florida-power-light-co"];
    const projects = dataset.projects.filter((project) => utilityIds.includes(project.utility));
    const query = new URLSearchParams({
      utilities: utilityIds.join(","),
      maxMiles: "999",
      maxGapMonths: "24",
      regionMiles: "999",
    });
    const response = await overlapsGET(new Request("http://localhost/api/overlaps?" + query));
    const body = await response.json();
    const expected: OverlapParams = { ...overlapDefaults, shifts: {} };
    assert.equal(response.status, 200);
    assert.deepEqual(body.params, expected);
    assert.deepEqual(body.thresholdsKm, coordinationThresholdsKm);
    assert.deepEqual(body.overlaps, findOverlaps(projects, expected));
    assert.equal(body.count, body.overlaps.length);
    assert.equal(overlapDefaults.maxMiles, coordinationThresholdsMiles.candidate);
    assert.equal(overlapDefaults.regionMiles, coordinationThresholdsMiles.candidate);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});

test("candidate API passes the canonical 40 km gate to PostGIS and ignores overrides", async (t) => {
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
  const calls: unknown[][] = [];
  t.mock.method(pg.Pool.prototype, "query", async (sql: string, values: unknown[]) => {
    assert.equal(sql, "SELECT * FROM candidate_overlaps($1)");
    calls.push(values);
    return { rows: [] };
  });
  try {
    const first = await candidatesGET(new Request("http://localhost/api/candidates"));
    const second = await candidatesGET(new Request("http://localhost/api/candidates?maxMiles=999&regionMiles=999"));
    assert.deepEqual(calls, [[coordinationThresholdsKm.candidate], [coordinationThresholdsKm.candidate]]);
    assert.equal((await first.json()).thresholdKm, 40);
    assert.equal((await second.json()).thresholdKm, 40);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});

test("briefs expose raw and normalized deterministic scoring without contention claims", async () => {
  const { projects, utilities } = await loadJsonDataset();
  const a = projects.find((project) => project.type === "substation_new")!;
  assert.ok(a);
  const b = { ...a, id: "coordination-test", utility: "coordination-test-utility" };
  const overlap = compare(a, b)!;
  assert.equal(overlap.kind, "sharing_opportunity");
  assert.equal(KIND[overlap.kind].label, "Coordination opportunity");
  const facts = factSheet(overlap, a, b, {}).join("\n");
  assert.match(facts, /Raw coordination score: \d out of 4/);
  assert.match(facts, /Normalized display score: \d+ out of 100/);
  assert.match(facts, /descriptive, not scored/);
  assert.doesNotMatch(facts, /collision risk|potential resource contention/i);
  const utility = utilities.find((item) => item.id === a.utility)!;
  const text = template(overlap, a, b, utility, { ...utility, id: b.utility, name: "Test utility" }, {});
  assert.match(text, /coordination|joint planning/i);
  assert.doesNotMatch(text, /will delay|confirmed shortage|collision risk/i);
});
