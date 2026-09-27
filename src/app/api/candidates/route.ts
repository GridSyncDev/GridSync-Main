import { candidateOverlaps } from "@/lib/db";
import { overlapDefaults } from "@/lib/engine/config";

// GET /api/candidates: optional thresholds use engine/config.ts.
// Candidate pairs computed inside PostGIS (ST_DWithin on real geometries + daterange overlap).
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "DATABASE_URL not set" }, { status: 501 });
  const q = new URL(request.url).searchParams;
  const n = (k: string, d: number) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  const rows = await candidateOverlaps(
    n("maxMiles", overlapDefaults.maxMiles),
    n("maxGapMonths", overlapDefaults.maxGapMonths),
    n("regionMiles", overlapDefaults.regionMiles),
  );
  return Response.json({ source: "postgis", count: rows.length, candidates: rows });
}
