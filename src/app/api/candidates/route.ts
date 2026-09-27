import { candidateOverlaps } from "@/lib/db";

// GET /api/candidates?maxMiles=25&maxGapMonths=6&regionMiles=75
// Candidate pairs computed inside PostGIS (ST_DWithin on real geometries + daterange overlap).
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "DATABASE_URL not set" }, { status: 501 });
  const q = new URL(request.url).searchParams;
  const n = (k: string, d: number) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  const rows = await candidateOverlaps(n("maxMiles", 25), n("maxGapMonths", 6), n("regionMiles", 75));
  return Response.json({ source: "postgis", count: rows.length, candidates: rows });
}
