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
`src/lib/engine/config.ts` is the single source for the exact sponsor kilometer
thresholds used by the engine, frontend, and PostGIS. These are frozen GridSync v1
planning heuristics, not universal industry constants. Distance query overrides are
ignored; callers may still scope utilities or shift schedules for a what-if analysis.

| param | default | meaning |
|---|---|---|
| `utilities` | all | comma-separated utility ids to compare |
| `shift` | none | what-if: `shift=<projectId>:<months>` (repeatable, negative = earlier) |

```ts
{
  params,
  count: number,
  overlaps: {
    id: string; a: string; b: string;              // project ids
    flags: ("spatial" | "temporal")[];
    kind: "sharing_opportunity";                    // compatibility key
    distanceMiles: number; distanceKm: number;
    overlapMonths: number; gapMonths: number;
    actualTimelineOverlap: boolean;
    immediatelySequential: boolean;
    mobilizationCompatible: boolean;
    geometriesIntersect: boolean;
    scheduleIsEstimated: boolean;
    families: { a: ProjectFamily[]; b: ProjectFamily[]; shared: ProjectFamily[] };
    sharedResources: string[];                      // descriptive, not scored
    scores: {
      points: number; maxPoints: 4;
      normalized: number;
      total: number;                                // normalized compatibility alias
      breakdown: Record<CoordinationPointKey, CoordinationPoint>;
    };
    reasons: string[];                              // plain-English, from the numbers
  }[]
}
```

## V1 candidate and geometry semantics

Generation projects remain in the dataset and map, but if either project type starts
with `generation_`, the engine returns no scored comparison. Other cross-utility
pairs must be within **40 km inclusive** by the shortest distance between their stored
project geometries. A pair above 40 km is excluded regardless of schedule. Same-utility
and affiliate rules are unchanged. A geographically eligible pair may receive zero
points; schedule compatibility affects only the points whose rules require it.

`gapMonths()` counts whole months strictly between inclusive construction windows.
For example, a February end followed by a March start has gap 0 and is immediately
sequential. It can support logistics or mobilization points, but is **not** labeled
as an overlapping construction window. `actualTimelineOverlap` is true only when
`overlapMonths > 0`; `mobilizationCompatible` is actual overlap or immediate sequence.

Verified in `src/lib/engine/geo.ts`: `distanceMiles()` uses closest-point distance
between Points/LineStrings, **not center-to-center distance**. Point-to-Point uses
haversine distance. When a LineString is involved, all vertices are projected to
a local plane in miles; the function checks every segment pair for intersections
and takes the minimum endpoint-to-segment distance, including segment interiors.
Crossing or touching lines have distance 0. This is a local planar approximation
for line distances, not an exact geodesic line-distance calculation. It measures
the supplied geometry, whose real-world precision remains governed by
`locationPrecision`. Map anchors and camera centers are display helpers and do
not drive candidate discovery. PostGIS uses `ST_DWithin`/`ST_Distance` on the stored
geographies, likewise not centroids.

## Scoring (explainable, no ML)

The raw score is the sum of four deterministic points, so it is always an integer
from 0 through 4. `scores.total` and `scores.normalized` are the compatibility display
value `round(points / 4 * 100)`; ranking uses raw points, never percentage weights.

1. **Crossing/outage:** +1 when project geometries touch/cross and construction
   windows actually overlap.
2. **ROW/access/permitting:** +1 when closest-point distance is strictly under 1.6 km.
3. **Site logistics:** +1 when distance is strictly under 8 km and schedules overlap
   or are immediately sequential. Project families need not match.
4. **Crews/equipment:** +1 when distance is strictly under 40 km, schedules overlap
   or are immediately sequential, and the project-family sets intersect.

Transmission line new/upgrade projects belong to `transmission`; substation
new/upgrade projects belong to `substation`. The representation is a set so a
future project type may support multiple families. Voltage class, resource Jaccard,
scarcity, heavy haul, continuous spatial values, and temporal percentages do not
affect scoring or ranking. Resource tags remain descriptive canonical metadata.

Ties resolve by raw score descending, closest-point distance ascending, actual
timeline overlap strength, then stable pair id. Explanations identify estimated
construction windows whenever an earned point depends on schedule compatibility.

The LLM never produces these numbers. Gemini (Tier 5) may only extract fields from documents (validated by the schema) and phrase explanations using numbers from the engine.

## Database

Postgres + PostGIS on Tiger Data (MLH prize, and Sperry's stack). `db/schema.sql`
mirrors the contract and has `candidate_overlaps(max_km)` using `ST_DWithin` on real
geometries, excluding generation before TypeScript scoring. The application supplies
the exact 40 km value from the shared config, so SQL does not duplicate a default.
Reapplying the schema transactionally replaces only the function and does not reload
project data. Existing direct SQL clients must migrate from the former three-argument
signature and retain custom function grants during deployment.
