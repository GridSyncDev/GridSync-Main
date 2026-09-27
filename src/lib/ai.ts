import { google, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

// Model IDs are "provider/model". If GOOGLE_GENERATIVE_AI_API_KEY is set, google/* models call the
// Gemini API directly (free AI Studio key, no card); otherwise they go through Vercel AI Gateway.
const direct = (id: string) => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY) && id.startsWith('google/');
const name = (id: string) => id.slice('google/'.length);

export const resolveModel = (id: string): LanguageModel => (direct(id) ? google(name(id)) : id);

const modelIds = () =>
  (process.env.GEMINI_MODELS ?? 'google/gemini-3.6-flash,google/gemini-3.5-flash-lite,google/gemini-3.1-flash-lite')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

// Gemini models are sometimes briefly overloaded ("high demand"). Try each model in turn instead of
// stalling the demo; callers should give each attempt its own time limit.
export async function withModelFallback<T>(label: string, call: (model: LanguageModel) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const id of modelIds()) {
    try {
      return await call(resolveModel(id));
    } catch (err) {
      console.warn(`${label}: ${id} failed, trying next model`, err instanceof Error ? err.message : err);
      lastError = err;
    }
  }
  throw lastError;
}

// Our tasks (reading numbers, short explanations) don't need deep reasoning; this cuts latency a lot.
export const lowThinking = { google: { thinkingConfig: { thinkingLevel: 'low' } } satisfies GoogleLanguageModelOptions };
