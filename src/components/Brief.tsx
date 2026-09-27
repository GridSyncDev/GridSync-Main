"use client";

import { useEffect, useRef, useState } from "react";
import type { Project, Utility } from "@/lib/domain/schema";
import type { Overlap } from "@/lib/engine/overlap";

interface Props {
  overlap: Overlap;
  a: Project;
  b: Project;
  utilities: Record<string, Utility>;
  shifts: Record<string, number>;
  params: { maxMiles: number; maxGapMonths: number; regionMiles: number };
}

export default function Brief({ a, b, shifts, params }: Props) {
  const [state, setState] = useState<{ text: string; source: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  // Stop narration when the panel goes away (the parent remounts this per pair + schedule).
  useEffect(() => () => audio.current?.pause(), []);

  async function generate() {
    setLoading(true);
    try {
      const r = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a: a.id, b: b.id, shifts, ...params }),
      });
      const j = await r.json();
      setState(r.ok ? { text: j.text, source: j.source } : { text: j.error ?? "Brief unavailable", source: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function speak() {
    if (!state) return;
    if (speaking) {
      audio.current?.pause();
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    const r = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: state.text }) });
    if (r.ok) {
      const el = new Audio(URL.createObjectURL(await r.blob()));
      audio.current = el;
      el.onended = () => setSpeaking(false);
      await el.play();
    } else {
      const u = new SpeechSynthesisUtterance(state.text);
      u.onend = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white/[0.03] p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Coordination brief</h3>
        {state?.source && state.source !== "error" && (
          <span className="text-[10px] text-muted">{state.source === "ai" ? "Gemini · numbers verified" : "template"}</span>
        )}
      </div>
      {state ? (
        <>
          <p className="mt-2 text-[13px] leading-relaxed">{state.text}</p>
          {state.source !== "error" && (
            <button onClick={speak} className="mt-2 text-xs text-sky-300 hover:underline">
              {speaking ? "■ Stop" : "🔊 Listen (ElevenLabs)"}
            </button>
          )}
        </>
      ) : (
        <button
          onClick={generate}
          disabled={loading}
          className="mt-2 w-full rounded-md border border-line bg-white/5 py-2 text-xs font-medium hover:bg-white/10 disabled:opacity-60"
        >
          {loading ? "Writing brief…" : "✦ Draft a coordination brief for both planners"}
        </button>
      )}
    </section>
  );
}
