import { ZodError } from "zod";
import { loadDataset } from "@/lib/data";
import { extractDraft } from "@/lib/ingestion/extract";
import { sourceInputSchema } from "@/lib/ingestion/schema";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = sourceInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Provide a utility, source URL, title, publisher and at least 20 characters of public plan text.", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { utilities } = await loadDataset();
  if (!utilities.some((u) => u.id === parsed.data.utility)) {
    return Response.json({ error: "Select an existing GridSync utility." }, { status: 400 });
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json({ error: "Gemini is not configured on the server. Set GOOGLE_GENERATIVE_AI_API_KEY or the existing AI Gateway credentials." }, { status: 503 });
  }
  try {
    const draft = await extractDraft(parsed.data);
    return Response.json({ draft });
  } catch (error) {
    if (error instanceof ZodError || /schema|object|parse/i.test(error instanceof Error ? error.name : "")) {
      return Response.json({ error: "Gemini returned an invalid draft. Try extracting again or use a shorter, clearer excerpt." }, { status: 502 });
    }
    if (error instanceof Error && /timeout|aborted|overload|high demand|rate limit|429|503/i.test(error.message)) {
      return Response.json({ error: "Gemini is busy or timed out after model fallback. Please retry." }, { status: 503 });
    }
    return Response.json({ error: "Extraction failed. Check the server's Gemini configuration and retry." }, { status: 502 });
  }
}
