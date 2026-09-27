import assert from "node:assert/strict";
import { test } from "node:test";
import { loadJsonDataset } from "../data";
import { compare, defaultParams } from "../engine/overlap";
import { POST as analyze } from "../../app/api/ingest/analyze/route";
import { groundDraft, quoteInSource } from "./grounding";
import { initialReview, validateReviewedProject } from "./normalize";
import { draftSchema, type Draft, type SourceInput } from "./schema";

const empty = { value: null, quote: null };
const source: SourceInput = {
  utility: "homestead-public-services",
  url: "https://example.org/public-plan",
  title: "Public construction plan",
  publisher: "Example Utility",
  text: "South Substation is planned in Miami-Dade County, FL. Construction expected to begin Q3 2028. " +
    "A 138 kV transformer is proposed at latitude 25.47, longitude -80.45.",
};

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    name: empty, type: empty, voltageKv: empty, capacityMw: empty,
    status: empty, description: empty, county: empty, state: empty,
    constructionStart: empty, constructionEnd: empty, inService: empty,
    locationDescription: empty, coordinates: empty, equipment: [],
    ...overrides,
  };
}

test("draft schema accepts unresolved values but rejects invalid structured values", () => {
  assert.equal(draftSchema.safeParse(draft()).success, true);
  assert.equal(draftSchema.safeParse(draft({ type: { value: "imaginary_type" as Draft["type"]["value"], quote: "imaginary" } })).success, false);
  assert.equal(draftSchema.safeParse(draft({ coordinates: { value: { latitude: 99, longitude: 0 }, quote: "99, 0" } })).success, false);
});

test("evidence quotes must occur in source; whitespace is normalized", () => {
  assert.equal(quoteInSource("Construction expected to begin\nQ3 2028", source.text), true);
  assert.equal(quoteInSource("Construction begins in 2026", source.text), false);
  const grounded = groundDraft(draft({
    name: { value: "South Substation", quote: "South Substation is planned" },
    constructionStart: { value: "Q3 2028", quote: "Construction expected to begin Q3 2028" },
    constructionEnd: { value: "2029-12", quote: "Construction ends December 2029" },
    voltageKv: { value: 500, quote: "A 138 kV transformer is proposed" },
    coordinates: { value: { latitude: 25.47, longitude: -80.45 }, quote: "latitude 25.47, longitude -80.45" },
  }), source.text);
  assert.equal(grounded.name.evidence, "quote_found");
  assert.equal(grounded.constructionStart.value, "Q3 2028");
  assert.equal(grounded.constructionEnd.evidence, "needs_review");
  assert.equal(grounded.constructionEnd.quote, null);
  assert.equal(grounded.voltageKv.evidence, "needs_review");
  assert.equal(grounded.coordinates.evidence, "quote_found");
  const review = initialReview(grounded, source);
  assert.equal(review.constructionStart, "", "quarter precision cannot become an exact month silently");
  assert.equal(review.constructionEnd, "", "unsupported end date cannot be prefilled");
  assert.equal(review.longitude, "-80.45");
  assert.equal(review.voltageKv, "", "unsupported number cannot be prefilled");
});

test("review must resolve canonical requirements and preserve ontology ownership", () => {
  const grounded = groundDraft(draft({ name: { value: "South Substation", quote: "South Substation is planned" } }), source.text);
  const reviewed = {
    ...initialReview(grounded, source),
    id: "new-south-substation", type: "substation_new", voltageKv: "138", state: "FL",
    status: "planned", description: "South substation expansion", longitude: "-80.45", latitude: "25.47",
    locationPrecision: "approximate", constructionStart: "2028-07", constructionEnd: "2029-06",
    constructionPrecision: "estimated",
  };
  const accepted = validateReviewedProject(reviewed, grounded);
  assert.equal(accepted.success, true);
  if (!accepted.success) return;
  assert.equal(accepted.project.resources, undefined, "Gemini evidence cannot replace the resource ontology");
  assert.equal(accepted.project.sources[0].quote, "South Substation is planned");
  assert.equal(validateReviewedProject({ ...reviewed, constructionEnd: "" }).success, false);
  assert.equal(validateReviewedProject({ ...reviewed, longitude: "" }).success, false);
  assert.equal(validateReviewedProject({ ...reviewed, humanReviewed: false }).success, false);
  assert.equal(validateReviewedProject({ ...reviewed, constructionEnd: "2028-01" }).success, false);
  assert.equal(validateReviewedProject({ ...reviewed, sourceUrl: "not-a-url" }).success, false);
});

test("a reviewed project reaches the existing deterministic engine, not a model-supplied score", async () => {
  const dataset = await loadJsonDataset();
  const existing = dataset.projects.find((p) => p.utility !== source.utility && p.geometry.type === "Point");
  assert.ok(existing);
  const [longitude, latitude] = existing.geometry.coordinates;
  const reviewed = {
    ...initialReview(groundDraft(draft(), source.text), source),
    id: "new-grid-project", name: "New Grid Project", type: existing.type,
    state: existing.state, status: "planned", description: "Reviewed public plan",
    longitude: String(longitude), latitude: String(latitude), locationPrecision: "exact",
    constructionStart: existing.construction.start, constructionEnd: existing.construction.end,
    constructionPrecision: "published",
  };
  const accepted = validateReviewedProject(reviewed);
  assert.equal(accepted.success, true);
  if (!accepted.success) return;
  const overlap = compare(accepted.project, existing, { ...defaultParams, parents: {} });
  assert.ok(overlap);
  assert.ok(overlap.scores.total > 0);
  assert.equal((accepted.project as unknown as Record<string, unknown>).score, undefined);

  const response = await analyze(new Request("http://localhost/api/ingest/analyze", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceText: source.text, draft: { ...draft(), score: 999, overlapScore: 999 },
      review: { ...reviewed, score: 999 }, score: 999,
    }),
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  const match = body.matches.find((m: { project: { id: string } }) => m.project.id === existing.id);
  assert.ok(match, "the API includes the known cross-utility match");
  assert.equal(match.overlap.scores.total, overlap.scores.total);
  assert.notEqual(match.overlap.scores.total, 999);
});
