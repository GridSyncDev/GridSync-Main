import { loadDataset } from "@/lib/data";
import { compare, defaultParams } from "@/lib/engine/overlap";
import { groundDraft } from "@/lib/ingestion/grounding";
import { validateReviewedProject } from "@/lib/ingestion/normalize";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.sourceText !== "string" || body.sourceText.trim().length < 20 || !body.draft) {
    return Response.json({ error: "Extract a draft from pasted public-plan text before analysis." }, { status: 400 });
  }
  let grounded;
  try {
    grounded = groundDraft(body.draft, body.sourceText);
  } catch {
    return Response.json({ error: "The extracted draft is malformed. Run extraction again." }, { status: 400 });
  }
  const validation = validateReviewedProject(body.review, grounded);
  if (!validation.success) return Response.json({ error: "Complete the required review fields.", errors: validation.errors }, { status: 422 });

  const { projects, utilities } = await loadDataset();
  const project = validation.project;
  if (!utilities.some((utility) => utility.id === project.utility)) {
    return Response.json({ error: "Select an existing GridSync utility.", errors: { utility: "Unknown utility" } }, { status: 422 });
  }
  if (projects.some((existing) => existing.id === project.id)) {
    return Response.json({ error: "Choose a new project ID.", errors: { id: "This project ID already exists" } }, { status: 422 });
  }
  const utilityById = new Map(utilities.map((utility) => [utility.id, utility]));
  const parents = Object.fromEntries(utilities.map((utility) => [utility.id, utility.parent]));
  const matches = projects.flatMap((existing) => {
    const overlap = compare(project, existing, { ...defaultParams, parents });
    return overlap ? [{ overlap, project: existing, utility: utilityById.get(existing.utility) }] : [];
  }).sort((a, b) => b.overlap.scores.total - a.overlap.scores.total);

  return Response.json({ project, count: matches.length, matches: matches.slice(0, 10) });
}
