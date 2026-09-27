// Loads data/projects/*.json (validated by the contract) into Postgres + PostGIS.
//   npm run db:sql    -> writes db/seed.sql (idempotent: truncates and reloads)
//   npm run db:load   -> runs it against DATABASE_URL
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { loadJsonDataset } from "../src/lib/data";
import { resourcesFor } from "../src/lib/domain/resources";
import { connectionConfig } from "../src/lib/db";
import { addMonths } from "../src/lib/engine/time";

const q = (v: unknown) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const arr = (xs: string[]) => `ARRAY[${xs.map(q).join(",")}]::text[]`;
const day = (m: string) => `${m}-01`;

export async function seedSql(): Promise<string> {
  const { utilities, projects } = await loadJsonDataset();
  const out = ["BEGIN;", "TRUNCATE sources, projects, utilities CASCADE;"];
  for (const u of utilities) {
    out.push(`INSERT INTO utilities (id,name,kind,states,color,parent) VALUES (${q(u.id)},${q(u.name)},${q(u.kind)},${arr(u.states)},${q(u.color)},${q(u.parent)});`);
  }
  for (const p of projects) {
    out.push(
      `INSERT INTO projects (id,utility_id,name,type,voltage_kv,capacity_mw,geom,location_precision,construction,schedule_precision,in_service,status,description,county,state,resources) VALUES (` +
        [
          q(p.id),
          q(p.utility),
          q(p.name),
          q(p.type),
          p.voltageKv ?? "NULL",
          p.capacityMw ?? "NULL",
          `ST_GeomFromGeoJSON(${q(JSON.stringify(p.geometry))})::geography`,
          q(p.locationPrecision),
          `daterange(${q(day(p.construction.start))}, ${q(day(addMonths(p.construction.end, 1)))})`,
          q(p.construction.precision),
          p.inService ? q(day(p.inService)) : "NULL",
          q(p.status),
          q(p.description),
          q(p.county),
          q(p.state),
          arr(resourcesFor(p)),
        ].join(",") +
        ");",
    );
    for (const s of p.sources) {
      out.push(
        `INSERT INTO sources (project_id,url,title,publisher,retrieved,quote,page) VALUES (${q(p.id)},${q(s.url)},${q(s.title)},${q(s.publisher)},${s.retrieved ? q(s.retrieved) : "NULL"},${q(s.quote)},${s.page ?? "NULL"});`,
      );
    }
  }
  out.push("COMMIT;");
  return out.join("\n") + "\n";
}

async function main() {
  const sql = await seedSql();
  if (process.argv.includes("--sql")) {
    await writeFile("db/seed.sql", sql);
    console.log(`wrote db/seed.sql (${sql.split("\n").length} lines)`);
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const client = new pg.Client(connectionConfig());
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query("SELECT count(*)::int AS n FROM projects");
  console.log(`loaded ${rows[0].n} projects`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
