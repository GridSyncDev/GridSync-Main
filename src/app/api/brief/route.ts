import { brief } from "@/lib/brief";
import { loadDataset } from "@/lib/data";
import { overlapDefaults } from "@/lib/engine/config";
import { compare } from "@/lib/engine/overlap";

// POST { a, b, shifts?, maxMiles?, maxGapMonths?, regionMiles? } -> { text, source, score }
// The overlap is recomputed here from the data, so the client can't feed the model made-up numbers.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { a, b } = body as { a?: string; b?: string };
  const shifts: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.shifts ?? {})) if (Number.isFinite(Number(v))) shifts[k] = Number(v);

  const { projects, utilities } = await loadDataset();
  const pa = projects.find((p) => p.id === a);
  const pb = projects.find((p) => p.id === b);
  if (!pa || !pb) return Response.json({ error: "unknown project" }, { status: 404 });

  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const o = compare(pa, pb, {
    maxMiles: num(body.maxMiles, overlapDefaults.maxMiles),
    maxGapMonths: num(body.maxGapMonths, overlapDefaults.maxGapMonths),
    regionMiles: num(body.regionMiles, overlapDefaults.regionMiles),
    shifts,
    includeAffiliates: true,
  });
  if (!o) return Response.json({ error: "these projects are not flagged as overlapping" }, { status: 422 });

  const ua = utilities.find((u) => u.id === pa.utility)!;
  const ub = utilities.find((u) => u.id === pb.utility)!;
  const result = await brief(o, pa, pb, ua, ub, shifts);
  return Response.json({ ...result, score: o.scores.total });
}
