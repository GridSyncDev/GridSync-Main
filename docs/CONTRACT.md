# GridSync contract

Everyone codes against this. If you need to change it, say so in the team chat first; the schema in `src/lib/domain/schema.ts` is the source of truth and this doc explains it.

## Pipeline

```
public plan (PDF / web page / EIA survey)
  → ingest/*  (Python or TS; writes data/projects/<source>.json)
  → src/lib/data.ts  (merges + validates every file with zod; bad data fails loudly)
  → src/lib/engine/overlap.ts  (distance, schedule overlap, shared resources, score)
  → /api/projects, /api/overlaps
  → map + timeline + overlap detail (with source links)
```

## Data files: `data/projects/*.json`

Each file is `{ "utilities": Utility[], "projects": Project[] }`. Files are merged, so a curated file can reuse utility ids from another file (e.g. `florida-power-light-co`).

A curated project looks like this. Every field is required unless marked optional:

```json
{
  "id": "hps-donnie-avocado-substation",
  "utility": "homestead-public-services",
  "name": "Donnie Avocado 138/13.2 kV Substation",
  "type": "substation_new",
  "voltageKv": 138,
  "capacityMw": null,
  "geometry": { "type": "Point", "coordinates": [-80.47, 25.47] },
  "locationPrecision": "approximate",
  "construction": { "start": "2026-01", "end": "2027-06", "precision": "estimated" },
  "inService": "2027-06",
  "status": "approved",
  "description": "New ~89 MVA substation for growth in Homestead (design-build bid 202310).",
  "county": "Miami-Dade",
  "state": "FL",
  "sources": [
    {
      "url": "https://www.cityofhomestead.com/bids.aspx?bidID=300",
      "title": "202310 Design-Build Services for Donnie Avocado Substation",
      "publisher": "City of Homestead",
      "retrieved": "2026-09-26",
      "quote": "exact sentence the numbers came from"
    }
  ]
}
```

(The coordinates and dates above are placeholders showing the shape. Look up the real values before committing.)

Rules:
- **Coordinates are `[longitude, latitude]`** (GeoJSON order). Miami is `[-80.19, 25.76]`.
- Transmission lines are `LineString`s with at least two points (endpoints, or a rough route sketch → `locationPrecision: "approximate"`).
- Months are `"YYYY-MM"`. `construction` is the build window, not the in-service date. If the document only gives an in-service date, estimate the start and set `precision: "estimated"`.
- Every project needs at least one source URL. Put the exact sentence in `quote` when you can: that's our provenance story.
- `type` is one of: `transmission_line_new`, `transmission_line_upgrade`, `substation_new`, `substation_upgrade`, `generation_solar`, `generation_storage`, `generation_gas`, `generation_other`, `distribution`, `other`.
- `status` is one of: `planned`, `permitting`, `approved`, `under_construction`.

Run `npm test` after adding data. The loader validates every file.

## API

### `GET /api/projects`
```ts
{ utilities: Utility[], projects: (Project & { resources: string[] })[] }
```
`resources` is filled from the resource matrix (`src/lib/domain/resources.ts`).

### `GET /api/overlaps`
Query params (all optional). `src/lib/engine/config.ts` is the authoritative source
for startup defaults in the engine, frontend, and `/api/overlaps`, `/api/candidates`,
and `/api/brief`. These preserve the existing frontend defaults; explicit overrides still apply.

| param | default | meaning |
|---|---|---|
| `maxMiles` | 25 | pairs within this distance are flagged `spatial` |
| `maxGapMonths` | 6 | windows this close (or overlapping) are flagged `temporal` |
| `regionMiles` | 75 | time-only flags must still be within this radius |
| `utilities` | all | comma-separated utility ids to compare |
| `shift` | none | what-if: `shift=<projectId>:<months>` (repeatable, negative = earlier) |

```ts
{
  params,
  count: number,
  overlaps: {
    id: string; a: string; b: string;              // project ids
    flags: ("spatial" | "temporal")[];
    kind: "sharing_opportunity" | "collision_risk";
    distanceMiles: number; overlapMonths: number; gapMonths: number;
    sharedResources: string[]; scarceShared: string[];
    scores: { spatial, temporal, resource, asset, total };  // 0–100
    reasons: string[];                              // plain-English, from the numbers
  }[]
}
```

## Scoring (explainable, no ML)

`total = 0.35·spatial + 0.30·temporal + 0.25·resource + 0.10·asset`

- **spatial**: 1 at 0 mi → 0 at `regionMiles`
- **temporal**: share of the shorter window that overlaps; if the windows don't overlap, it decays from 0.5 to 0 at 2×`maxGapMonths`
- **resource**: Jaccard overlap of resource tags
- **asset**: same voltage class 1, different 0.3, unknown 0.5
- **kind**: `collision_risk` when the windows overlap and both need a scarce resource (large power transformers, HV breakers, EHV crews, heavy haul), otherwise `sharing_opportunity`. The internal key remains compatible; user-facing text says **potential resource contention**. Shared resource types suggest potential competition and coordination opportunities, not confirmed shortages or delays.

The LLM never produces these numbers. Gemini (Tier 5) may only extract fields from documents (validated by the schema) and phrase explanations using numbers from the engine.

## Database

Postgres + PostGIS on Tiger Data (MLH prize, and Sperry's stack). `db/schema.sql` mirrors the contract and has a `candidate_overlaps()` function using `ST_DWithin` on real geometries and `daterange` overlap. Until `DATABASE_URL` is set, the app reads the JSON files, so nothing is blocked on the DB.

SQL callers must pass all three thresholds explicitly. The application supplies
them from the shared config (or user overrides), so SQL does not duplicate numeric
defaults. Reapplying `db/schema.sql` transactionally replaces only this function to
remove its old parameter defaults; it does not reload project data. Existing direct
SQL integrations must pass all three arguments and retain any custom function
grants when deploying this schema change.
