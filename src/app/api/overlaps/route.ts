import { loadDataset } from "@/lib/data";
import { coordinationThresholdsKm, overlapDefaults } from "@/lib/engine/config";
import { findOverlaps, type OverlapParams } from "@/lib/engine/overlap";

// The rubric is frozen; shift=<projectId>:<months>&utilities=a,b are the supported controls.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const shifts: Record<string, number> = {};
  for (const s of q.getAll("shift")) {
    const [id, months] = s.split(":");
    if (id && Number.isFinite(Number(months))) shifts[id] = Number(months);
  }
  const params: OverlapParams = {
    ...overlapDefaults,
    shifts,
  };

  const { projects } = await loadDataset();
  const only = q.get("utilities")?.split(",").filter(Boolean);
  const scoped = only?.length ? projects.filter((p) => only.includes(p.utility)) : projects;
  const overlaps = findOverlaps(scoped, params);
  return Response.json({ params, thresholdsKm: coordinationThresholdsKm, count: overlaps.length, overlaps });
}
