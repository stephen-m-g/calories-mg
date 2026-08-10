import { env } from '../utils/env';
import type { ReferenceUnit } from '../types/models';

// gemini-2.5-flash was retired for new users (confirmed via a live 404 on-device) — gemini-3.6-flash
// is the current default per Google's quickstart as of this writing. If parsing starts failing
// again with a 404 naming the model, that's the model id to check/update first.
const MODEL = 'gemini-3.6-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface ParsedMealItem {
  food: string;
  quantity: number;
  unit: ReferenceUnit;
  /** True when the speaker gave a real amount, false when the model had to guess from a vague
   * phrase. Only a guess is safe to replace with the user's own logged history. */
  amountStated: boolean;
}

const PROMPT = `You are parsing a spoken meal description into structured food entries for a calorie-tracking app.

Extract every distinct food or drink item mentioned. For each item, provide:
- "food": a short, searchable name (e.g. "grilled chicken breast", "white rice", "banana") — strip filler words like "a bowl of" or "some", but keep descriptive words that matter for a nutrition database lookup (e.g. "grilled" vs "fried").
- "quantity": your best-guess numeric amount. If the speaker gives an exact count or measurement, use it. If they're vague ("a bowl of rice", "a glass of orange juice"), estimate a typical serving in grams or milliliters (e.g. a bowl of rice ~150g, a glass of juice ~240ml).
- "unit": one of exactly "g", "ml", "oz", or "each". Use "each" for discrete countable items (eggs, slices of toast, apples). Use "g" for solid foods measured by weight, "ml" for liquids, "oz" only if the speaker explicitly says ounces.
- "amountStated": true if the speaker actually gave the amount (a count like "two eggs", or a measurement like "200 grams"), false if you had to estimate it from a vague phrase like "a bowl of", "some", or no amount at all.

If nothing resembling food is mentioned, return an empty array. Return only the items actually mentioned — do not invent extras.

Transcript: `;

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      food: { type: 'STRING' },
      quantity: { type: 'NUMBER' },
      unit: { type: 'STRING', enum: ['g', 'ml', 'oz', 'each'] },
      amountStated: { type: 'BOOLEAN' },
    },
    required: ['food', 'quantity', 'unit', 'amountStated'],
  },
};

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

/** Sends an edited voice transcript to Gemini and returns structured {food, quantity, unit}
 * items. Deliberately does not ask Gemini for macros — those come from a real nutrition
 * database via a search match, not an LLM guess (see PROJECT_PLAN.md §6.2). */
export async function parseMealTranscript(transcript: string): Promise<ParsedMealItem[]> {
  const trimmed = transcript.trim();
  if (!trimmed) return [];

  const response = await fetch(`${ENDPOINT}?key=${env.geminiApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${PROMPT}"${trimmed}"` }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini parsing failed (${response.status}): ${errText}`);
  }

  const data: GeminiResponse = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned no parseable content');
  }

  const parsed = JSON.parse(text) as ParsedMealItem[];
  return parsed.filter((item) => item.food?.trim() && item.quantity > 0);
}
