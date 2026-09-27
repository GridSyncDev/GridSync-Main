import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { loadJsonDataset } from "./data";
import { projectSchema, type Project } from "./domain/schema";
import { coordinationThresholdsKm, KM_PER_MILE } from "./engine/config";
import { distanceMiles } from "./engine/geo";
import { compare } from "./engine/overlap";
import { PRESETS } from "./ui/presets";

const sponsorProjectIds = {
  DESC_1: "desc-stevens-creek-hooks-rebuilds",
  DESC_2: "desc-hooks-thurmond-115kv-rebuild",
  DESC_3: "desc-jasper-okatie-230kv-2",
  DESC_4: "desc-queensboro-ft-johnson-bayfront-115kv",
  DESC_5: "desc-okatie-bluffton-115kv-rebuild",
  GPC_1: "gp-evans-primary-thurmond-dam-115kv-rebuild",
  GPC_2: "gp-mcintosh-purrysburg-230kv",
  GPC_3: "sertp-2028-soco-sav-goshen-sav-mcintosh-115-kv-line-rebuild",
  GPC_4: "gp-mitchell-north-tifton-230kv-reconductor",
  GPC_5: "gp-jesup-ludowici-primary-115kv-rebuild",
} as const;

const sponsorPairs = [
  ["DESC_2", "GPC_1", 4.09],
  ["DESC_3", "GPC_2", 5.65],
  ["DESC_3", "GPC_3", 7.55],
  ["DESC_1", "GPC_1", 8.01],
  ["DESC_5", "GPC_2", 14.34],
  ["DESC_5", "GPC_3", 14.81],
] as const;

function projectById(projects: Project[], id: string): Project {
  const project = projects.find((candidate) => candidate.id === id);
  assert.ok(project, `missing canonical sponsor project ${id}`);
  return project;
}

test("all ten sponsor starter projects map to one canonical record and parse", async () => {
  const { projects } = await loadJsonDataset();
  assert.equal(new Set(Object.values(sponsorProjectIds)).size, 10);

  for (const [sponsorId, canonicalId] of Object.entries(sponsorProjectIds)) {
    const matches = projects.filter((project) => project.id === canonicalId);
    assert.equal(matches.length, 1, `${sponsorId} must map to one canonical record`);
    assert.equal(projectSchema.safeParse(matches[0]).success, true);
    assert.equal(matches[0].utility, sponsorId.startsWith("DESC") ? "dominion-energy-south-carolina" : "georgia-power-co");
  }

  assert.equal(projects.filter((project) => /jasper[- ]okatie/i.test(project.name)).length, 1);
  assert.equal(projects.filter((project) => /mcintosh[- ]purrysburg/i.test(project.name)).length, 1);
  assert.equal(projects.filter((project) => /goshen.*mcintosh/i.test(project.name)).length, 1);
});

test("all sponsor reference pairs resolve and naturally pass the closest-point candidate gate", async () => {
  const { projects } = await loadJsonDataset();
  for (const [left, right] of sponsorPairs) {
    const a = projectById(projects, sponsorProjectIds[left]);
    const b = projectById(projects, sponsorProjectIds[right]);
    const distanceKm = distanceMiles(a.geometry, b.geometry) * KM_PER_MILE;
    assert.ok(distanceKm <= coordinationThresholdsKm.candidate, `${left} / ${right} is ${distanceKm} km`);
  }
});

test("center-point benchmark distances remain documentation only", async () => {
  const docs = await readFile(path.join(process.cwd(), "docs", "SPONSOR_STARTER_REFERENCE.md"), "utf8");
  const scoringSources = await Promise.all([
    readFile(path.join(process.cwd(), "src", "lib", "engine", "config.ts"), "utf8"),
    readFile(path.join(process.cwd(), "src", "lib", "engine", "overlap.ts"), "utf8"),
  ]);

  assert.match(docs, /center-point benchmark/i);
  for (const [, , benchmark] of sponsorPairs) {
    assert.match(docs, new RegExp(String(benchmark).replace(".", "\\.")));
    assert.equal(scoringSources.some((source) => source.includes(String(benchmark))), false);
  }
});

test("unresolved sponsor endpoints are represented only by the known approximate point", async () => {
  const { projects } = await loadJsonDataset();
  const expectedPoints = new Map<string, [number, number]>([
    [sponsorProjectIds.DESC_1, [-82.051362, 33.562599]],
    [sponsorProjectIds.DESC_2, [-82.195931, 33.660127]],
    [sponsorProjectIds.DESC_4, [-79.967332, 32.722793]],
    [sponsorProjectIds.GPC_2, [-81.175112, 32.352116]],
  ]);

  for (const [id, coordinates] of expectedPoints) {
    const project = projectById(projects, id);
    assert.deepEqual(project.geometry, { type: "Point", coordinates });
    assert.equal(project.locationPrecision, "approximate");
  }
});

test("sponsor control records are not artificially turned into coordination opportunities", async () => {
  const { projects } = await loadJsonDataset();
  const dominionControls = [sponsorProjectIds.DESC_4];
  const georgiaControls = [sponsorProjectIds.GPC_4, sponsorProjectIds.GPC_5];
  const dominionSponsorProjects = Object.entries(sponsorProjectIds)
    .filter(([id]) => id.startsWith("DESC"))
    .map(([, id]) => projectById(projects, id));
  const georgiaSponsorProjects = Object.entries(sponsorProjectIds)
    .filter(([id]) => id.startsWith("GPC"))
    .map(([, id]) => projectById(projects, id));

  for (const id of dominionControls) {
    const control = projectById(projects, id);
    assert.ok(georgiaSponsorProjects.every((project) => compare(control, project) === null));
  }
  for (const id of georgiaControls) {
    const control = projectById(projects, id);
    assert.ok(dominionSponsorProjects.every((project) => compare(control, project) === null));
  }
});

test("Savannah hero remains the same deterministic comparison", async () => {
  const { projects } = await loadJsonDataset();
  assert.deepEqual(PRESETS.savannah.pair, [sponsorProjectIds.DESC_3, sponsorProjectIds.GPC_2]);
  const result = compare(
    projectById(projects, sponsorProjectIds.DESC_3),
    projectById(projects, sponsorProjectIds.GPC_2),
  );
  assert.ok(result);
  assert.equal(result.scores.points, 2);
  assert.equal(result.scores.normalized, 50);
  assert.ok(Math.abs(result.distanceMiles - 2.987908564025289) < 1e-9);
});

test("sponsor starter sources introduce no confidential or CEII-marked source", async () => {
  const { projects } = await loadJsonDataset();
  for (const canonicalId of Object.values(sponsorProjectIds)) {
    const project = projectById(projects, canonicalId);
    assert.equal(
      project.sources.some((source) => /confidential|(?:^|[^-])ceii/i.test(`${source.title} ${source.url}`)),
      false,
    );
  }
});
