import type { Project, ProjectType } from "./schema";

// Resource ontology: what labor, equipment and materials each kind of project draws on.
// First draft — owned by the EE teammate. Tags are plain strings so the matrix can grow
// without touching the engine.

export const resourceLabels: Record<string, string> = {
  line_crews: "Transmission line crews",
  ehv_line_crews: "EHV (345 kV+) line crews",
  substation_electricians: "Substation electricians / relay techs",
  civil_crews: "Civil & foundation crews",
  row_clearing: "Right-of-way & vegetation clearing",
  cranes: "Cranes / heavy lift",
  heavy_haul: "Heavy-haul transport",
  stringing_equipment: "Conductor pulling & tensioning rigs",
  conductor: "Conductor & hardware",
  structures: "Poles / towers",
  power_transformers: "Large power transformers",
  hv_breakers: "HV breakers & switchgear",
  pv_installers: "Solar racking & module installers",
  battery_integrators: "Battery / inverter integrators",
  gas_turbine_crews: "Turbine & mechanical crews",
  distribution_crews: "Distribution line crews",
  permitting_environmental: "Permitting & environmental surveys",
};

const byType: Record<ProjectType, string[]> = {
  transmission_line_new: ["line_crews", "row_clearing", "stringing_equipment", "conductor", "structures", "cranes", "civil_crews", "permitting_environmental"],
  transmission_line_upgrade: ["line_crews", "stringing_equipment", "conductor", "structures", "cranes"],
  substation_new: ["substation_electricians", "civil_crews", "power_transformers", "hv_breakers", "cranes", "heavy_haul", "permitting_environmental"],
  substation_upgrade: ["substation_electricians", "hv_breakers", "power_transformers", "cranes", "heavy_haul"],
  generation_solar: ["pv_installers", "civil_crews", "substation_electricians", "power_transformers", "permitting_environmental"],
  generation_storage: ["battery_integrators", "civil_crews", "substation_electricians", "power_transformers"],
  generation_gas: ["gas_turbine_crews", "civil_crews", "cranes", "heavy_haul", "power_transformers", "hv_breakers", "permitting_environmental"],
  generation_other: ["civil_crews", "cranes", "substation_electricians", "power_transformers"],
  distribution: ["distribution_crews", "civil_crews"],
  other: ["civil_crews"],
};

// Resources with long lead times or thin labor pools: sharing them across overlapping
// projects may warrant investigating availability and coordination opportunities.
export const scarceResources = new Set(["power_transformers", "hv_breakers", "ehv_line_crews", "heavy_haul"]);

export function resourcesFor(p: Project): string[] {
  const tags = new Set(p.resources ?? byType[p.type]);
  if (p.voltageKv !== null && p.voltageKv >= 345 && tags.has("line_crews")) {
    tags.delete("line_crews");
    tags.add("ehv_line_crews");
  }
  return [...tags].sort();
}

// Voltage classes used for asset similarity.
export function voltageClass(kv: number | null): "distribution" | "hv" | "ehv" | null {
  if (kv === null) return null;
  if (kv < 69) return "distribution";
  if (kv < 345) return "hv";
  return "ehv";
}
