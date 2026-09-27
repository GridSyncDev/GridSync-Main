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

-- Candidate overlaps straight from the database: eligible cross-utility,
-- non-generation pairs inside the frozen geographic gate. ST_DWithin evaluates
-- the stored geometries (lines included), not centers or centroids. Scoring and
-- schedule compatibility remain in src/lib/engine/overlap.ts.
-- SQL owns no threshold default; the application passes the canonical kilometer value.
-- Replace only this function transactionally; no table data is changed.
BEGIN;
DROP FUNCTION IF EXISTS candidate_overlaps(real, integer, real);
DROP FUNCTION IF EXISTS candidate_overlaps(real);
CREATE FUNCTION candidate_overlaps(max_km real)
RETURNS TABLE (a text, b text, distance_miles real, overlap_days int) LANGUAGE sql STABLE AS $$
  SELECT p.id, q.id,
         (ST_Distance(p.geom, q.geom) / 1609.344)::real,
         GREATEST(0, upper(p.construction * q.construction) - lower(p.construction * q.construction))::int
  FROM projects p
  JOIN projects q ON p.id < q.id AND p.utility_id <> q.utility_id
  WHERE p.type NOT LIKE 'generation\_%' ESCAPE '\'
    AND q.type NOT LIKE 'generation\_%' ESCAPE '\'
    AND ST_DWithin(p.geom, q.geom, max_km * 1000)
$$;
COMMIT;
