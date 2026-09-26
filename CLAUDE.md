@AGENTS.md

# Project context for Claude

- GridSync, ShellHacks 2026, Sperry Tech challenge. Team of 4. Devpost closes Sun 9/27 11:00 AM ET; code freeze 9:30 AM. Video is 1–2 minutes max.
- MVP first (no feature creep until all six work): real plans from 2+ utilities → one schema → map → timeline → automatic spatial + temporal overlaps → click an overlap for an explainable analysis with source links. Then: resource compatibility, scoring, what-if scheduling, AI ingestion.
- `src/lib/domain/schema.ts` is the shared contract (`docs/CONTRACT.md`). Don't change it without flagging it to the team.
- Numbers on screen come from the deterministic engine (`src/lib/engine`), never from an LLM. LLM output (extraction) must validate against the schema; missing values stay missing.
- Every project needs a source URL. Don't invent coordinates or dates; mark approximations with `locationPrecision`/`construction.precision`.
- Work on feature branches and open PRs to `main` in GridSyncDev/GridSync-Main.
- Before pushing: `npm test && npm run typecheck && npm run lint && npm run build`.
- Stack: Next.js 16 App Router, Tailwind 4, zod 4, react-leaflet; Python/pandas for ingestion; Postgres + PostGIS (Tiger Data) planned.
