import type { Project, ProjectType } from "./schema";

export type ProjectFamily = "transmission" | "substation";

// Arrays deliberately permit a project type to belong to multiple families later.
const familiesByType: Partial<Record<ProjectType, readonly ProjectFamily[]>> = {
  transmission_line_new: ["transmission"],
  transmission_line_upgrade: ["transmission"],
  substation_new: ["substation"],
  substation_upgrade: ["substation"],
};

export function projectFamiliesFor(project: Project): ProjectFamily[] {
  return [...(familiesByType[project.type] ?? [])];
}

export function sharedProjectFamilies(a: Project, b: Project): ProjectFamily[] {
  const bFamilies = new Set(projectFamiliesFor(b));
  return projectFamiliesFor(a).filter((family) => bFamilies.has(family));
}
