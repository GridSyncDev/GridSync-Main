import { generateText } from "ai";
import { lowThinking, withModelFallback } from "./ai";
import { resourceLabels } from "./domain/resources";
import type { Project, Utility } from "./domain/schema";
import { windowOf, type Overlap } from "./engine/overlap";
import { KIND, fmtMonth, typeLabel } from "./ui/format";

// Coordination brief for a planner. Gemini only phrases the engine's facts; any number in its
// text that isn't in the fact sheet gets the brief replaced by a deterministic template.

export type Brief = { text: string; source: "ai" | "template" };

export function factSheet(o: Overlap, a: Project, b: Project, shifts: Record<string, number>) {
  const wa = windowOf(a, shifts);
  const wb = windowOf(b, shifts);
  const lines = [
    `Project A: ${a.name} (${typeLabel[a.type]}${a.voltageKv ? `, ${a.voltageKv} kV` : ""}${a.capacityMw ? `, ${a.capacityMw} MW` : ""}), state ${a.state}, construction ${fmtMonth(wa.start)} to ${fmtMonth(wa.end)} (${a.construction.precision})`,
    `Project B: ${b.name} (${typeLabel[b.type]}${b.voltageKv ? `, ${b.voltageKv} kV` : ""}${b.capacityMw ? `, ${b.capacityMw} MW` : ""}), state ${b.state}, construction ${fmtMonth(wb.start)} to ${fmtMonth(wb.end)} (${b.construction.precision})`,
    `Distance: ${o.distanceMiles} miles`,
    o.overlapMonths ? `Construction windows overlap: ${o.overlapMonths} months` : `Gap between construction windows: ${o.gapMonths} months`,
    `Coordination score: ${o.scores.total} out of 100 (spatial ${o.scores.spatial}, schedule ${o.scores.temporal}, resources ${o.scores.resource}, asset ${o.scores.asset})`,
    `Classification: ${KIND[o.kind].label}`,
    "Shared resource types indicate potential competition or coordination opportunities; actual supplier capacity, shortages and project delays are not established.",
    `Crosses a state line: ${o.crossesStateLine ? "yes" : "no"}`,
    `Shared resource needs: ${o.sharedResources.map((r) => resourceLabels[r] ?? r).join("; ") || "none"}`,
    `Constrained (long-lead) shared resources: ${o.scarceShared.map((r) => resourceLabels[r] ?? r).join("; ") || "none"}`,
  ];
  return lines;
}

const instructions = `You write short coordination briefs for utility transmission planners. Two utilities published separate construction plans; an engine found an overlap. Write 3 sentences, plain prose, no lists or markdown:
1) what overlaps (name both utilities and projects, where and when),
2) the potential resource contention or coordination opportunity suggested by the shared resource types,
3) one practical next step (e.g. a joint scheduling call, shared mobilization, joint procurement of the constrained items).
Rules: use only numbers and dates that appear in FACTS, written exactly as given. Do not invent costs, savings, or new numbers. Use "potential resource contention", never "collision risk". Shared resource types do not establish a shortage or a delay. Describe possible competition and coordination opportunities to investigate; do not claim projects will be delayed or that coordination will prevent delays. Be specific and neutral: this is an opportunity to investigate, not proof of waste.`;

function numbersIn(text: string): string[] {
  return text.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? [];
}

export async function brief(o: Overlap, a: Project, b: Project, ua: Utility, ub: Utility, shifts: Record<string, number>): Promise<Brief> {
  const facts = [`Utility A: ${ua.name}`, `Utility B: ${ub.name}`, ...factSheet(o, a, b, shifts)];
  const allowed = new Set(numbersIn(facts.join("\n")));
  try {
    const { text, finishReason } = await withModelFallback("brief", (model) =>
      generateText({
        model,
        instructions,
        prompt: "FACTS:\n" + facts.map((f) => `- ${f}`).join("\n"),
        maxRetries: 0,
        maxOutputTokens: 2000,
        abortSignal: AbortSignal.timeout(12_000),
        providerOptions: lowThinking,
      }),
    );
    const clean = text.trim();
    const bad = numbersIn(clean).filter((n) => !allowed.has(n));
    if (finishReason === "stop" && /[.!?]$/.test(clean) && bad.length === 0) return { text: clean, source: "ai" };
    console.warn("brief: rejected model text", { finishReason, ungrounded: bad });
  } catch (err) {
    console.warn("brief: model unavailable, using template", err instanceof Error ? err.message : err);
  }
  return { text: template(o, a, b, ua, ub, shifts), source: "template" };
}

export function template(o: Overlap, a: Project, b: Project, ua: Utility, ub: Utility, shifts: Record<string, number>): string {
  const wa = windowOf(a, shifts);
  const wb = windowOf(b, shifts);
  const when = o.overlapMonths
    ? `their construction windows overlap by ${o.overlapMonths} months`
    : `their construction windows are ${o.gapMonths} months apart`;
  const shared = o.sharedResources.map((r) => (resourceLabels[r] ?? r).toLowerCase()).join(", ");
  const scarce = o.scarceShared.map((r) => (resourceLabels[r] ?? r).toLowerCase()).join(" and ");
  return [
    `${ua.name}'s ${a.name} (${fmtMonth(wa.start)} to ${fmtMonth(wa.end)}) and ${ub.name}'s ${b.name} (${fmtMonth(wb.start)} to ${fmtMonth(wb.end)}) are ${o.distanceMiles} miles apart, and ${when}.`,
    shared ? `Their shared resource needs (${shared}${scarce ? `, including constrained ${scarce}` : ""}) suggest potential ${o.kind === "collision_risk" ? "resource contention" : "coordination opportunities"}, without establishing an actual shortage or delay.` : "They draw on different resources.",
    o.kind === "collision_risk"
      ? `Next step: a joint scheduling call to investigate resource availability and opportunities for staggered schedules or joint procurement.`
      : `Next step: a joint scheduling call to explore shared crew mobilization and equipment staging.`,
  ].join(" ");
}
