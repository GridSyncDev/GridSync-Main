# GridSync

**Compare utilities' public construction plans and flag where their work overlaps**: physically close, scheduled around the same time, and drawing on the same crews, equipment and materials. Built at ShellHacks 2026 for the Sperry Tech challenge.

**Live:** https://gridsync-qp6kd.ondigitalocean.app

FERC Order 1920 (2024) requires neighboring transmission planning regions to share plans and look for more efficient joint solutions, because utilities have historically planned in isolation. GridSync turns separately published plans into one map, one timeline and a ranked list of coordination opportunities, each traceable to its source document.

## Run locally

Requires Node 24+ (and Python 3.9+ for ingestion).

```bash
npm install
npm run dev          # http://localhost:3000  (API: /api/projects, /api/overlaps)
npm test
```

Use the Tiger Data database (Postgres + PostGIS) instead of the JSON files:
```bash
echo 'DATABASE_URL=postgresql://tsdbadmin:<password>@o8z1mn3qkd.b3xc50j5z1.tsdb.cloud.timescale.com:39860/tsdb?sslmode=require' >> .env.local
psql "$DATABASE_URL" -f db/schema.sql   # once
npm run db:load                          # reload after data changes
```
The header shows "● Tiger Data · PostGIS" when the app is reading from the database; `/api/candidates` runs the overlap search inside PostGIS.

Refresh the source data:
```bash
pip install -r ingest/requirements.txt pypdf
npm run ingest:eia            # EIA-860M planned generators
python3 ingest/sertp.py       # SERTP 2026 regional transmission plan (PDF → projects, OSM geocoding)
```

## Code map

| Piece | Where |
|---|---|
| Shared contract (zod) | `src/lib/domain/schema.ts`, explained in `docs/CONTRACT.md` |
| Resource ontology (EE) | `src/lib/domain/resources.ts` |
| Overlap engine + tests | `src/lib/engine/` (`geo.ts`, `time.ts`, `overlap.ts`) |
| Data loader | `src/lib/data.ts` → `data/projects/*.json` |
| Ingestion | `ingest/` (`sertp.py`: SERTP 2026 transmission plan PDF; `eia860m.py`: EIA-860M planned generators) |
| Curated demo cases | `data/projects/curated.json` (South Dade HPS vs FPL; Savannah River Georgia Power vs Dominion SC) |
| UI | `src/components/` (`MapView` deck.gl map, `Timeline`, `OverlapDetail` with what-if, `Brief` Gemini + ElevenLabs) |
| API | `src/app/api/projects`, `src/app/api/overlaps` |
| Database (Tiger Data Postgres + PostGIS) | `db/schema.sql`, `db/load.ts`, `src/lib/db.ts`, `/api/candidates` |

## Data sources
- **SERTP 2026 Preliminary Transmission Expansion Plan** (Southeastern Regional Transmission Planning): 235 of 426 projects geocoded (substation names matched to OpenStreetMap within each balancing area's states).
- **FPL 2026 Ten-Year Site Plan** (Table III.E.1) and **FDEP siting record** for Andytown–Oasis; route georeferenced from FPL's corridor map.
- **City of Homestead / HPS** bids and council actions (Donnie substation, Renaissance second interconnection).
- **Georgia Power / Southern Company** interconnection queue and Plant McIntosh filings; **Dominion Energy SC** Jasper–Okatie–Sherwood project page.
- **U.S. EIA-860M** (July 2026): planned generators with coordinates, planned month and status.
- Every project carries its source links and, where available, the quoted sentence its numbers came from.
