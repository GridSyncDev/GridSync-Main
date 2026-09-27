import type { Project } from "../domain/schema";
import { resourcesFor, scarceResources, voltageClass } from "../domain/resources";
import { distanceMiles } from "./geo";
import { addMonths, durationMonths, gapMonths, overlapMonths, type Interval } from "./time";

// Deterministic, explainable overlap scoring. No LLM touches these numbers.

export interface OverlapParams {
  /** Projects within this distance are "physically close". */
  maxMiles: number;
  /** Windows this many months apart (or less) count as "around the same time". */
  maxGapMonths: number;
  /** A time-only overlap is flagged only inside this radius (same regional labor/equipment market). */
  regionMiles: number;
  /** What-if: months to shift a project's construction window, by project id. */
  shifts?: Record<string, number>;
  /** Utility id -> holding company. Sister utilities are skipped unless includeAffiliates. */
  parents?: Record<string, string | undefined>;
  includeAffiliates?: boolean;
}

export const defaultParams: OverlapParams = { maxMiles: 50, maxGapMonths: 6, regionMiles: 250 };

export const weights = { spatial: 0.35, temporal: 0.3, resource: 0.25, asset: 0.1 } as const;

export interface Overlap {
  id: string;
  a: string; // project id
  b: string;
  flags: ("spatial" | "temporal")[];
  /** The Sperry case: neighboring utilities in different states. */
  crossesStateLine: boolean;
  kind: "sharing_opportunity" | "collision_risk";
  distanceMiles: number;
  overlapMonths: number;
  gapMonths: number;
  sharedResources: string[];
  scarceShared: string[];
  scores: { spatial: number; temporal: number; resource: number; asset: number; total: number };
  reasons: string[];
}

export function windowOf(p: Project, shifts?: Record<string, number>): Interval {
  const s = shifts?.[p.id] ?? 0;
  return { start: addMonths(p.construction.start, s), end: addMonths(p.construction.end, s) };
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function compare(a: Project, b: Project, params: OverlapParams = defaultParams): Overlap | null {
  if (a.utility === b.utility) return null;
  const pa = params.parents?.[a.utility];
  if (!params.includeAffiliates && pa && pa === params.parents?.[b.utility]) return null;

  const dist = distanceMiles(a.geometry, b.geometry);
  const wa = windowOf(a, params.shifts);
  const wb = windowOf(b, params.shifts);
  const overlap = overlapMonths(wa, wb);
  const gap = gapMonths(wa, wb);

  const close = dist <= params.maxMiles;
  const sameTime = gap <= params.maxGapMonths && dist <= params.regionMiles;
  if (!close && !sameTime) return null;

  const ra = resourcesFor(a);
  const rb = resourcesFor(b);
  const shared = ra.filter((r) => rb.includes(r));
  const union = new Set([...ra, ...rb]);
  const scarceShared = shared.filter((r) => scarceResources.has(r));

  // Spatial: 1 at 0 mi, 0 at the region edge.
  const spatial = clamp01(1 - dist / params.regionMiles);
  // Temporal: share of the shorter window that overlaps; if apart, decays to 0 at 2× maxGap.
  const temporal =
    overlap > 0
      ? overlap / Math.min(durationMonths(wa), durationMonths(wb))
      : 0.5 * clamp01(1 - gap / (2 * Math.max(1, params.maxGapMonths)));
  const resource = union.size ? shared.length / union.size : 0;
  const va = voltageClass(a.voltageKv);
  const vb = voltageClass(b.voltageKv);
  const asset = va === null || vb === null ? 0.5 : va === vb ? 1 : 0.3;

  const total =
    weights.spatial * spatial + weights.temporal * temporal + weights.resource * resource + weights.asset * asset;

  const flags: Overlap["flags"] = [];
  if (close) flags.push("spatial");
  if (sameTime) flags.push("temporal");

  const reasons: string[] = [];
  reasons.push(close ? `${round(dist)} mi apart (within ${params.maxMiles} mi)` : `${round(dist)} mi apart, same regional market`);
  reasons.push(
    overlap > 0 ? `construction windows overlap by ${overlap} months` : `construction windows are ${gap} months apart`,
  );
  if (shared.length) reasons.push(`both need ${shared.length} of the same resource types`);
  if (a.state !== b.state) reasons.push(`crosses the ${a.state}–${b.state} state line: separate planning processes`);
  if (scarceShared.length) reasons.push(`both draw on constrained resources: ${scarceShared.join(", ")}`);

  return {
    id: [a.id, b.id].sort().join("__"),
    a: a.id,
    b: b.id,
    flags,
    crossesStateLine: a.state !== b.state,
    kind: scarceShared.length && overlap > 0 ? "collision_risk" : "sharing_opportunity",
    distanceMiles: round(dist),
    overlapMonths: overlap,
    gapMonths: gap,
    sharedResources: shared,
    scarceShared,
    scores: {
      spatial: Math.round(spatial * 100),
      temporal: Math.round(temporal * 100),
      resource: Math.round(resource * 100),
      asset: Math.round(asset * 100),
      total: Math.round(total * 100),
    },
    reasons,
  };
}

/** All cross-utility overlaps, highest score first. O(n²) — fine for a few thousand projects. */
export function findOverlaps(projects: Project[], params: OverlapParams = defaultParams): Overlap[] {
  const out: Overlap[] = [];
  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const o = compare(projects[i], projects[j], params);
      if (o) out.push(o);
    }
  }
  return out.sort((x, y) => y.scores.total - x.scores.total);
}
