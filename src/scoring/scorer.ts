import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import type { EbayListing } from '../ebay/search.js';
import type { GameRecord } from '../dal/types.js';

export interface ScoredListing extends EbayListing {
  relevance: number;
  condition: string;
}

interface GeminiScoredItem {
  itemId: string;
  condition: 'cib';
  relevance: number;
}

/** Schema for the Gemini JSON response — only CIB + relevant items returned */
const responseSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      itemId: { type: Type.STRING, description: 'The itemId of the listing' },
      condition: {
        type: Type.STRING,
        enum: ['cib'],
        description: 'Must be "cib" (complete in box)',
      },
      relevance: {
        type: Type.INTEGER,
        description: 'Relevance score from 1-10',
      },
    },
    required: ['itemId', 'condition', 'relevance'],
  },
};

function buildPrompt(game: GameRecord, listings: EbayListing[]): string {
  const listingLines = listings
    .map((l, i) => {
      const parts = [
        `${i + 1}. [itemId: ${l.itemId}]`,
        `Title: "${l.title}"`,
      ];
      if (l.condition) {
        parts.push(`eBay Condition: "${l.condition}"`);
      }
      if (l.shortDescription) {
        parts.push(`Description: "${l.shortDescription}"`);
      }
      return parts.join(' | ');
    })
    .join('\n');

  return `You are evaluating eBay listings for the video game "${game.title}" on "${game.console}".

From the listings below, return ONLY the ones that meet ALL of these criteria:
1. The listing is actually for "${game.title}" on "${game.console}" (not a different game, sequel, different platform, or just a case/manual/accessory)
2. The listing is CIB (Complete in Box: game + box + manual)
3. The relevance score is 7 or higher (on a 1-10 scale where 10 = perfect match)

Do NOT include listings that are:
- A different game (e.g. "Sonic Adventure 2" when looking for "Sonic Adventure")
- Loose (disc/cart only, no box or manual)
- Sealed or graded
- A console bundle, accessories only, manual only, or case only
- Unclear or uncertain condition (when in doubt, exclude it)

If NO listings meet the criteria, return an empty array [].

Listings:
${listingLines}`;
}

function parseGeminiResponse(responseText: string): GeminiScoredItem[] {
  const parsed: unknown = JSON.parse(responseText);

  if (!Array.isArray(parsed)) {
    throw new Error('Gemini response is not a JSON array');
  }

  for (const [i, item] of parsed.entries()) {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Gemini response item ${i} is not an object`);
    }
    if (typeof item.itemId !== 'string') {
      throw new Error(`Gemini response item ${i} missing string "itemId"`);
    }
    if (item.condition !== 'cib') {
      throw new Error(`Gemini response item ${i} has invalid "condition": ${item.condition}`);
    }
    if (typeof item.relevance !== 'number') {
      throw new Error(`Gemini response item ${i} missing numeric "relevance"`);
    }
  }

  return parsed as GeminiScoredItem[];
}

/**
 * Scores listings using Gemini AI to determine relevance and condition.
 * Only CIB (Complete in Box) listings with relevance >= 7 are returned.
 * Uses structured output (JSON schema) for faster, more reliable responses.
 * Throws if Gemini fails — no fallback to avoid bad pricing data.
 */
export async function scoreListings(
  game: GameRecord,
  listings: EbayListing[],
  apiKey: string,
  model: string,
): Promise<ScoredListing[]> {
  if (listings.length === 0) {
    return [];
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(game, listings);

  console.log(`  Calling Gemini to score ${listings.length} listing(s)...`);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error('Gemini returned an empty response');
  }

  const scoredItems = parseGeminiResponse(responseText);

  // Build a lookup map of the original listings by itemId
  const listingMap = new Map(listings.map((l) => [l.itemId, l]));

  const results: ScoredListing[] = [];

  for (const scored of scoredItems) {
    const original = listingMap.get(scored.itemId);
    if (!original) {
      continue; // Gemini returned an itemId we didn't send — skip
    }

    if (scored.relevance < 7) {
      continue; // Belt-and-braces: prompt asks for >= 7 but double-check
    }

    results.push({
      ...original,
      relevance: scored.relevance,
      condition: scored.condition,
    });
  }

  console.log(`  Gemini kept ${results.length}/${listings.length} listing(s) (CIB + relevant)`);

  return results;
}
