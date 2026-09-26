# GridSync

**Compare utilities' public construction plans and flag where their work overlaps**: physically close, scheduled around the same time, and drawing on the same crews, equipment and materials. Built at ShellHacks 2026 for the Sperry Tech challenge.

FERC Order 1920 (2024) requires neighboring transmission planning regions to share plans and look for more efficient joint solutions, because utilities have historically planned in isolation. GridSync turns separately published plans into one map, one timeline and a ranked list of coordination opportunities, each traceable to its source document.

## Run locally

Requires Node 24+ (and Python 3.9+ for ingestion).

```bash
npm install
npm run dev          # http://localhost:3000  (API: /api/projects, /api/overlaps)
npm test
```

Refresh the EIA data:
```bash
pip install -r ingest/requirements.txt
npm run ingest:eia
```

## Code map

| Piece | Where |
|---|---|
| Shared contract (zod) | `src/lib/domain/schema.ts`, explained in `docs/CONTRACT.md` |
| Resource ontology (EE) | `src/lib/domain/resources.ts` |
| Overlap engine + tests | `src/lib/engine/` (`geo.ts`, `time.ts`, `overlap.ts`) |
| Data loader | `src/lib/data.ts` → `data/projects/*.json` |
| Ingestion | `ingest/` (`eia860m.py`: EIA-860M planned generators, FL/GA/SC/NC/AL utilities) |
| API | `src/app/api/projects`, `src/app/api/overlaps` |
| Database (Postgres + PostGIS) | `db/schema.sql` |

## Data sources
- U.S. EIA-860M, *Preliminary Monthly Electric Generator Inventory* (July 2026): planned generators with coordinates, planned operation month and status.
- Utility and regulator filings (curated in `data/projects/`): see each project's `sources`.
