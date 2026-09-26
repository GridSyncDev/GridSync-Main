import { loadDataset } from "@/lib/data";
import { resourcesFor } from "@/lib/domain/resources";

export async function GET() {
  const { utilities, projects } = await loadDataset();
  return Response.json({
    utilities,
    projects: projects.map((p) => ({ ...p, resources: resourcesFor(p) })),
  });
}
