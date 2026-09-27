"use client";

import type { Project, Utility } from "@/lib/domain/schema";
import { windowOf } from "@/lib/engine/overlap";
import { fromIndex, toIndex } from "@/lib/engine/time";
import { fmtMonth } from "@/lib/ui/format";

const START = toIndex("2024-01");
const END = toIndex("2036-12");
const TODAY = toIndex("2026-09");

interface Props {
  rows: Project[];
  utilities: Record<string, Utility>;
  shifts: Record<string, number>;
  overlapBand: { start: string; end: string } | null;
  activeMonth: string | null;
  playing: boolean;
  onScrub: (month: string | null) => void;
  onPlay: () => void;
  title: string;
}

export default function Timeline({ rows, utilities, shifts, overlapBand, activeMonth, playing, onScrub, onPlay, title }: Props) {
  const W = 1000;
  const labelW = 250;
  const rowH = 22;
  const top = 22;
  const H = top + Math.max(rows.length, 1) * rowH + 6;
  const x = (i: number) => labelW + ((i - START) / (END - START)) * (W - labelW - 8);
  const years = Array.from({ length: 13 }, (_, k) => 2024 + k);

  const scrubFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px < labelW) return;
    const i = Math.round(START + ((px - labelW) / (W - labelW - 8)) * (END - START));
    onScrub(fromIndex(Math.max(START, Math.min(END, i))));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 pt-2 text-xs">
        <button
          onClick={onPlay}
          className="rounded-md border border-line bg-white/5 px-2.5 py-1 font-medium text-text hover:bg-white/10"
          aria-label={playing ? "Pause timeline" : "Play timeline"}
        >
          {playing ? "❚❚ Pause" : "▶ Play construction timeline"}
        </button>
        <span className="text-muted">{title}</span>
        {activeMonth && (
          <>
            <span className="rounded bg-share/15 px-2 py-0.5 font-mono text-share">Active in {fmtMonth(activeMonth)}</span>
            <button onClick={() => onScrub(null)} className="text-muted hover:text-text">
              clear
            </button>
          </>
        )}
        <span className="ml-auto flex items-center gap-3 text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-5 rounded-sm bg-slate-300" /> published
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-5 rounded-sm border border-slate-300 bg-[repeating-linear-gradient(45deg,#cbd5e1_0_2px,transparent_2px_5px)]" /> estimated
          </span>
        </span>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full cursor-crosshair select-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubFromEvent(e);
          }}
          onPointerMove={(e) => e.buttons === 1 && scrubFromEvent(e)}
        >
          <defs>
            <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2.2" height="5" fill="currentColor" />
            </pattern>
          </defs>
          {years.map((y) => (
            <g key={y}>
              <line x1={x(y * 12)} x2={x(y * 12)} y1={top - 6} y2={H} stroke="rgba(148,163,184,0.12)" />
              <text x={x(y * 12) + 3} y={12} fontSize={10} fill="#8b98ad">
                {y}
              </text>
            </g>
          ))}
          {overlapBand && (
            <rect
              x={x(toIndex(overlapBand.start))}
              width={Math.max(2, x(toIndex(overlapBand.end) + 1) - x(toIndex(overlapBand.start)))}
              y={top - 4}
              height={H - top + 4}
              fill="rgba(45,212,191,0.12)"
              stroke="rgba(45,212,191,0.5)"
              strokeDasharray="3 3"
            />
          )}
          <line x1={x(TODAY)} x2={x(TODAY)} y1={top - 6} y2={H} stroke="#f8fafc" strokeOpacity={0.35} strokeDasharray="2 3" />
          <text x={x(TODAY) + 3} y={top - 8} fontSize={9} fill="#cbd5e1" opacity={0.7}>
            today
          </text>
          {rows.map((p, r) => {
            const w = windowOf(p, shifts);
            const color = utilities[p.utility]?.color ?? "#94a3b8";
            const y = top + r * rowH;
            const x0 = x(Math.max(START, toIndex(w.start)));
            const x1 = x(Math.min(END, toIndex(w.end) + 1));
            const shifted = (shifts[p.id] ?? 0) !== 0;
            return (
              <g key={p.id}>
                <circle cx={10} cy={y + rowH / 2} r={4} fill={color} />
                <text x={20} y={y + rowH / 2 + 4} fontSize={11} fill="#e6edf7">
                  {p.name.length > 38 ? p.name.slice(0, 37) + "…" : p.name}
                </text>
                <g style={{ color }}>
                  <rect
                    x={x0}
                    y={y + 4}
                    width={Math.max(2, x1 - x0)}
                    height={rowH - 8}
                    rx={3}
                    fill={p.construction.precision === "published" ? color : "url(#hatch)"}
                    fillOpacity={p.construction.precision === "published" ? 0.85 : 1}
                    stroke={color}
                    strokeWidth={shifted ? 2 : 1}
                    strokeDasharray={shifted ? "4 2" : undefined}
                  />
                </g>
                {shifted && (
                  <text x={x1 + 4} y={y + rowH / 2 + 4} fontSize={10} fill="#fbbf24">
                    {shifts[p.id] > 0 ? "+" : ""}
                    {shifts[p.id]} mo
                  </text>
                )}
              </g>
            );
          })}
          {activeMonth && (
            <line x1={x(toIndex(activeMonth))} x2={x(toIndex(activeMonth))} y1={top - 6} y2={H} stroke="#2dd4bf" strokeWidth={2} />
          )}
        </svg>
      </div>
    </div>
  );
}
