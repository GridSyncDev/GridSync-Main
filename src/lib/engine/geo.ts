import type { Geometry } from "../domain/schema";

type LonLat = readonly [number, number];

const EARTH_RADIUS_MI = 3958.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMiles(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}

// Project to a local plane (miles) around a reference latitude. Accurate to well under 1%
// over the tens of miles we care about.
function toPlane(p: LonLat, refLat: number): [number, number] {
  const milesPerDegLat = (Math.PI / 180) * EARTH_RADIUS_MI;
  return [p[0] * milesPerDegLat * Math.cos(rad(refLat)), p[1] * milesPerDegLat];
}

function pointSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function segmentsIntersect(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const cross = (o: [number, number], p: [number, number], q: [number, number]) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function vertices(g: Geometry): LonLat[] {
  return g.type === "Point" ? [g.coordinates] : g.coordinates;
}

/** Shortest distance in miles between two points/lines (0 if two lines cross). */
export function distanceMiles(a: Geometry, b: Geometry): number {
  if (a.type === "Point" && b.type === "Point") return haversineMiles(a.coordinates, b.coordinates);

  const all = [...vertices(a), ...vertices(b)];
  const refLat = all.reduce((s, p) => s + p[1], 0) / all.length;
  const pa = vertices(a).map((p) => toPlane(p, refLat));
  const pb = vertices(b).map((p) => toPlane(p, refLat));
  const segs = (pts: [number, number][]) => (pts.length === 1 ? [[pts[0], pts[0]] as const] : pts.slice(1).map((p, i) => [pts[i], p] as const));
  const sa = segs(pa);
  const sb = segs(pb);

  let best = Infinity;
  for (const [a1, a2] of sa) {
    for (const [b1, b2] of sb) {
      if (segmentsIntersect(a1, a2, b1, b2)) return 0;
      best = Math.min(best, pointSegment(a1, b1, b2), pointSegment(a2, b1, b2), pointSegment(b1, a1, a2), pointSegment(b2, a1, a2));
    }
  }
  return best;
}
