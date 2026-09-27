import { loadDataset } from "@/lib/data";
import { defaultParams, findOverlaps, type OverlapParams } from "@/lib/engine/overlap";

// GET /api/overlaps?maxMiles=50&maxGapMonths=6&regionMiles=250&shift=<projectId>:<months>&utilities=a,b
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const num = (k: string, d: number) => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) ? v : d;
  };
  const shifts: Record<string, number> = {};
  for (const s of q.getAll("shift")) {
    const [id, months] = s.split(":");
    if (id && Number.isFinite(Number(months))) shifts[id] = Number(months);
  }
  const params: OverlapParams = {
    maxMiles: num("maxMiles", defaultParams.maxMiles),
    maxGapMonths: num("maxGapMonths", defaultParams.maxGapMonths),
    regionMiles: num("regionMiles", defaultParams.regionMiles),
    shifts,
  };

  const { projects } = await loadDataset();
  const only = q.get("utilities")?.split(",").filter(Boolean);
  const scoped = only?.length ? projects.filter((p) => only.includes(p.utility)) : projects;
  const overlaps = findOverlaps(scoped, params);
  return Response.json({ params, count: overlaps.length, overlaps });
}
