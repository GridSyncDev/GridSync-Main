import { draftKeys, draftSchema, type Draft, type DraftKey } from "./schema";

export type EvidenceState = "quote_found" | "needs_review";
export type GroundedFact<T> = {
  value: T | null;
  quote: string | null;
  evidence: EvidenceState;
  note: string | null;
};
export type GroundedDraft = {
  [K in DraftKey]: GroundedFact<Draft[K]["value"]>;
} & { equipment: GroundedFact<string>[] };

const normalized = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

export function quoteInSource(quote: string, text: string): boolean {
  const q = normalized(quote);
  return q.length > 0 && normalized(text).includes(q);
}

const numbers = (s: string) => (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
const hasNumber = (quote: string, n: number) => numbers(quote).some((x) => Math.abs(x - n) < 0.000001);

function ground<T>(value: T | null, quote: string | null, text: string, key: DraftKey | "equipment"): GroundedFact<T> {
  if (value === null) return { value, quote: null, evidence: "needs_review", note: "No value extracted" };
  if (!quote || !quoteInSource(quote, text)) {
    return { value, quote: null, evidence: "needs_review", note: "Evidence quote was not found in the pasted text" };
  }
  if (key === "coordinates") {
    const point = value as { longitude: number; latitude: number };
    if (!hasNumber(quote, point.longitude) || !hasNumber(quote, point.latitude)) {
      return { value, quote: null, evidence: "needs_review", note: "Both coordinates must appear explicitly in the quote" };
    }
  } else if ((key === "voltageKv" || key === "capacityMw") && !hasNumber(quote, value as number)) {
    return { value, quote: null, evidence: "needs_review", note: "The number does not appear in the quote" };
  } else if (["name", "county", "state", "constructionStart", "constructionEnd", "inService", "locationDescription", "equipment"].includes(key)
    && !normalized(quote).includes(normalized(String(value)))) {
    return { value, quote: null, evidence: "needs_review", note: "The suggested value does not appear in the quote" };
  }
  return { value, quote: quote.trim(), evidence: "quote_found", note: null };
}

export function groundDraft(candidate: unknown, text: string): GroundedDraft {
  const draft = draftSchema.parse(candidate);
  const result = {} as GroundedDraft;
  for (const key of draftKeys) {
    const item = draft[key];
    // Each fact keeps the model's suggestion, but unsupported quotes are removed.
    Object.assign(result, { [key]: ground(item.value, item.quote, text, key) });
  }
  result.equipment = draft.equipment.map((item) => ground(item.value, item.quote, text, "equipment"))
    .filter((item): item is GroundedFact<string> => item.value !== null);
  return result;
}
