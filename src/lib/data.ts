import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { datasetSchema, type Dataset } from "./domain/schema";

// With DATABASE_URL set, projects come from Postgres + PostGIS (Tiger Data, loaded by
// `npm run db:load`). Otherwise, or if the database is unreachable, from data/projects/*.json.

const DATA_DIR = path.join(process.cwd(), "data", "projects");

export type DataSource = "postgres" | "json";

export async function loadDataset(): Promise<Dataset> {
  return (await loadDatasetWithSource()).dataset;
}

export async function loadDatasetWithSource(): Promise<{ dataset: Dataset; source: DataSource }> {
  if (process.env.DATABASE_URL) {
    try {
      const { loadDatasetFromDb } = await import("./db");
      return { dataset: await loadDatasetFromDb(), source: "postgres" };
    } catch (err) {
      console.warn("database unavailable, falling back to JSON:", err instanceof Error ? err.message : err);
    }
  }
  return { dataset: await loadJsonDataset(), source: "json" };
}

// Every data/projects/*.json file, validated against the contract. A bad file fails loudly
// with the zod error instead of silently rendering nothing.
export async function loadJsonDataset(): Promise<Dataset> {
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
