"use client";

import { resourceLabels, scarceResources } from "@/lib/domain/resources";
import type { Project, Utility } from "@/lib/domain/schema";
import { weights, windowOf, type Overlap } from "@/lib/engine/overlap";
import { KIND, fmtMonth, statusLabel, typeLabel } from "@/lib/ui/format";
import { repoSourceFor } from "@/lib/ui/repo";
import Brief from "./Brief";

interface Props {
  overlap: Overlap | null; // with what-if shifts applied (null if the shift un-flags the pair)
  baseline: Overlap | null; // no shifts
  a: Project;
  b: Project;
  utilities: Record<string, Utility>;
  shifts: Record<string, number>;
  params: { maxMiles: number; maxGapMonths: number; regionMiles: number };
  onShift: (projectId: string, months: number) => void;
  onClose: () => void;
}

const SCORE_ROWS = [
  { key: "spatial", label: "Spatial proximity", w: weights.spatial },
  { key: "temporal", label: "Schedule overlap", w: weights.temporal },
  { key: "resource", label: "Resource compatibility", w: weights.resource },
  { key: "asset", label: "Voltage / asset similarity", w: weights.asset },
] as const;

export default function OverlapDetail({ overlap, baseline, a, b, utilities, shifts, params, onShift, onClose }: Props) {
  const o = overlap ?? baseline;
  if (!o) return null;
  const kind = KIND[o.kind];
  const delta = overlap && baseline ? overlap.scores.total - baseline.scores.total : null;
  const anyShift = (shifts[a.id] ?? 0) !== 0 || (shifts[b.id] ?? 0) !== 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-line p-4">
        <div className="relative grid h-16 w-16 shrink-0 place-items-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke={kind.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(o.scores.total / 100) * 97.4} 97.4`}
            />
          </svg>
          <span className="font-mono text-lg font-semibold">{overlap ? overlap.scores.total : "—"}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: kind.color }}>
            {kind.label}
          </div>
          <div className="mt-0.5 text-sm font-medium leading-snug">Coordination score</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {o.flags.includes("spatial") && <span className="rounded bg-white/8 px-1.5 py-0.5">📍 physically close</span>}
            {o.flags.includes("temporal") && <span className="rounded bg-white/8 px-1.5 py-0.5">🗓 same time</span>}
            {o.crossesStateLine && <span className="rounded bg-interstate/20 px-1.5 py-0.5 text-interstate">⇄ crosses state line</span>}
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-text" aria-label="Close detail">
          ✕
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        {/* The two projects */}
        <div className="space-y-2">
          {[a, b].map((p) => {
            const u = utilities[p.utility];
            const w = windowOf(p, shifts);
            return (
              <div key={p.id} className="rounded-lg border border-line bg-white/[0.03] p-3">
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: u?.color }} />
                  {u?.name} · {p.state}
                </div>
                <div className="mt-1 font-medium leading-snug">{p.name}</div>
                <div className="mt-1 text-xs text-muted">
                  {typeLabel[p.type]}
                  {p.voltageKv ? ` · ${p.voltageKv} kV` : ""}
                  {p.capacityMw ? ` · ${p.capacityMw} MW` : ""} · {statusLabel[p.status]}
                </div>
                <div className="mt-1 font-mono text-xs">
                  Build {fmtMonth(w.start)} → {fmtMonth(w.end)}
                  <span className="ml-1 text-muted">({p.construction.precision})</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Why */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Why GridSync flagged this</h3>
          <ul className="space-y-1">
            {o.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-share">›</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Score breakdown */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Score breakdown</h3>
          <div className="space-y-2">
            {SCORE_ROWS.map((r) => (
              <div key={r.key}>
                <div className="flex justify-between text-xs">
                  <span>
                    {r.label} <span className="text-muted">×{r.w}</span>
                  </span>
                  <span className="font-mono">{o.scores[r.key]}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/8">
                  <div className="h-full rounded-full" style={{ width: `${o.scores[r.key]}%`, background: kind.color }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[11px] text-muted">
            total = 0.35·S + 0.30·T + 0.25·R + 0.10·V · {o.distanceMiles} mi apart ·{" "}
            {o.overlapMonths ? `${o.overlapMonths} mo overlap` : `${o.gapMonths} mo gap`}
          </p>
        </section>

        {/* Resources */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Shared resource needs ({o.sharedResources.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {o.sharedResources.map((r) => (
              <span
                key={r}
                className={`rounded-md border px-2 py-0.5 text-xs ${
                  scarceResources.has(r) ? "border-collide/50 bg-collide/10 text-collide" : "border-line bg-white/5"
                }`}
              >
                {scarceResources.has(r) ? "⚠ " : ""}
                {resourceLabels[r] ?? r}
              </span>
            ))}
            {!o.sharedResources.length && <span className="text-muted">No shared resource types</span>}
          </div>
          {o.scarceShared.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              ⚠ = long-lead or thin-labor-pool resources. Overlapping demand here can delay both projects; joint procurement or
              staggered mobilization can avoid it.
            </p>
          )}
        </section>

        {/* What-if */}
        <section className="rounded-lg border border-share/30 bg-share/5 p-3">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-share">What-if scheduling</h3>
          <p className="mb-3 text-xs text-muted">Shift a construction window and watch the overlap re-score.</p>
          {[a, b].map((p) => (
            <label key={p.id} className="mb-2 block text-xs">
              <div className="flex justify-between">
                <span className="truncate pr-2">{p.name}</span>
                <span className="font-mono">
                  {(shifts[p.id] ?? 0) > 0 ? "+" : ""}
                  {shifts[p.id] ?? 0} mo
                </span>
              </div>
              <input
                type="range"
                min={-24}
                max={24}
                step={3}
                value={shifts[p.id] ?? 0}
                onChange={(e) => onShift(p.id, Number(e.target.value))}
                className="w-full"
              />
            </label>
          ))}
          {anyShift && (
            <div className="mt-2 flex items-center justify-between rounded-md bg-black/30 px-3 py-2 font-mono text-sm">
              <span className="text-muted">score</span>
              <span>
                {baseline?.scores.total ?? "—"} → {overlap?.scores.total ?? "not flagged"}
                {delta !== null && delta !== 0 && (
                  <span className={delta > 0 ? "ml-2 text-share" : "ml-2 text-collide"}>
                    ({delta > 0 ? "+" : ""}
                    {delta})
                  </span>
                )}
              </span>
            </div>
          )}
          {anyShift && overlap && baseline && (
            <p className="mt-2 text-xs text-muted">
              Overlap {baseline.overlapMonths} → {overlap.overlapMonths} months
              {overlap.kind !== baseline.kind ? ` · now a ${KIND[overlap.kind].label.toLowerCase()}` : ""}
            </p>
          )}
        </section>

        <Brief key={`${a.id}|${b.id}|${shifts[a.id] ?? 0}|${shifts[b.id] ?? 0}`} overlap={overlap ?? baseline!} a={a} b={b} utilities={utilities} shifts={shifts} params={params} />

        {/* Sources */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Sources</h3>
          <div className="space-y-3">
            {[a, b].map((p) => (
              <div key={p.id}>
                <div className="mb-1 text-xs text-muted">{p.name}</div>
                <ul className="space-y-1.5">
                  {p.sources.map((s) => (
                    <li key={s.url + s.title} className="text-xs">
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
                        {s.title} ↗
                      </a>
                      {s.publisher && <span className="text-muted"> · {s.publisher}</span>}
                      {s.quote && <blockquote className="mt-1 border-l-2 border-line pl-2 italic text-muted">“{s.quote}”</blockquote>}
                    </li>
                  ))}
                </ul>
                <RepoLinks projectId={p.id} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RepoLinks({ projectId }: { projectId: string }) {
  const r = repoSourceFor(projectId);
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-[10px] text-muted">
      <span>GitHub:</span>
      <a href={r.record} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
        normalized record ↗
      </a>
      {r.parser ? (
        <a href={r.parser} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
          {r.label} ↗
        </a>
      ) : (
        <span>{r.label}</span>
      )}
    </div>
  );
}
