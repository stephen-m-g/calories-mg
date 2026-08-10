import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { env } from '../utils/env';
import type { ReferenceUnit } from '../types/models';

const MODEL = 'gemini-3.6-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Labels are dense small print, so this keeps more detail than meal photos do — downscaling a
// nutrition panel too far is what turns "17g" into "1lg".
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export interface LabelNutrition {
  /** Product name if legible on the packaging — labels alone often don't carry one. */
  name: string | null;
  servingAmount: number;
  servingUnit: ReferenceUnit;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

const PROMPT = `You are reading a nutrition facts label from a photo of packaged food.

Report the values exactly as printed for ONE serving — do not convert to per-100g, and do not use the "per container" column if both are shown.

- "name": the product name if it is legible in the photo, otherwise null. Do not guess a name from the nutrition numbers.
- "servingAmount" and "servingUnit": the serving size, e.g. 30 and "g". If the serving is given as a count of items (e.g. "2 cookies"), use the count with unit "each". Prefer a metric weight or volume when the label shows one.
- "calories", "proteinG", "carbsG", "fatG": per serving. Use 0 if the label clearly shows 0.
- "fiberG", "sugarG", "sodiumMg": per serving, or null if not shown on the label.

Sodium must be in milligrams. If any value is unreadable or missing, use null rather than estimating it — a wrong number here is worse than a blank one the user can fill in.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', nullable: true },
    servingAmount: { type: 'NUMBER' },
    servingUnit: { type: 'STRING', enum: ['g', 'ml', 'oz', 'each'] },
    calories: { type: 'NUMBER' },
    proteinG: { type: 'NUMBER' },
    carbsG: { type: 'NUMBER' },
    fatG: { type: 'NUMBER' },
    fiberG: { type: 'NUMBER', nullable: true },
    sugarG: { type: 'NUMBER', nullable: true },
    sodiumMg: { type: 'NUMBER', nullable: true },
  },
  required: ['servingAmount', 'servingUnit', 'calories', 'proteinG', 'carbsG', 'fatG'],
};

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * Reads a nutrition label into structured macros.
 *
 * This is the fallback when a scanned barcode isn't in any database. A label describes a food
 * but can't identify one — it carries no unique code and frequently not even a product name —
 * so the result is always paired with the scanned barcode and shown to the user for correction
 * before being saved as a custom food.
 */
export async function extractNutritionLabel(imageUri: string): Promise<LabelNutrition> {
  const image = await ImageManipulator.manipulate(imageUri)
    .resize({ width: MAX_DIMENSION })
    .renderAsync();
  const prepared = await image.saveAsync({
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!prepared.base64) {
    throw new Error('Could not read the label photo');
  }

  const response = await fetch(`${ENDPOINT}?key=${env.geminiApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: 'image/jpeg', data: prepared.base64 } },
          ],
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
    throw new Error(`Label reading failed (${response.status}): ${errText}`);
  }

  const data: GeminiResponse = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned no parseable content');
  }

  const parsed = JSON.parse(text) as Partial<LabelNutrition>;
  if (!Number.isFinite(parsed.servingAmount) || (parsed.servingAmount ?? 0) <= 0) {
    throw new Error("Couldn't read a serving size from that label. Try a straighter, closer photo.");
  }

  return {
    name: parsed.name?.trim() || null,
    servingAmount: parsed.servingAmount as number,
    servingUnit: parsed.servingUnit ?? 'g',
    calories: parsed.calories ?? 0,
    proteinG: parsed.proteinG ?? 0,
    carbsG: parsed.carbsG ?? 0,
    fatG: parsed.fatG ?? 0,
    fiberG: parsed.fiberG ?? null,
    sugarG: parsed.sugarG ?? null,
    sodiumMg: parsed.sodiumMg ?? null,
  };
}
