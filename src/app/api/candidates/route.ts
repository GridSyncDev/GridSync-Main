import { candidateOverlaps } from "@/lib/db";
import { coordinationThresholdsKm } from "@/lib/engine/config";

// Candidate pairs use the frozen 40 km gate on real PostGIS geometries.
export async function GET(_request: Request) {
  void _request;
  if (!process.env.DATABASE_URL) return Response.json({ error: "DATABASE_URL not set" }, { status: 501 });
  const rows = await candidateOverlaps();
  return Response.json({ source: "postgis", thresholdKm: coordinationThresholdsKm.candidate, count: rows.length, candidates: rows });
}
