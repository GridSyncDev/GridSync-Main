"use client";

import { useState } from "react";
import { projectTypes, type Project } from "@/lib/domain/schema";
import type { Overlap } from "@/lib/engine/overlap";
import type { GroundedDraft } from "@/lib/ingestion/grounding";
import { initialReview, type Review } from "@/lib/ingestion/normalize";
import { draftKeys, type SourceInput } from "@/lib/ingestion/schema";

type UtilityOption = { id: string; name: string; color: string };
type Match = { overlap: Overlap; project: Project; utility: UtilityOption };
type Analysis = { project: Project; count: number; matches: Match[] };
type ReviewKey = Exclude<keyof Review, "humanReviewed">;

const inputClass = "w-full rounded-lg border border-line bg-[#0e1728] px-3 py-2 text-sm text-text outline-none focus:border-share";
const fieldNames: Record<keyof GroundedDraft, string> = {
  name: "Project name", type: "Project type", voltageKv: "Voltage", capacityMw: "Capacity",
  status: "Status", description: "Description", county: "County", state: "State",
  constructionStart: "Construction start expression", constructionEnd: "Construction end expression",
  inService: "In-service expression", locationDescription: "Location description",
  coordinates: "Coordinates", equipment: "Explicit equipment / crews",
};

const fields: { key: ReviewKey; label: string; required?: boolean; placeholder?: string; options?: string[] }[] = [
  { key: "id", label: "New project ID", required: true, placeholder: "lowercase-words-and-numbers" },
  { key: "name", label: "Project name", required: true },
  { key: "type", label: "Project type", required: true, options: [...projectTypes] },
  { key: "voltageKv", label: "Voltage (kV)", placeholder: "Blank if not known" },
  { key: "capacityMw", label: "Capacity (MW)", placeholder: "Blank if not known" },
  { key: "state", label: "State (2 letters)", required: true, placeholder: "FL" },
  { key: "county", label: "County" },
  { key: "status", label: "Status", required: true, options: ["planned", "permitting", "approved", "under_construction"] },
  { key: "longitude", label: "Longitude", required: true, placeholder: "-80.47" },
  { key: "latitude", label: "Latitude", required: true, placeholder: "25.47" },
  { key: "locationPrecision", label: "Location precision", required: true, options: ["exact", "approximate", "county"] },
  { key: "constructionStart", label: "Construction start (YYYY-MM)", required: true, placeholder: "Resolve raw expression above" },
  { key: "constructionEnd", label: "Construction end (YYYY-MM)", required: true, placeholder: "Do not infer a missing end" },
  { key: "constructionPrecision", label: "Schedule precision", required: true, options: ["published", "estimated"] },
  { key: "inService", label: "In-service month (YYYY-MM)", placeholder: "Blank if not known" },
  { key: "description", label: "Project description", required: true },
  { key: "sourceUrl", label: "Source URL", required: true },
  { key: "sourceTitle", label: "Source title", required: true },
  { key: "sourcePublisher", label: "Publisher" },
];

export default function IngestClient({ utilities }: { utilities: UtilityOption[] }) {
  const [source, setSource] = useState<SourceInput>({
    utility: utilities[0]?.id ?? "", url: "", title: "", publisher: "", text: "",
  });
  const [draft, setDraft] = useState<GroundedDraft | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState<"extract" | "analyze" | null>(null);

  function changeSource(key: keyof SourceInput, value: string) {
    setSource((current) => ({ ...current, [key]: value }));
    setDraft(null);
    setReview(null);
    setReviewed(false);
    setAnalysis(null);
    setErrors({});
    setMessage("");
  }

  function changeReview(key: ReviewKey, value: string) {
    setReview((current) => current && { ...current, [key]: value });
    setReviewed(false);
    setAnalysis(null);
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function extract() {
    setWorking("extract");
    setMessage("");
    setErrors({});
    setAnalysis(null);
    try {
      const response = await fetch("/api/ingest/extract", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(source),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Extraction failed");
      const nextDraft = data.draft as GroundedDraft;
      setDraft(nextDraft);
      setReview(initialReview(nextDraft, source));
      setReviewed(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Extraction failed; please retry.");
    } finally {
      setWorking(null);
    }
  }

  async function analyze() {
    if (!draft || !review) return;
    setWorking("analyze");
    setMessage("");
    setErrors({});
    setAnalysis(null);
    try {
      const response = await fetch("/api/ingest/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText: source.text, draft, review: { ...review, humanReviewed: reviewed } }),
      });
      const data = await response.json();
      if (!response.ok) {
        setErrors(data.errors ?? {});
        throw new Error(data.error ?? "Review the highlighted fields.");
      }
      setAnalysis(data as Analysis);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Analysis failed; please retry.");
    } finally {
      setWorking(null);
    }
  }

  const unresolved = review
    ? fields.filter((field) => field.required && !review[field.key].trim()).map((field) => field.label)
    : [];

  return (
    <div className="space-y-6 pb-16">
      <section className="rounded-xl border border-line bg-panel p-5">
        <h2 className="text-lg font-semibold">1 · Source</h2>
        <p className="mt-1 text-sm text-muted">Paste one public project excerpt. Gemini will see only the text you submit.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs text-muted">GridSync utility
            <select className={inputClass + " mt-1"} value={source.utility} onChange={(e) => changeSource("utility", e.target.value)}>
              {utilities.map((utility) => <option key={utility.id} value={utility.id}>{utility.name}</option>)}
            </select>
          </label>
          {(["url", "title", "publisher"] as const).map((key) => (
            <label key={key} className="text-xs text-muted">{key === "url" ? "Source URL" : key === "title" ? "Source title" : "Publisher"} · required
              <input className={inputClass + " mt-1"} value={source[key]} onChange={(e) => changeSource(key, e.target.value)}
                placeholder={key === "url" ? "https://utility.example/plan" : ""} />
            </label>
          ))}
        </div>
        <label className="mt-4 block text-xs text-muted">Public plan text
          <textarea className={inputClass + " mt-1 min-h-48 resize-y"} value={source.text}
            onChange={(e) => changeSource("text", e.target.value)}
            placeholder="Paste the relevant paragraph or project table row here…" />
        </label>
        <button onClick={extract} disabled={working !== null}
          className="mt-4 rounded-lg bg-share px-5 py-2.5 text-sm font-semibold text-[#061519] disabled:opacity-50">
          {working === "extract" ? "Extracting…" : "Extract with Gemini"}
        </button>
      </section>

      {draft && review && (
        <>
          <section className="rounded-xl border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold">2 · Draft and source evidence</h2>
            <p className="mt-1 text-sm text-muted">
              Green means the quoted text was found in your paste. It does not prove the model interpreted that text correctly.
              Amber suggestions need manual review. Raw date expressions remain unchanged.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {draftKeys.map((key) => {
                const fact = draft[key];
                return <EvidenceCard key={key} label={fieldNames[key]} fact={fact} />;
              })}
              {draft.equipment.map((fact, index) =>
                <EvidenceCard key={index} label={fieldNames.equipment} fact={fact} />)}
            </div>
            <p className="mt-4 text-xs text-muted">
              Equipment phrases are preserved as evidence only. The existing project-type resource ontology remains authoritative for matching.
            </p>
          </section>

          <section className="rounded-xl border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold">3 · Human review</h2>
            <p className="mt-1 text-sm text-muted">
              Complete unresolved fields yourself. A quarter or year in the source is not silently converted to a month;
              coordinates and missing end dates are never invented.
            </p>
            {unresolved.length > 0 && <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              Still required: {unresolved.join(", ")}.
            </p>}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-xs text-muted">Utility · required
                <select className={inputClass + " mt-1"} value={review.utility} onChange={(e) => changeReview("utility", e.target.value)}>
                  {utilities.map((utility) => <option key={utility.id} value={utility.id}>{utility.name}</option>)}
                </select>
                {errors.utility && <span className="mt-1 block text-collide">{errors.utility}</span>}
              </label>
              {fields.map((field) => (
                <label key={field.key} className={field.key === "description" ? "text-xs text-muted md:col-span-2" : "text-xs text-muted"}>
                  {field.label}{field.required ? " · required" : ""}
                  {field.options ? (
                    <select className={inputClass + " mt-1"} value={review[field.key]} onChange={(e) => changeReview(field.key, e.target.value)}>
                      <option value="">Select…</option>
                      {field.options.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
                    </select>
                  ) : field.key === "description" ? (
                    <textarea className={inputClass + " mt-1 min-h-24"} value={review[field.key]}
                      onChange={(e) => changeReview(field.key, e.target.value)} />
                  ) : (
                    <input className={inputClass + " mt-1"} value={review[field.key]} placeholder={field.placeholder}
                      onChange={(e) => changeReview(field.key, e.target.value)} />
                  )}
                  {errors[field.key] && <span className="mt-1 block text-collide">{errors[field.key]}</span>}
                </label>
              ))}
            </div>
            <label className="mt-5 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
              I reviewed the source quotes, corrected the project fields, and supplied any missing coordinates or dates myself.
            </label>
            <button onClick={analyze} disabled={!reviewed || working !== null}
              className="mt-4 rounded-lg bg-share px-5 py-2.5 text-sm font-semibold text-[#061519] disabled:opacity-50">
              {working === "analyze" ? "Validating and analyzing…" : "Validate & Analyze"}
            </button>
            <p className="mt-2 text-xs text-muted">This preview is not saved to the production dataset or database.</p>
          </section>
        </>
      )}

      {message && <div role="alert" className="rounded-lg border border-collide/50 bg-collide/10 p-4 text-sm text-collide">{message}</div>}

      {analysis && (
        <section className="rounded-xl border border-share/40 bg-panel p-5">
          <h2 className="text-lg font-semibold">4 · Deterministic coordination matches</h2>
          <p className="mt-1 text-sm text-muted">
            `{analysis.project.name}` passed the canonical project schema. GridSync found {analysis.count} cross-utility matches
            using the existing engine. Showing the 10 highest-ranked. No Gemini score is used.
          </p>
          <div className="mt-4 space-y-3">
            {analysis.matches.length === 0 && <p className="rounded-lg border border-line p-4 text-sm text-muted">
              No projects meet the current engine thresholds for this reviewed location and schedule.
            </p>}
            {analysis.matches.map(({ overlap, project, utility }) => (
              <article key={overlap.id} className="rounded-lg border border-line bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted">{utility.name} · {project.state}</p>
                    <h3 className="mt-1 font-medium">{project.name}</h3>
                  </div>
                  <div className="rounded-lg bg-share/15 px-3 py-1 font-mono text-lg font-semibold text-share">{overlap.scores.points}/4 <span className="text-xs">({overlap.scores.normalized}/100)</span></div>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {overlap.distanceMiles} mi apart · {overlap.overlapMonths > 0
                    ? `${overlap.overlapMonths} months of construction overlap`
                    : `${overlap.gapMonths} months between windows`}
                  {" · Coordination opportunity"}
                </p>
                <ul className="mt-3 list-inside list-disc text-xs leading-5 text-muted">
                  {overlap.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
                <p className="mt-2 text-xs text-muted">
                  Shared resource types: {overlap.sharedResources.length ? overlap.sharedResources.join(", ") : "none identified"}
                </p>
                {project.sources[0]?.url && <a href={project.sources[0].url} target="_blank" rel="noreferrer"
                  className="mt-2 inline-block text-xs text-sky-300 underline">Matching project source ↗</a>}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EvidenceCard({ label, fact }: { label: string; fact: { value: unknown; quote: string | null; evidence: string; note: string | null } }) {
  const supported = fact.evidence === "quote_found";
  const value = fact.value && typeof fact.value === "object" ? JSON.stringify(fact.value) : String(fact.value ?? "Unresolved");
  return <div className={"rounded-lg border p-3 " + (supported ? "border-share/40 bg-share/5" : "border-amber-500/30 bg-amber-500/5")}>
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="font-semibold text-text">{label}</span>
      <span className={supported ? "text-share" : "text-amber-300"}>{supported ? "Quote found" : "Review needed"}</span>
    </div>
    <p className="mt-2 break-words text-sm">{value}</p>
    {fact.quote && <blockquote className="mt-2 border-l-2 border-share/50 pl-2 text-xs italic text-muted">“{fact.quote}”</blockquote>}
    {fact.note && <p className="mt-2 text-xs text-amber-200">{fact.note}</p>}
  </div>;
}
