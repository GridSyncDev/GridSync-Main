"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { Dataset, Project } from "@/lib/domain/schema";
import { coordinationThresholdsKm, coordinationThresholdsMiles } from "@/lib/engine/config";
import { compare, findOverlaps, windowOf, type Overlap, type OverlapParams } from "@/lib/engine/overlap";
import { addMonths, toIndex } from "@/lib/engine/time";
import { KIND } from "@/lib/ui/format";
import { impactScenarioForPair } from "@/lib/impact";
import { DATA_URL, INGEST_URL } from "@/lib/ui/repo";
import { PRESETS, type PresetKey } from "@/lib/ui/presets";
import type { FlyTarget } from "./MapView";
import OverlapDetail from "./OverlapDetail";
import Timeline from "./Timeline";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">Loading map…</div>,
});

const pairId = (a: string, b: string) => [a, b].sort().join("__");

export default function GridSyncApp({ dataset, source }: { dataset: Dataset; source: "postgres" | "json" }) {
  const { projects, utilities: utilityList } = dataset;
  const utilities = useMemo(() => Object.fromEntries(utilityList.map((u) => [u.id, u])), [utilityList]);
  const parents = useMemo(() => Object.fromEntries(utilityList.map((u) => [u.id, u.parent])), [utilityList]);
  const byId = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of projects) c[p.utility] = (c[p.utility] ?? 0) + 1;
    return c;
  }, [projects]);

  const [includeAffiliates, setIncludeAffiliates] = useState(false);
  const [onlyCrossState, setOnlyCrossState] = useState(false);
  const [onlyBoth, setOnlyBoth] = useState(false);
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(utilityList.map((u) => u.id)));
  const [shifts, setShifts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [density, setDensity] = useState(false);
  const [intro, setIntro] = useState(true);
  const [preset, setPreset] = useState<PresetKey>("southeast");
  const [flyTo, setFlyTo] = useState<FlyTarget>({ ...PRESETS.southeast.fly, key: 0 });

  const params: OverlapParams = { shifts, parents, includeAffiliates };
  const visible = useMemo(() => projects.filter((p) => enabled.has(p.utility)), [projects, enabled]);
  const overlaps = useMemo(
    () => findOverlaps(visible, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, shifts, parents, includeAffiliates],
  );
  const list = useMemo(
    () =>
      overlaps.filter(
        (o) =>
          (!onlyCrossState || o.crossesStateLine) &&
          (!onlyBoth || o.actualTimelineOverlap) &&
          (!selectedProjectId || o.a === selectedProjectId || o.b === selectedProjectId),
      ),
    [overlaps, onlyCrossState, onlyBoth, selectedProjectId],
  );

  // The selected pair stays inspectable while a what-if shift changes its score.
  const [selA, selB] = selectedId ? selectedId.split("__") : [null, null];
  const pa = selA ? byId[selA] : null;
  const pb = selB ? byId[selB] : null;
  const current = pa && pb ? compare(pa, pb, { ...params, includeAffiliates: true }) : null;
  const baseline = pa && pb ? compare(pa, pb, { ...params, shifts: {}, includeAffiliates: true }) : null;
  const selected: Overlap | null = current ?? null;

  const activeIds = useMemo(() => {
    if (!activeMonth) return null;
    const i = toIndex(activeMonth);
    return new Set(visible.filter((p) => { const w = windowOf(p, shifts); return toIndex(w.start) <= i && i <= toIndex(w.end); }).map((p) => p.id));
  }, [activeMonth, visible, shifts]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setActiveMonth((m) => {
        const next = m && m < "2034-12" ? addMonths(m, 1) : "2025-01";
        return next;
      });
    }, 140);
    return () => clearInterval(t);
  }, [playing]);

  const timelineRows: Project[] = useMemo(() => {
    const ids: string[] = [];
    const push = (id: string) => !ids.includes(id) && byId[id] && ids.push(id);
    if (pa && pb) {
      push(pa.id);
      push(pb.id);
      for (const o of overlaps.filter((o) => o.a === pa.id || o.b === pa.id || o.a === pb.id || o.b === pb.id).slice(0, 6)) {
        push(o.a);
        push(o.b);
      }
    } else if (selectedProjectId) {
      push(selectedProjectId);
      for (const o of list.slice(0, 8)) push(o.a === selectedProjectId ? o.b : o.a);
    } else {
      for (const o of list.slice(0, 7)) {
        push(o.a);
        push(o.b);
      }
    }
    return ids.map((id) => byId[id]);
  }, [pa, pb, overlaps, list, selectedProjectId, byId]);

  function focusPair(o: Overlap) {
    setSelectedId(o.id);
    setIntro(false);
    const [x1, y1] = centerOf(byId[o.a]);
    const [x2, y2] = centerOf(byId[o.b]);
    const span = Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), 0.05);
    setFlyTo((f) => ({ longitude: (x1 + x2) / 2 - span * 0.25, latitude: (y1 + y2) / 2, zoom: Math.min(11, Math.max(5, Math.log2(360 / span) - 1.6)), key: f.key + 1 }));
  }

  function applyPreset(k: PresetKey) {
    const p = PRESETS[k];
    setPreset(k);
    setIntro(false);
    setShifts({});
    setSelectedProjectId(null);
    setEnabled(new Set("utilities" in p ? p.utilities : utilityList.map((u) => u.id)));
    setFlyTo((f) => ({ ...p.fly, key: f.key + 1 }));
    setSelectedId("pair" in p ? pairId(p.pair[0], p.pair[1]) : null);
  }

  const stats = {
    projects: visible.length,
    utilities: new Set(visible.map((p) => p.utility)).size,
    overlaps: overlaps.length,
    both: overlaps.filter((o) => o.actualTimelineOverlap).length,
    highScore: overlaps.filter((o) => o.scores.points >= 3).length,
    interstate: overlaps.filter((o) => o.crossesStateLine).length,
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line bg-[#0a1020] px-4">
        <div className="flex items-center gap-2">
          <Logo />
          <div>
            <div className="text-[15px] font-semibold tracking-tight">GridSync</div>
            <div className="-mt-0.5 flex items-center gap-1.5 text-[10px] text-muted">
              Inter-utility construction coordination
              <span
                className={`rounded px-1 ${source === "postgres" ? "bg-share/15 text-share" : "bg-white/10"}`}
                title={source === "postgres" ? "Projects served from Postgres + PostGIS on Tiger Data" : "Projects served from local JSON files"}
              >
                {source === "postgres" ? "● Tiger Data · PostGIS" : "local data"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-white/[0.03] p-1">
          {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
            <button
              key={k}
              onClick={() => applyPreset(k)}
              className={`rounded-md px-3 py-1 text-left text-xs leading-tight ${preset === k && !intro ? "bg-white/10 text-text" : "text-muted hover:text-text"}`}
            >
              <div className="font-medium">{PRESETS[k].label}</div>
              <div className="text-[10px] opacity-70">{PRESETS[k].sub}</div>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-5 font-mono text-xs">
          <Stat n={stats.projects} label="projects" />
          <Stat n={stats.utilities} label="utilities" />
          <Stat n={stats.overlaps} label="eligible pairs" />
          <Stat n={stats.both} label="timeline overlap" color="var(--share)" />
          <Stat n={stats.highScore} label="score 3–4" color="var(--share)" />
          <Stat n={stats.interstate} label="cross-state" color="var(--interstate)" />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-[340px] shrink-0 flex-col border-r border-line bg-[#0a1020]">
          <div className="space-y-3 border-b border-line p-3">
            <div className="rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-muted">
              Frozen v1 rubric · closest-point gate ≤ {coordinationThresholdsKm.candidate} km · four deterministic points
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <Toggle on={onlyBoth} onClick={() => setOnlyBoth(!onlyBoth)}>Actual timeline overlap</Toggle>
              <Toggle on={onlyCrossState} onClick={() => setOnlyCrossState(!onlyCrossState)}>Cross-state only</Toggle>
              <Toggle on={includeAffiliates} onClick={() => setIncludeAffiliates(!includeAffiliates)}>Include sister utilities</Toggle>
              <Toggle on={density} onClick={() => setDensity(!density)}>3D density</Toggle>
            </div>
          </div>

          <details className="border-b border-line" open={false}>
            <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Utilities compared ({enabled.size}/{utilityList.length})
            </summary>
            <div className="scroll-thin max-h-56 space-y-0.5 overflow-y-auto px-2 pb-2">
              <div className="flex gap-2 px-1 pb-1 text-[11px]">
                <button className="text-sky-300" onClick={() => setEnabled(new Set(utilityList.map((u) => u.id)))}>all</button>
                <button className="text-sky-300" onClick={() => setEnabled(new Set())}>none</button>
              </div>
              {[...utilityList]
                .sort((x, y) => (counts[y.id] ?? 0) - (counts[x.id] ?? 0))
                .map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={enabled.has(u.id)}
                      onChange={() => {
                        const n = new Set(enabled);
                        if (n.has(u.id)) n.delete(u.id);
                        else n.add(u.id);
                        setEnabled(n);
                      }}
                    />
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: u.color }} />
                    <span className="flex-1 truncate">{u.name}</span>
                    <span className="font-mono text-muted">{counts[u.id] ?? 0}</span>
                  </label>
                ))}
            </div>
          </details>

          <div className="flex items-center justify-between px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <span>{selectedProjectId ? "Overlaps for selected project" : "Ranked coordination opportunities"}</span>
            {selectedProjectId && (
              <button className="normal-case text-sky-300" onClick={() => setSelectedProjectId(null)}>
                clear
              </button>
            )}
          </div>
          <div className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
            {list.slice(0, 150).map((o) => (
              <OverlapCard key={o.id} o={o} a={byId[o.a]} b={byId[o.b]} colors={utilities} selected={o.id === selectedId} onClick={() => focusPair(o)} />
            ))}
            {!list.length && <div className="p-4 text-center text-xs text-muted">No eligible coordination pairs with these filters.</div>}
          </div>
          <div className="border-t border-line px-3 py-2 text-[10px] leading-snug text-muted">
            Data: SERTP 2026 Preliminary Expansion Plan · FPL 2026 Ten-Year Site Plan · FDEP siting · EIA-860M (Jul 2026) · utility
            filings · substation locations © OpenStreetMap ·{" "}
            <a href={DATA_URL} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
              normalized data
            </a>{" "}
            &{" "}
            <a href={INGEST_URL} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
              parsers
            </a>{" "}
            on GitHub
          </div>
        </aside>

        {/* Map + timeline */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <MapView
              projects={visible}
              utilities={utilities}
              overlaps={list}
              selectedOverlap={selected}
              selectedProjectId={selectedProjectId}
              activeProjectIds={activeIds}
              maxMiles={coordinationThresholdsMiles.candidate}
              density={density}
              flyTo={flyTo}
              onSelectOverlap={(id) => {
                const o = overlaps.find((x) => x.id === id);
                if (o) focusPair(o);
              }}
              onSelectProject={(id) => {
                setSelectedProjectId(id);
                if (id) setSelectedId(null);
              }}
            />
            <Legend />
            {intro && <Intro onPreset={applyPreset} onClose={() => setIntro(false)} />}
          </div>
          <div className="h-[210px] shrink-0 border-t border-line bg-[#0a1020]">
            <Timeline
              rows={timelineRows}
              utilities={utilities}
              shifts={shifts}
              overlapBand={overlapBand(pa, pb, shifts)}
              activeMonth={activeMonth}
              playing={playing}
              onScrub={(m) => {
                setPlaying(false);
                setActiveMonth(m);
              }}
              onPlay={() => {
                if (!playing && !activeMonth) setActiveMonth("2025-01");
                setPlaying(!playing);
              }}
              title={pa && pb ? "Selected pair and their other overlaps" : selectedProjectId ? "Selected project and its overlaps" : "Top-ranked overlaps"}
            />
          </div>
        </main>

        {/* Detail */}
        {pa && pb && (baseline || current) && (
          <aside className="absolute right-0 top-0 z-10 h-[calc(100%-210px)] w-[390px] border-l border-line bg-panel backdrop-blur-md">
            <OverlapDetail
              overlap={current}
              baseline={baseline}
              a={pa}
              b={pb}
              utilities={utilities}
              shifts={shifts}
              onShift={(id, m) => setShifts((s) => ({ ...s, [id]: m }))}
              onClose={() => setSelectedId(null)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function centerOf(p: Project): [number, number] {
  const c = p.geometry.type === "Point" ? [p.geometry.coordinates] : p.geometry.coordinates;
  return [c.reduce((s, q) => s + q[0], 0) / c.length, c.reduce((s, q) => s + q[1], 0) / c.length];
}

function overlapBand(a: Project | null, b: Project | null, shifts: Record<string, number>) {
  if (!a || !b) return null;
  const wa = windowOf(a, shifts);
  const wb = windowOf(b, shifts);
  const s = wa.start > wb.start ? wa.start : wb.start;
  const e = wa.end < wb.end ? wa.end : wb.end;
  return s <= e ? { start: s, end: e } : null;
}

function Stat({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <div className="text-right leading-tight">
      <div className="text-sm font-semibold" style={{ color }}>
        {n.toLocaleString()}
      </div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 ${on ? "border-share/60 bg-share/15 text-share" : "border-line text-muted hover:text-text"}`}
    >
      {children}
    </button>
  );
}

function OverlapCard({ o, a, b, colors, selected, onClick }: { o: Overlap; a: Project; b: Project; colors: Record<string, { color: string; name: string }>; selected: boolean; onClick: () => void }) {
  const k = KIND[o.kind];
  const hasImpactScenario = Boolean(impactScenarioForPair(a, b));
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border p-2.5 text-left transition ${selected ? "border-share/60 bg-share/10" : "border-line bg-white/[0.02] hover:bg-white/[0.05]"}`}
    >
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md font-mono text-xs font-semibold" style={{ background: `${k.color}22`, color: k.color }}>
          {o.scores.points}/{o.scores.maxPoints}
        </span>
        <div className="min-w-0 flex-1 text-xs leading-snug">
          {[a, b].map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 truncate">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: colors[p.utility]?.color }} />
              <span className="truncate">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-10 font-mono text-[10px] text-muted">
        <span>{o.distanceMiles.toFixed(2)} mi</span>
        <span>{o.actualTimelineOverlap ? `${o.overlapMonths} mo overlap` : o.immediatelySequential ? "immediately sequential" : `${o.gapMonths} mo apart`}</span>
        {o.crossesStateLine && <span className="text-interstate">{a.state}⇄{b.state}</span>}
      </div>
      {hasImpactScenario && (
        <div className="mt-1.5 pl-10">
          <span className="rounded-full border border-share/40 bg-share/10 px-2 py-0.5 text-[10px] font-medium text-share">Impact estimate available</span>
        </div>
      )}
    </button>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-line bg-panel px-3 py-2 text-[11px] backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-5 rounded" style={{ background: KIND.sharing_opportunity.color }} /> coordination opportunity
      </div>
      <div className="mt-1 flex items-center gap-2 text-muted">
        <span className="inline-block w-5 border-t-2 border-dashed border-slate-400" /> approximate route · ○ county-level site
      </div>
    </div>
  );
}

function Intro({ onPreset, onClose }: { onPreset: (k: PresetKey) => void; onClose: () => void }) {
  return (
    <div className="absolute left-1/2 top-8 w-[560px] -translate-x-1/2 rounded-xl border border-line bg-panel p-5 shadow-2xl backdrop-blur-md">
      <button onClick={onClose} className="absolute right-3 top-2 text-muted hover:text-text" aria-label="Close intro">
        ✕
      </button>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-share">FERC Order 1920 · 2024</div>
      <h1 className="mt-1 text-xl font-semibold leading-snug">Utilities plan their construction in isolation.</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        GridSync reads their public plans (regional transmission plans, ten-year site plans, siting filings), puts every project on one
        map and timeline, and flags where neighbors plan to build close together or at the same time. These overlaps suggest
        potential opportunities for outage, permitting, logistics, crew, or equipment coordination.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
          <button key={k} onClick={() => onPreset(k)} className="rounded-lg border border-line bg-white/5 p-3 text-left hover:bg-white/10">
            <div className="text-sm font-medium">{PRESETS[k].label}</div>
            <div className="text-[11px] text-muted">{PRESETS[k].sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0f766e" />
      <path d="M9 22 L16 8 L23 22" stroke="#e6fffb" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
      <path d="M11.5 17 H20.5" stroke="#e6fffb" strokeWidth="2" />
      <circle cx="9" cy="22" r="2.2" fill="#2dd4bf" />
      <circle cx="23" cy="22" r="2.2" fill="#fb923c" />
    </svg>
  );
}

