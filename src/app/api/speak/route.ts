import { elevenLabs } from '@ai-sdk/elevenlabs';
import { generateSpeech } from 'ai';

// Explanations are a few sentences; the cap keeps a public endpoint from burning voice credits.
const maxChars = 800;

// Text-to-speech. Without ELEVENLABS_API_KEY the client falls back to the browser's voice.
export async function POST(req: Request) {
  if (!process.env.ELEVENLABS_API_KEY) return new Response('ELEVENLABS_API_KEY not set', { status: 501 });

  const { text }: { text?: string } = await req.json().catch(() => ({}));
  if (!text?.trim()) return new Response('Missing "text"', { status: 400 });

  try {
    const { audio } = await generateSpeech({
      // eleven_flash_v2_5: lowest latency.
      model: elevenLabs.speech(process.env.ELEVENLABS_TTS_MODEL ?? 'eleven_flash_v2_5'),
      voice: process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
      text: text.slice(0, maxChars),
    });
    return new Response(audio.uint8Array as BodyInit, { headers: { 'Content-Type': audio.mediaType } });
  } catch (err) {
    console.error('speak failed', err);
    return new Response('Speech failed', { status: 502 });
  }
}
