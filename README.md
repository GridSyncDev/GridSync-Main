# GridSync 

**Compare utilities' public construction plans and identify coordination opportunities** using closest-point geography, schedule relationships, and a deterministic four-point rubric. Built at ShellHacks 2026 for the Sperry Tech challenge.

**Live:** https://beforewebuildlets.compare

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
Each source links to the original document; the normalized records and the scripts that produced them are in this repo.

- **SERTP 2026 Preliminary Transmission Expansion Plan** ([PDF](https://www.southeasternrtp.com/docs/general/2026/2026_SERTP_Preliminary_Expansion_Plan_Report_(Non-CEII).pdf)): 235 of 426 projects geocoded (substation names matched to OpenStreetMap within each balancing area's states). Parser: [`ingest/sertp.py`](https://github.com/GridSyncDev/GridSync-Main/blob/main/ingest/sertp.py) → [`data/projects/sertp.json`](https://github.com/GridSyncDev/GridSync-Main/blob/main/data/projects/sertp.json).
- **FPL 2026 Ten-Year Site Plan** ([PDF](https://www.floridapsc.com/pscfiles/website-files/PDF/Utilities/Electricgas/TenYearSitePlans/2026/Florida%20Power%20and%20Light%20Company.pdf), Table III.E.1) and **FDEP siting record** ([TA26-21](https://floridadep.gov/water/siting-coordination-office/content/fpl-andytown-oasis-500kv-transmission-line-project)) for Andytown–Oasis; route georeferenced from [FPL's corridor map](https://www.fpl.com/content/dam/fplgp/us/en/reliability/pdf/andytown-oasis-preliminary-preferred-corridor.pdf). Curated in [`data/projects/curated.json`](https://github.com/GridSyncDev/GridSync-Main/blob/main/data/projects/curated.json), like the three items below.
- **City of Homestead / HPS**: [Donnie substation bid 202310](https://www.homesteadfl.gov/bids.aspx?bidID=300) and the [Renaissance second interconnection](https://www.southdadenewsleader.com/news/homestead-reviews-infrastructure-utility-and-budget-items/article_dfb49f20-4897-423b-8a2a-42f8634d1d74.html) (South Dade News Leader, Aug 21, 2026).
- **Georgia Power / Southern Company**: [South McIntosh 500 kV interconnection request](https://www.interconnection.fyi/project/southern-company-26-ic-1413), [Plant McIntosh expansion](https://www.effinghamherald.net/data-centers/friday-public-hearing-to-address-data-center-power-plant-expansion-plant-mcintosh-georgia-power-openai-project-camellia/), [Effingham 500 kV substation](https://www.statesboroherald.com/local/southeast-georgia-power-grid-projects-helping-fuel-data-center-development/). **Dominion Energy SC**: [Jasper–Okatie–Sherwood](https://www.dominionenergy.com/about/delivering-energy/electric-projects/power-line-projects/jasper-okatie-sherwood).
- **U.S. EIA-860M** ([July 2026 workbook](https://www.eia.gov/electricity/data/eia860m/archive/xls/july_generator2026.xlsx)): planned generators with coordinates, planned month and status. Parser: [`ingest/eia860m.py`](https://github.com/GridSyncDev/GridSync-Main/blob/main/ingest/eia860m.py) → [`data/projects/eia860m.json`](https://github.com/GridSyncDev/GridSync-Main/blob/main/data/projects/eia860m.json).
- **Substation locations**: [OpenStreetMap](https://www.openstreetmap.org/) (ODbL), queried through the Overpass API by `ingest/sertp.py`. **State boundaries**: [PublicaMundi us-states.json](https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json).
- Every project carries its source links and, where available, the quoted sentence its numbers came from.
