import { z } from "zod";
import { projectSchema, type Project } from "../domain/schema";
import type { GroundedDraft } from "./grounding";
import type { SourceInput } from "./schema";

export const reviewSchema = z.object({
  humanReviewed: z.literal(true),
  utility: z.string(),
  id: z.string(),
  name: z.string(),
  type: z.string(),
  voltageKv: z.string(),
  capacityMw: z.string(),
  state: z.string(),
  county: z.string(),
  status: z.string(),
  description: z.string(),
  longitude: z.string(),
  latitude: z.string(),
  locationPrecision: z.string(),
  constructionStart: z.string(),
  constructionEnd: z.string(),
  constructionPrecision: z.string(),
  inService: z.string(),
  sourceUrl: z.string(),
  sourceTitle: z.string(),
  sourcePublisher: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;

export function initialReview(draft: GroundedDraft, source: SourceInput): Review {
  const text = (key: "name" | "type" | "state" | "county" | "status" | "description") =>
    draft[key].evidence === "quote_found" ? draft[key].value ?? "" : "";
  const month = (key: "constructionStart" | "constructionEnd" | "inService") => {
    const raw = draft[key].evidence === "quote_found" ? draft[key].value : null;
    return typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : "";
  };
  const point = draft.coordinates.evidence === "quote_found" ? draft.coordinates.value : null;
  return {
    humanReviewed: true,
    utility: source.utility,
    id: "",
    name: text("name"),
    type: text("type"),
    voltageKv: draft.voltageKv.evidence === "quote_found" ? draft.voltageKv.value?.toString() ?? "" : "",
    capacityMw: draft.capacityMw.evidence === "quote_found" ? draft.capacityMw.value?.toString() ?? "" : "",
    state: text("state"),
    county: text("county"),
    status: text("status"),
    description: text("description"),
    longitude: point?.longitude.toString() ?? "",
    latitude: point?.latitude.toString() ?? "",
    locationPrecision: "",
    constructionStart: month("constructionStart"),
    constructionEnd: month("constructionEnd"),
    constructionPrecision: "",
    inService: month("inService"),
    sourceUrl: source.url,
    sourceTitle: source.title,
    sourcePublisher: source.publisher,
  };
}

function optionalNumber(s: string): number | null {
  return s.trim() === "" ? null : Number(s);
}
function requiredNumber(s: string): number {
  return s.trim() === "" ? Number.NaN : Number(s);
}

export type ValidationResult =
  | { success: true; project: Project }
  | { success: false; errors: Record<string, string> };

export function validateReviewedProject(input: unknown, draft?: GroundedDraft): ValidationResult {
  const review = reviewSchema.safeParse(input);
  if (!review.success) {
    return {
      success: false,
      errors: Object.fromEntries(review.error.issues.map((issue) => [issue.path.join(".") || "review", issue.message])),
    };
  }
  const r = review.data;
  const errors: Record<string, string> = {};
  for (const key of ["utility", "id", "name", "type", "state", "status", "description", "longitude", "latitude",
    "locationPrecision", "constructionStart", "constructionEnd", "constructionPrecision", "sourceUrl", "sourceTitle"] as const) {
    if (!r[key].trim()) errors[key] = "Required for a reviewed project";
  }
  if (r.constructionStart && r.constructionEnd && r.constructionStart > r.constructionEnd) {
    errors.constructionEnd = "End month must be the same as or later than start month";
  }
  const candidate = {
    id: r.id.trim(),
    utility: r.utility.trim(),
    name: r.name.trim(),
    type: r.type,
    voltageKv: optionalNumber(r.voltageKv),
    capacityMw: optionalNumber(r.capacityMw),
    geometry: {
      type: "Point",
      coordinates: [requiredNumber(r.longitude), requiredNumber(r.latitude)],
    },
    locationPrecision: r.locationPrecision,
    construction: {
      start: r.constructionStart.trim(),
      end: r.constructionEnd.trim(),
      precision: r.constructionPrecision,
    },
    inService: r.inService.trim() || null,
    status: r.status,
    description: r.description.trim(),
    county: r.county.trim() || undefined,
    state: r.state.trim().toUpperCase(),
    sources: [{
      url: r.sourceUrl.trim(),
      title: r.sourceTitle.trim(),
      publisher: r.sourcePublisher.trim() || undefined,
      quote: draft?.name.evidence === "quote_found" ? draft.name.quote ?? undefined : undefined,
    }],
    // Deliberately omit resources. The existing EE ontology derives them by project type.
  };
  const parsed = projectSchema.safeParse(candidate);
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const key = issue.path[0] === "geometry"
      ? issue.path[2] === 0 ? "longitude" : "latitude"
      : issue.path[0] === "construction"
        ? issue.path[1] === "start" ? "constructionStart" : issue.path[1] === "end" ? "constructionEnd" : "constructionPrecision"
        : issue.path[0] === "sources"
          ? issue.path[2] === "url" ? "sourceUrl" : "sourceTitle"
          : String(issue.path[0]);
    errors[key] ??= issue.message;
  }
  return Object.keys(errors).length ? { success: false, errors } : { success: true, project: parsed.data as Project };
}
