import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { datasetSchema, type Dataset } from "./domain/schema";

// Loads every data/projects/*.json file and validates it against the contract.
// A bad file fails loudly with the zod error instead of silently rendering nothing.
// TODO(db): read from Postgres/PostGIS when DATABASE_URL is set (db/schema.sql).

const DATA_DIR = path.join(process.cwd(), "data", "projects");

export async function loadDataset(): Promise<Dataset> {
  const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith(".json")).sort();
  const merged: Dataset = { utilities: [], projects: [] };
  for (const f of files) {
    const parsed = datasetSchema.safeParse(JSON.parse(await readFile(path.join(DATA_DIR, f), "utf8")));
    if (!parsed.success) throw new Error(`data/projects/${f} does not match the contract:\n${parsed.error.message}`);
    for (const u of parsed.data.utilities) if (!merged.utilities.some((x) => x.id === u.id)) merged.utilities.push(u);
    merged.projects.push(...parsed.data.projects);
  }
  const ids = new Set<string>();
  for (const p of merged.projects) {
    if (ids.has(p.id)) throw new Error(`duplicate project id ${p.id}`);
    ids.add(p.id);
    if (!merged.utilities.some((u) => u.id === p.utility)) throw new Error(`project ${p.id} references unknown utility ${p.utility}`);
  }
  return merged;
}
