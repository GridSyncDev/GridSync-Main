import { generateObject } from "ai";
import { lowThinking, withModelFallback } from "../ai";
import { groundDraft } from "./grounding";
import { draftSchema, type SourceInput } from "./schema";

const instructions = `Extract ONE concrete future utility construction project from the pasted public plan text.
Return the structured draft fields in the requested schema. For every non-null value, supply
a verbatim supporting quote copied from the pasted text. Leave unsupported or missing values
null, including unknown end dates, voltage, coordinates, status and equipment. Keep schedule
expressions exactly as published (for example "Q3 2028"); do not turn a quarter into a month.
Only include coordinates when both numeric latitude and longitude appear explicitly in the
source. Project type and status are suggestions for human review. Do not calculate distance,
overlap, scarcity, coordination scores or inferred resource tags.`;

export async function extractDraft(source: SourceInput) {
  const result = await withModelFallback("ingestion", (model) =>
    generateObject({
      model,
      schema: draftSchema,
      schemaName: "utility_project_draft",
      system: instructions,
      prompt: `Utility: ${source.utility}\nSource: ${source.title}\n\nPASTED PUBLIC PLAN TEXT:\n${source.text}`,
      temperature: 0,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(15_000),
      providerOptions: lowThinking,
    }),
  );
  return groundDraft(result.object, source.text);
}
