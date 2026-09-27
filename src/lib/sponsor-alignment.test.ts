import assert from "node:assert/strict";
import { test } from "node:test";
import { loadJsonDataset } from "./data";
import { projectSchema } from "./domain/schema";
import { distanceMiles } from "./engine/geo";
import { PRESETS } from "./ui/presets";

const heroIds = ["desc-jasper-okatie-230kv-2", "gp-mcintosh-purrysburg-230kv"] as const;

test("Savannah hero uses distinct sponsor-aligned transmission projects", async () => {
  const dataset = await loadJsonDataset();
  assert.deepEqual(PRESETS.savannah.pair, heroIds);

  const heroProjects = heroIds.map((id) => dataset.projects.find((project) => project.id === id));
  assert.ok(heroProjects.every(Boolean), "both hero IDs exist in the canonical dataset");
  for (const project of heroProjects) {
    assert.ok(project);
    assert.equal(projectSchema.safeParse(project).success, true);
    assert.match(project.type, /^transmission_line_/);
    assert.equal(project.sources.some((source) => /confidential|(?:^|[^-])ceii/i.test(`${source.title} ${source.url}`)), false);
  }

  assert.ok(dataset.projects.some((project) => project.id === "gp-mcintosh-cc-expansion"), "generation project remains separate");
  assert.equal(PRESETS.savannah.pair.includes("gp-mcintosh-cc-expansion" as never), false);
  assert.equal(PRESETS.savannah.pair.includes("desc-jasper-okatie-sherwood-230kv" as never), false);
  assert.equal(dataset.projects.some((project) => project.id === "desc-jasper-okatie-sherwood-230kv"), false);

  assert.ok(heroProjects[0] && heroProjects[1]);
  assert.ok(distanceMiles(heroProjects[0].geometry, heroProjects[1].geometry) > 0);
});

