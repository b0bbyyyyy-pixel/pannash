/**
 * Centralised xAI (Grok) client.
 * Uses the OpenAI-compatible xAI API so the `openai` SDK works as-is —
 * only the baseURL and API key differ.
 *
 * Models:
 *   GROK_MODEL        – main reasoning model   (replaces gpt-4o)
 *   GROK_MINI_MODEL   – fast / cheap model      (replaces gpt-4o-mini)
 *   GROK_VISION_MODEL – vision / image reading  (replaces gpt-4o for OCR)
 */
import OpenAI from 'openai';

export const XAI_BASE_URL      = 'https://api.x.ai/v1';
export const GROK_MODEL        = 'grok-3';
export const GROK_MINI_MODEL   = 'grok-3-mini';
export const GROK_VISION_MODEL = 'grok-2-vision-1212';

/** Create an xAI client (uses `XAI_API_KEY` env var). */
export function getAIClient(): OpenAI {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY is not set in environment variables.');
  return new OpenAI({ apiKey, baseURL: XAI_BASE_URL });
}
