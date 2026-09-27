import { loadDataset } from "@/lib/data";
import { overlapDefaults } from "@/lib/engine/config";
import { findOverlaps, type OverlapParams } from "@/lib/engine/overlap";

// Optional thresholds use engine/config.ts; shift=<projectId>:<months>&utilities=a,b.
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
    maxMiles: num("maxMiles", overlapDefaults.maxMiles),
    maxGapMonths: num("maxGapMonths", overlapDefaults.maxGapMonths),
    regionMiles: num("regionMiles", overlapDefaults.regionMiles),
    shifts,
  };

  const { projects } = await loadDataset();
  const only = q.get("utilities")?.split(",").filter(Boolean);
  const scoped = only?.length ? projects.filter((p) => only.includes(p.utility)) : projects;
  const overlaps = findOverlaps(scoped, params);
  return Response.json({ params, count: overlaps.length, overlaps });
}
