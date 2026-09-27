import type { Geometry } from "../domain/schema";

type Point = readonly [number, number];

const cross = (origin: Point, a: Point, b: Point) =>
  (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  return (
    cross(start, end, point) === 0 &&
    point[0] >= Math.min(start[0], end[0]) &&
    point[0] <= Math.max(start[0], end[0]) &&
    point[1] >= Math.min(start[1], end[1]) &&
    point[1] <= Math.max(start[1], end[1])
  );
}

function segmentsTouchOrCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) {
    return true;
  }
  return (
    (abC === 0 && pointOnSegment(c, a, b)) ||
    (abD === 0 && pointOnSegment(d, a, b)) ||
    (cdA === 0 && pointOnSegment(a, c, d)) ||
    (cdB === 0 && pointOnSegment(b, c, d))
  );
}

const segments = (geometry: Geometry): readonly (readonly [Point, Point])[] => {
  if (geometry.type === "Point") return [[geometry.coordinates, geometry.coordinates]];
  return geometry.coordinates.slice(1).map((point, index) => [geometry.coordinates[index], point] as const);
};

/** Topological intersection test. It does not infer intersection from a small distance. */
export function geometriesTouchOrCross(a: Geometry, b: Geometry): boolean {
  return segments(a).some(([aStart, aEnd]) =>
    segments(b).some(([bStart, bEnd]) => segmentsTouchOrCross(aStart, aEnd, bStart, bEnd)),
  );
}
