"use client";

import { resourceLabels } from "@/lib/domain/resources";
import type { Project, Utility } from "@/lib/domain/schema";
import { windowOf, type CoordinationPointKey, type Overlap } from "@/lib/engine/overlap";
import { KIND, fmtMonth, statusLabel, typeLabel } from "@/lib/ui/format";
import { repoSourceFor } from "@/lib/ui/repo";
import Brief from "./Brief";
import ImpactScenario from "./ImpactScenario";

interface Props {
  overlap: Overlap | null;
  baseline: Overlap | null;
  a: Project;
  b: Project;
  utilities: Record<string, Utility>;
  shifts: Record<string, number>;
  onShift: (projectId: string, months: number) => void;
  onClose: () => void;
}

const SCORE_ROWS: { key: CoordinationPointKey; label: string }[] = [
  { key: "outageCoordination", label: "Crossing / outage coordination" },
  { key: "rowAccessPermitting", label: "ROW / access / permitting" },
  { key: "siteLogistics", label: "Site logistics" },
  { key: "crewEquipment", label: "Crews / equipment" },
];

export default function OverlapDetail({ overlap, baseline, a, b, utilities, shifts, onShift, onClose }: Props) {
  const o = overlap ?? baseline;
  if (!o) return null;
  const kind = KIND[o.kind];
  const delta = overlap && baseline ? overlap.scores.points - baseline.scores.points : null;
  const anyShift = (shifts[a.id] ?? 0) !== 0 || (shifts[b.id] ?? 0) !== 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-line p-4">
        <div className="relative grid h-16 w-16 shrink-0 place-items-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke={kind.color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(o.scores.normalized / 100) * 97.4} 97.4`} />
          </svg>
          <span className="font-mono text-lg font-semibold">{overlap ? `${overlap.scores.points}/4` : "—"}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: kind.color }}>{kind.label}</div>
          <div className="mt-0.5 text-sm font-medium leading-snug">Raw coordination score</div>
          <div className="text-[11px] text-muted">Normalized display: {o.scores.normalized}/100</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded bg-white/8 px-1.5 py-0.5">📍 within 40 km</span>
            {o.actualTimelineOverlap && <span className="rounded bg-white/8 px-1.5 py-0.5">🗓 overlapping windows</span>}
            {o.immediatelySequential && <span className="rounded bg-white/8 px-1.5 py-0.5">↪ immediately sequential</span>}
            {o.scheduleIsEstimated && <span className="rounded bg-white/8 px-1.5 py-0.5">schedule estimate involved</span>}
            {o.crossesStateLine && <span className="rounded bg-interstate/20 px-1.5 py-0.5 text-interstate">⇄ crosses state line</span>}
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-text" aria-label="Close detail">✕</button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        <div className="space-y-2">
          {[a, b].map((project) => {
            const utility = utilities[project.utility];
            const window = windowOf(project, shifts);
            return (
              <div key={project.id} className="rounded-lg border border-line bg-white/[0.03] p-3">
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: utility?.color }} />
                  {utility?.name} · {project.state}
                </div>
                <div className="mt-1 font-medium leading-snug">{project.name}</div>
                <div className="mt-1 text-xs text-muted">
                  {typeLabel[project.type]}{project.voltageKv ? ` · ${project.voltageKv} kV` : ""}{project.capacityMw ? ` · ${project.capacityMw} MW` : ""} · {statusLabel[project.status]}
                </div>
                <div className="mt-1 font-mono text-xs">
                  Build {fmtMonth(window.start)} → {fmtMonth(window.end)}
                  <span className="ml-1 text-muted">({project.construction.precision})</span>
                </div>
              </div>
            );
          })}
        </div>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Why GridSync flagged this</h3>
          <ul className="space-y-1">
            {o.reasons.map((reason) => <li key={reason} className="flex gap-2"><span className="text-share">›</span><span>{reason}</span></li>)}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Point-by-point rubric</h3>
          <div className="space-y-2">
            {SCORE_ROWS.map(({ key, label }) => {
              const item = o.scores.breakdown[key];
              return (
                <div key={key} className={`rounded-md border px-2.5 py-2 ${item.earned ? "border-share/40 bg-share/5" : "border-line bg-white/[0.02]"}`}>
                  <div className="flex justify-between gap-3 text-xs"><span>{label}</span><span className="font-mono">{item.earned ? "+1" : "0"}</span></div>
                  <p className="mt-1 text-[11px] leading-snug text-muted">{item.explanation}{item.usesEstimatedSchedule ? " This point relies on at least one estimated construction window." : ""}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-2 font-mono text-[11px] text-muted">{o.distanceMiles.toFixed(3)} mi / {o.distanceKm.toFixed(3)} km closest-point distance · raw {o.scores.points}/4 · normalized {o.scores.normalized}/100</p>
        </section>

        <ImpactScenario overlap={o} a={a} b={b} />

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Shared resource tags — descriptive, not scored ({o.sharedResources.length})</h3>
          <div className="flex flex-wrap gap-1.5">
            {o.sharedResources.map((resource) => <span key={resource} className="rounded-md border border-line bg-white/5 px-2 py-0.5 text-xs">{resourceLabels[resource] ?? resource}</span>)}
            {!o.sharedResources.length && <span className="text-muted">No shared resource tags</span>}
          </div>
          <p className="mt-2 text-xs text-muted">These tags provide project context only. They do not establish scarcity, delay, savings, or score.</p>
        </section>

        <section className="rounded-lg border border-share/30 bg-share/5 p-3">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-share">What-if scheduling</h3>
          <p className="mb-3 text-xs text-muted">Shift a construction window and watch the deterministic points change.</p>
          {[a, b].map((project) => (
            <label key={project.id} className="mb-2 block text-xs">
              <div className="flex justify-between"><span className="truncate pr-2">{project.name}</span><span className="font-mono">{(shifts[project.id] ?? 0) > 0 ? "+" : ""}{shifts[project.id] ?? 0} mo</span></div>
              <input type="range" min={-24} max={24} step={3} value={shifts[project.id] ?? 0} onChange={(event) => onShift(project.id, Number(event.target.value))} className="w-full" />
            </label>
          ))}
          {anyShift && (
            <div className="mt-2 flex items-center justify-between rounded-md bg-black/30 px-3 py-2 font-mono text-sm">
              <span className="text-muted">raw score</span>
              <span>{baseline?.scores.points ?? "—"}/4 → {overlap ? `${overlap.scores.points}/4` : "not eligible"}{delta !== null && delta !== 0 && <span className={delta > 0 ? "ml-2 text-share" : "ml-2 text-collide"}>({delta > 0 ? "+" : ""}{delta})</span>}</span>
            </div>
          )}
          {anyShift && overlap && baseline && <p className="mt-2 text-xs text-muted">Actual overlap {baseline.overlapMonths} → {overlap.overlapMonths} months</p>}
        </section>

        <Brief key={`${a.id}|${b.id}|${shifts[a.id] ?? 0}|${shifts[b.id] ?? 0}`} overlap={overlap ?? baseline!} a={a} b={b} utilities={utilities} shifts={shifts} />

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Sources</h3>
          <div className="space-y-3">
            {[a, b].map((project) => (
              <div key={project.id}>
                <div className="mb-1 text-xs text-muted">{project.name}</div>
                <ul className="space-y-1.5">
                  {project.sources.map((source) => (
                    <li key={source.url + source.title} className="text-xs">
                      <a href={source.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{source.title} ↗</a>
                      {source.publisher && <span className="text-muted"> · {source.publisher}</span>}
                      {source.quote && <blockquote className="mt-1 border-l-2 border-line pl-2 italic text-muted">“{source.quote}”</blockquote>}
                    </li>
                  ))}
                </ul>
                <RepoLinks projectId={project.id} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RepoLinks({ projectId }: { projectId: string }) {
  const repo = repoSourceFor(projectId);
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-[10px] text-muted">
      <span>GitHub:</span>
      <a href={repo.record} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">normalized record ↗</a>
      {repo.parser ? <a href={repo.parser} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{repo.label} ↗</a> : <span>{repo.label}</span>}
    </div>
  );
}

