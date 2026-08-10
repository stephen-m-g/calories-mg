import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { env } from '../utils/env';
import type { ReferenceUnit } from '../types/models';

const MODEL = 'gemini-3.6-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Phone photos run several megabytes, and base64 inflates them by a third on top of that.
// A meal fills the frame, so detail past ~1024px buys nothing for recognition and only costs
// upload time on a phone connection.
const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.7;

export interface VisionMealItem {
  food: string;
  quantity: number;
  unit: ReferenceUnit;
  /** 0-1, the model's own certainty about the identification. */
  confidence: number;
  /** Runner-up identifications, for when the top guess is wrong. */
  alternatives: string[];
}

const PROMPT = `You are identifying the contents of a meal photo for a calorie-tracking app.

List every distinct food and drink you can see. For each one provide:
- "food": a short, searchable name (e.g. "grilled chicken breast", "white rice", "ground beef"). Include preparation when you can tell (grilled vs fried), since it changes the nutrition significantly. Do not include brand names unless packaging is clearly legible.
- "quantity": your best estimate of the amount visible, using common visual references (a deck of cards ~ 85g of meat, a closed fist ~ 1 cup). Estimate what is actually on the plate, not a standard serving.
- "unit": exactly one of "g", "ml", "oz", or "each". Use "each" for discrete countable items (eggs, slices of pizza, chicken wings, apples). Use "g" for solid foods by weight, "ml" for drinks.
- "confidence": 0 to 1, how certain you are this identification is correct. Be honest — use below 0.6 when the food is partially hidden, ambiguous, or could easily be something else.
- "alternatives": 2-3 other foods this could plausibly be, most likely first. For foods that vary mainly by fat or preparation, offer those variants (e.g. for ground beef: "ground beef 80/20", "ground beef 90/10"). Empty array only if you are certain.

Judge portions from the photo rather than assuming a typical serving. If the image contains no food at all, return an empty array.`;

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      food: { type: 'STRING' },
      quantity: { type: 'NUMBER' },
      unit: { type: 'STRING', enum: ['g', 'ml', 'oz', 'each'] },
      confidence: { type: 'NUMBER' },
      alternatives: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['food', 'quantity', 'unit', 'confidence', 'alternatives'],
  },
};

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/** Downscales and re-encodes a photo, returning base64 JPEG suitable for an inline API upload. */
async function prepareImage(uri: string): Promise<string> {
  const image = await ImageManipulator.manipulate(uri)
    .resize({ width: MAX_DIMENSION })
    .renderAsync();
  const result = await image.saveAsync({
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!result.base64) {
    throw new Error('Could not read the photo for analysis');
  }
  return result.base64;
}

/**
 * Sends a meal photo to Gemini and returns the foods it identifies.
 *
 * Like the voice pipeline, this deliberately does not ask for macros — the returned names are
 * matched against USDA/Open Food Facts so logged nutrition always comes from a real database
 * rather than a model's recollection. Portions are the one estimate that has to come from the
 * model, since nothing else can see the plate.
 */
export async function analyzeMealPhoto(imageUri: string): Promise<VisionMealItem[]> {
  const base64 = await prepareImage(imageUri);

  const response = await fetch(`${ENDPOINT}?key=${env.geminiApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: PROMPT }, { inlineData: { mimeType: 'image/jpeg', data: base64 } }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Photo analysis failed (${response.status}): ${errText}`);
  }

  const data: GeminiResponse = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned no parseable content');
  }

  const parsed = JSON.parse(text) as VisionMealItem[];
  return parsed
    .filter((item) => item.food?.trim() && item.quantity > 0)
    .map((item) => ({
      ...item,
      // Clamp rather than trust: a confidence outside 0-1 would break the low-confidence flag.
      confidence: Math.min(Math.max(item.confidence ?? 0, 0), 1),
      alternatives: (item.alternatives ?? []).filter((a) => a?.trim()).slice(0, 3),
    }));
}
