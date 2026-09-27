import type { Project, ProjectType } from "../domain/schema";

export const typeLabel: Record<ProjectType, string> = {
  transmission_line_new: "New transmission line",
  transmission_line_upgrade: "Line rebuild / reconductor",
  substation_new: "New substation",
  substation_upgrade: "Substation upgrade",
  generation_solar: "Solar plant",
  generation_storage: "Battery storage",
  generation_gas: "Gas plant",
  generation_other: "Generation",
  distribution: "Distribution",
  other: "Other",
};

export const statusLabel: Record<Project["status"], string> = {
  planned: "Planned",
  permitting: "Permitting",
  approved: "Approved",
  under_construction: "Under construction",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return `${MONTHS[mo - 1]} ${y}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const KIND = {
  sharing_opportunity: { label: "Sharing opportunity", color: "#2dd4bf", rgb: [45, 212, 191] as [number, number, number] },
  collision_risk: { label: "Potential resource contention", color: "#fb923c", rgb: [251, 146, 60] as [number, number, number] },
};
