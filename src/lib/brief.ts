import { generateText } from "ai";
import { lowThinking, withModelFallback } from "./ai";
import { resourceLabels } from "./domain/resources";
import type { Project, Utility } from "./domain/schema";
import { windowOf, type Overlap } from "./engine/overlap";
import { KIND, fmtMonth, typeLabel } from "./ui/format";

// Gemini may phrase engine facts, but it never creates or changes the score.
export type Brief = { text: string; source: "ai" | "template" };

const POINT_LABELS: Record<keyof Overlap["scores"]["breakdown"], string> = {
  outageCoordination: "crossing/outage coordination",
  rowAccessPermitting: "right-of-way/access/permitting",
  siteLogistics: "site logistics",
  crewEquipment: "crew/equipment mobilization",
};

export function factSheet(o: Overlap, a: Project, b: Project, shifts: Record<string, number>) {
  const wa = windowOf(a, shifts);
  const wb = windowOf(b, shifts);
  const timing = o.actualTimelineOverlap
    ? `${o.scheduleIsEstimated ? "Estimated construction windows" : "Construction windows"} overlap: ${o.overlapMonths} months`
    : o.immediatelySequential
      ? `${o.scheduleIsEstimated ? "Estimated construction schedules are" : "Construction schedules are"} immediately sequential; this is not an overlapping construction window`
      : `${o.scheduleIsEstimated ? "Estimated gap" : "Gap"} between construction windows: ${o.gapMonths} months`;
  const earned = Object.entries(o.scores.breakdown)
    .filter(([, item]) => item.earned)
    .map(([key]) => POINT_LABELS[key as keyof typeof POINT_LABELS]);
  return [
    `Project A: ${a.name} (${typeLabel[a.type]}${a.voltageKv ? `, ${a.voltageKv} kV` : ""}${a.capacityMw ? `, ${a.capacityMw} MW` : ""}), state ${a.state}, construction ${fmtMonth(wa.start)} to ${fmtMonth(wa.end)} (${a.construction.precision})`,
    `Project B: ${b.name} (${typeLabel[b.type]}${b.voltageKv ? `, ${b.voltageKv} kV` : ""}${b.capacityMw ? `, ${b.capacityMw} MW` : ""}), state ${b.state}, construction ${fmtMonth(wb.start)} to ${fmtMonth(wb.end)} (${b.construction.precision})`,
    `Closest-point distance: ${o.distanceMiles.toFixed(3)} miles (${o.distanceKm.toFixed(3)} kilometers)`,
    timing,
    `Raw coordination score: ${o.scores.points} out of ${o.scores.maxPoints}`,
    `Normalized display score: ${o.scores.normalized} out of 100`,
    `Points earned: ${earned.join("; ") || "none"}`,
    `Classification: ${KIND[o.kind].label}`,
    "The score identifies potential coordination opportunities; it does not establish shortages, delays, savings, or resource availability.",
    `Crosses a state line: ${o.crossesStateLine ? "yes" : "no"}`,
    `Shared resource tags (descriptive, not scored): ${o.sharedResources.map((resource) => resourceLabels[resource] ?? resource).join("; ") || "none"}`,
  ];
}

const instructions = `You write short coordination briefs for utility transmission planners. Two utilities published separate construction plans; a deterministic engine identified a coordination opportunity. Write 3 sentences, plain prose, no lists or markdown:
1) name both utilities and projects and accurately state the closest-point distance and schedule relationship,
2) summarize only the coordination points that were earned,
3) propose one practical investigation or coordination step.
Rules: use only numbers and dates in FACTS, exactly as given. Do not invent costs, savings, shortages, delays, confirmed sharing, or new numbers. Say "coordination opportunity," never "collision risk." Immediately sequential schedules are not overlapping construction windows. If FACTS says a schedule is estimated, make that uncertainty explicit. Resource tags are descriptive and do not affect the score.`;

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
        prompt: "FACTS:\n" + facts.map((fact) => `- ${fact}`).join("\n"),
        maxRetries: 0,
        maxOutputTokens: 2000,
        abortSignal: AbortSignal.timeout(12_000),
        providerOptions: lowThinking,
      }),
    );
    const clean = text.trim();
    const ungrounded = numbersIn(clean).filter((number) => !allowed.has(number));
    if (finishReason === "stop" && /[.!?]$/.test(clean) && ungrounded.length === 0) return { text: clean, source: "ai" };
    console.warn("brief: rejected model text", { finishReason, ungrounded });
  } catch (error) {
    console.warn("brief: model unavailable, using template", error instanceof Error ? error.message : error);
  }
  return { text: template(o, a, b, ua, ub, shifts), source: "template" };
}

export function template(o: Overlap, a: Project, b: Project, ua: Utility, ub: Utility, shifts: Record<string, number>): string {
  const wa = windowOf(a, shifts);
  const wb = windowOf(b, shifts);
  const timing = o.actualTimelineOverlap
    ? `${o.scheduleIsEstimated ? "their estimated construction windows" : "their construction windows"} overlap by ${o.overlapMonths} months`
    : o.immediatelySequential
      ? `${o.scheduleIsEstimated ? "their estimated schedules" : "their schedules"} are immediately sequential rather than overlapping`
      : `${o.scheduleIsEstimated ? "their estimated construction windows" : "their construction windows"} are ${o.gapMonths} months apart`;
  const earned = Object.values(o.scores.breakdown).filter((item) => item.earned).map((item) => item.explanation);
  const opportunity = earned.length
    ? earned.join(" ")
    : "The frozen rubric assigns no specific coordination point to this geographically eligible pair.";
  return [
    `${ua.name}'s ${a.name} (${fmtMonth(wa.start)} to ${fmtMonth(wa.end)}, ${a.construction.precision}) and ${ub.name}'s ${b.name} (${fmtMonth(wb.start)} to ${fmtMonth(wb.end)}, ${b.construction.precision}) have a ${o.distanceMiles.toFixed(3)}-mile closest-point distance, and ${timing}.`,
    opportunity,
    "Next step: confirm schedule and site details in a joint planning call before drawing conclusions about resource availability, delays, or savings.",
  ].join(" ");
}
