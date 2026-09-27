import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { GET as overlapsGET } from "../../app/api/overlaps/route";
import { GET as candidatesGET } from "../../app/api/candidates/route";
import { factSheet, template } from "../brief";
import { loadJsonDataset } from "../data";
import { KIND } from "../ui/format";
import { overlapDefaults } from "./config";
import { compare, defaultParams, findOverlaps } from "./overlap";

test("overlap API defaults and explicit overrides match the shared engine on real data", async () => {
  const previousUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const dataset = await loadJsonDataset();
    const utilityIds = ["homestead-public-services", "florida-power-light-co"];
    const projects = dataset.projects.filter((p) => utilityIds.includes(p.utility));
    assert.ok(projects.length > 1);
    assert.equal(defaultParams, overlapDefaults);
    for (const overrides of [null, { maxMiles: 50, maxGapMonths: 0, regionMiles: 250 }]) {
      const query = new URLSearchParams({ utilities: utilityIds.join(",") });
      if (overrides) for (const [key, value] of Object.entries(overrides)) query.set(key, String(value));
      const response = await overlapsGET(new Request("http://localhost/api/overlaps?" + query));
      const body = await response.json();
      const expected = { ...(overrides ?? overlapDefaults), shifts: {} };
      assert.equal(response.status, 200);
      assert.deepEqual(body.params, expected);
      assert.deepEqual(body.overlaps, findOverlaps(projects, expected));
      assert.equal(body.count, body.overlaps.length);
    }
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});

test("candidate API passes shared defaults and explicit overrides to PostGIS", async (t) => {
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
  const calls: unknown[][] = [];
  t.mock.method(pg.Pool.prototype, "query", async (sql: string, values: unknown[]) => {
    assert.equal(sql, "SELECT * FROM candidate_overlaps($1, $2, $3)");
    calls.push(values);
    return { rows: [] };
  });
  try {
    await candidatesGET(new Request("http://localhost/api/candidates"));
    await candidatesGET(new Request("http://localhost/api/candidates?maxMiles=40&maxGapMonths=0&regionMiles=90"));
    assert.deepEqual(calls, [
      [overlapDefaults.maxMiles, overlapDefaults.maxGapMonths, overlapDefaults.regionMiles],
      [40, 0, 90],
    ]);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});

test("contention wording preserves the internal kind and qualifies brief claims", async () => {
  const { projects, utilities } = await loadJsonDataset();
  const a = projects.find((p) => p.type === "substation_new")!;
  assert.ok(a);
  const b = { ...a, id: "contention-test", utility: "contention-test-utility" };
  const overlap = compare(a, b)!;
  assert.equal(overlap.kind, "collision_risk");
  assert.equal(KIND[overlap.kind].label, "Potential resource contention");
  const facts = factSheet(overlap, a, b, {}).join("\n");
  assert.match(facts, /Classification: Potential resource contention/);
  assert.doesNotMatch(facts, /collision risk/i);
  const ua = utilities.find((u) => u.id === a.utility)!;
  const text = template(overlap, a, b, ua, { ...ua, id: b.utility, name: "Test utility" }, {});
  assert.match(text, /potential resource contention/);
  assert.match(text, /without establishing an actual shortage or delay/);
});
