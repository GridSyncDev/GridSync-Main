import pg from "pg";
import { datasetSchema, type Dataset } from "./domain/schema";

// Postgres + PostGIS (Tiger Data). Only used when DATABASE_URL is set; see src/lib/data.ts.

// pg treats sslmode=require in the URL as verify-full, which rejects Tiger Cloud's certificate
// chain; drop it and keep the connection encrypted via the ssl option instead.
export function connectionConfig(url = process.env.DATABASE_URL ?? ""): pg.PoolConfig {
  const u = new URL(url);
  u.searchParams.delete("sslmode");
  return { connectionString: u.toString(), ssl: { rejectUnauthorized: false } };
}

let pool: pg.Pool | null = null;
function db(): pg.Pool {
  pool ??= new pg.Pool({ ...connectionConfig(), max: 3 });
  return pool;
}

const ym = "to_char(%s, 'YYYY-MM')";

export async function loadDatasetFromDb(): Promise<Dataset> {
  const utilities = await db().query(
    `SELECT id, name, kind, states, color, parent FROM utilities ORDER BY id`,
  );
  const projects = await db().query(`
    SELECT p.id, p.utility_id AS utility, p.name, p.type, p.voltage_kv AS "voltageKv", p.capacity_mw AS "capacityMw",
           ST_AsGeoJSON(p.geom::geometry, 6)::json AS geometry, p.location_precision AS "locationPrecision",
           json_build_object(
             'start', ${ym.replace("%s", "lower(p.construction)")},
             'end', ${ym.replace("%s", "upper(p.construction) - 1")},
             'precision', p.schedule_precision) AS construction,
           ${ym.replace("%s", "p.in_service")} AS "inService",
           p.status, p.description, p.county, p.state, p.resources,
           COALESCE((SELECT json_agg(json_strip_nulls(json_build_object(
               'url', s.url, 'title', s.title, 'publisher', s.publisher,
               'retrieved', to_char(s.retrieved, 'YYYY-MM-DD'), 'quote', s.quote, 'page', s.page)) ORDER BY s.id)
             FROM sources s WHERE s.project_id = p.id), '[]'::json) AS sources
    FROM projects p ORDER BY p.id`);

  const clean = (row: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== null || k === "voltageKv" || k === "inService"));
  return datasetSchema.parse({
    utilities: utilities.rows.map(clean),
    projects: projects.rows.map(clean),
  });
}

export interface Candidate {
  a: string;
  b: string;
  distance_miles: number;
  overlap_days: number;
}

/** Cross-utility pairs straight from PostGIS (ST_DWithin + daterange overlap). */
export async function candidateOverlaps(maxMiles: number, maxGapMonths: number, regionMiles: number): Promise<Candidate[]> {
  const { rows } = await db().query("SELECT * FROM candidate_overlaps($1, $2, $3)", [maxMiles, maxGapMonths, regionMiles]);
  return rows;
}
