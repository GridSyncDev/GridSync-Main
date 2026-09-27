"use client";

import { useState } from "react";
import type { Project } from "@/lib/domain/schema";
import type { Overlap } from "@/lib/engine/overlap";
import {
  COST_CAVEAT,
  IMPACT_CAVEAT,
  IMPACT_SCENARIO_ASSUMPTION,
  USER_ASSUMPTION_LABEL,
  costAvoidedRange,
  impactAssumptionSource,
  impactFactsFromOverlap,
  impactScenario,
  impactScenarioForPair,
} from "@/lib/impact";

interface Props {
  overlap: Overlap;
  a: Project;
  b: Project;
}

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function scheduleText(facts: ReturnType<typeof impactFactsFromOverlap>): string {
  const prefix = facts.scheduleIsEstimated ? "Estimated construction windows" : "Construction windows";
  if (facts.actualTimelineOverlap) return `${prefix} overlap by ${facts.overlapMonths} months`;
  if (facts.immediatelySequential) return `${facts.scheduleIsEstimated ? "Estimated schedules are" : "Schedules are"} immediately sequential`;
  return `${prefix} are ${facts.gapMonths} months apart`;
}

function projectPlanningSource(project: Project) {
  return project.sources.find((source) => /SERTP/i.test(`${source.title} ${source.publisher ?? ""}`)) ?? project.sources[0];
}

export default function ImpactScenario({ overlap, a, b }: Props) {
  const scenario = impactScenarioForPair(a, b);
  const [costInput, setCostInput] = useState("");
  if (!scenario) return null;

  const facts = impactFactsFromOverlap(overlap);
  const costRange = costAvoidedRange(costInput);

  return (
    <section className="rounded-lg border border-share/40 bg-share/[0.07] p-3" data-testid="impact-scenario">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-share">Illustrative impact scenario</div>
      <div className="mt-1 text-xs text-muted">Potential duplicate local staging footprint avoided</div>
      <div className="mt-0.5 font-mono text-2xl font-semibold text-text">
        {impactScenario.potentialDuplicatedFootprintAvoidedAcres.min}–{impactScenario.potentialDuplicatedFootprintAvoidedAcres.max} acres
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-line bg-black/20 p-2">
          <div className="text-muted">Separate local yards (1 per project)</div>
          <div className="mt-0.5 font-mono">{impactScenario.separateYardsAcres.min}–{impactScenario.separateYardsAcres.max} acres</div>
        </div>
        <div className="rounded-md border border-line bg-black/20 p-2">
          <div className="text-muted">One shared local yard</div>
          <div className="mt-0.5 font-mono">{impactScenario.sharedYardAcres.min}–{impactScenario.sharedYardAcres.max} acres</div>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">Closest approach</dt>
        <dd className="text-right font-mono">{facts.distanceMiles.toFixed(2)} mi</dd>
        <dt className="text-muted">Schedule</dt>
        <dd className="text-right">{scheduleText(facts)}</dd>
        <dt className="text-muted">Coordination score</dt>
        <dd className="text-right font-mono">{facts.scorePoints}/{facts.scoreMaxPoints} · {facts.scoreNormalized}/100</dd>
        <dt className="text-muted">Earned mechanisms</dt>
        <dd className="text-right">{facts.earnedMechanisms.join(", ")}</dd>
      </dl>

      <label className="mt-3 block text-xs">
        <span className="font-medium">All-in temporary staging cost ($/acre)</span>
        <span className="mt-1 flex items-center gap-2">
          <span className="text-muted">$</span>
          <input
            type="number"
            min="0"
            step="1000"
            inputMode="decimal"
            value={costInput}
            onChange={(event) => setCostInput(event.target.value)}
            placeholder="Planner input"
            aria-label="All-in temporary staging cost in dollars per acre"
            className="min-w-0 flex-1 rounded-md border border-line bg-black/30 px-2.5 py-1.5 font-mono outline-none focus:border-share/70"
          />
          <span className="text-muted">/ acre</span>
        </span>
      </label>

      {costRange && (
        <div className="mt-3 rounded-md border border-share/30 bg-black/20 p-2.5">
          <div className="text-[11px] text-muted">Potential illustrative duplicate-site cost avoided</div>
          <div className="mt-0.5 font-mono text-lg font-semibold">{dollars.format(costRange.min)} – {dollars.format(costRange.max)}</div>
          <div className="mt-1 inline-block rounded bg-share/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-share">
            {USER_ASSUMPTION_LABEL}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted">Based only on the planner-entered all-in temporary staging cost per acre—not public land-sale pricing.</p>
        </div>
      )}

      <details className="mt-3 border-t border-line pt-2 text-xs">
        <summary className="cursor-pointer font-medium text-sky-300">Assumptions &amp; sources</summary>
        <div className="mt-2 space-y-2 leading-relaxed text-muted">
          <p>{IMPACT_SCENARIO_ASSUMPTION}</p>
          <p>{IMPACT_CAVEAT}</p>
          <p>{COST_CAVEAT}</p>
          <div>
            <div className="font-medium text-text">Project provenance</div>
            {[a, b].map((project) => {
              const source = projectPlanningSource(project);
              return (
                <div key={project.id} className="mt-1">
                  {project.name}: <a href={source.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{source.title} ↗</a>
                </div>
              );
            })}
          </div>
          <div>
            <div className="font-medium text-text">Impact-assumption provenance</div>
            <a href={impactAssumptionSource.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
              {impactAssumptionSource.title} ↗
            </a>
            <div>{impactAssumptionSource.publisher} · p. {impactAssumptionSource.page}</div>
            <p className="mt-1">{impactAssumptionSource.note} DOE did not study these Winder projects.</p>
          </div>
        </div>
      </details>
    </section>
  );
}

