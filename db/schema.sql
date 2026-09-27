-- GridSync on Postgres + PostGIS (Tiger Data / Tiger Cloud).
-- Mirrors src/lib/domain/schema.ts. Load with `npm run db:load` (TODO) once DATABASE_URL is set.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS utilities (
  id     text PRIMARY KEY,
  name   text NOT NULL,
  kind   text NOT NULL,
  states text[] NOT NULL,
  color  text NOT NULL,
  parent text            -- holding company (sister utilities aren't flagged)
);

CREATE TABLE IF NOT EXISTS projects (
  id                  text PRIMARY KEY,
  utility_id          text NOT NULL REFERENCES utilities(id),
  name                text NOT NULL,
  type                text NOT NULL,
  voltage_kv          real,
  capacity_mw         real,
  geom                geography(Geometry, 4326) NOT NULL,
  location_precision  text NOT NULL,
  construction        daterange NOT NULL,          -- [first day of start month, first day after end month)
  schedule_precision  text NOT NULL,               -- published | estimated
  in_service          date,
  status              text NOT NULL,
  description         text NOT NULL,
  county              text,
  state               char(2) NOT NULL,
  resources           text[]
);
CREATE INDEX IF NOT EXISTS projects_geom_idx ON projects USING gist (geom);
CREATE INDEX IF NOT EXISTS projects_construction_idx ON projects USING gist (construction);

-- Provenance: every number on screen traces back to a document.
CREATE TABLE IF NOT EXISTS sources (
  id         bigserial PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url        text NOT NULL,
  title      text NOT NULL,
  publisher  text,
  retrieved  date,
  quote      text,
  page       int
);

-- Candidate overlaps straight from the database: cross-utility pairs that are
-- physically close (ST_DWithin on the real geometries, lines included) or scheduled
-- around the same time. Scoring stays in src/lib/engine/overlap.ts so the what-if
-- slider can re-score instantly in the browser.
-- SQL owns no threshold defaults; application callers pass all three from engine/config.ts.
-- PostgreSQL requires replacement to remove existing parameter defaults.
-- Replace only this function transactionally; no table data is changed.
BEGIN;
DROP FUNCTION IF EXISTS candidate_overlaps(real, integer, real);
CREATE FUNCTION candidate_overlaps(max_miles real, max_gap_months int, region_miles real)
RETURNS TABLE (a text, b text, distance_miles real, overlap_days int) LANGUAGE sql STABLE AS $$
  SELECT p.id, q.id,
         (ST_Distance(p.geom, q.geom) / 1609.344)::real,
         GREATEST(0, upper(p.construction * q.construction) - lower(p.construction * q.construction))::int
  FROM projects p
  JOIN projects q ON p.id < q.id AND p.utility_id <> q.utility_id
  WHERE ST_DWithin(p.geom, q.geom, max_miles * 1609.344)
     OR (ST_DWithin(p.geom, q.geom, region_miles * 1609.344)
         AND daterange((lower(p.construction) - make_interval(months => max_gap_months))::date, (upper(p.construction) + make_interval(months => max_gap_months))::date) && q.construction)
$$;
COMMIT;
