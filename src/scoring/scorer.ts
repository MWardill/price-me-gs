import { GoogleGenAI } from '@google/genai';
import type { EbayListing } from '../ebay/search.js';
import type { GameRecord } from '../dal/types.js';

export interface ScoredListing extends EbayListing {
  relevance: number;
  condition: string;
}

interface GeminiScoredItem {
  itemId: string;
  relevant: boolean;
  condition: 'cib' | 'loose' | 'sealed' | 'other';
  relevance: number;
}

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

For each listing below, determine:
1. Is this listing actually for "${game.title}" on "${game.console}"? (not a different game, not a different platform, not just a case/manual/accessory)
2. What is the condition? One of: "cib" (complete: game + box + manual), "loose" (game only, no box/manual), "sealed" (factory sealed or graded), "other" (bundle, accessories only, manual only, case only, etc.)
3. A relevance score from 1-10 (10 = perfect match for the exact game on the exact platform).

Rules:
- A listing for a sequel or different version of the game (e.g. "Sonic Adventure 2" when looking for "Sonic Adventure") is NOT relevant.
- A listing that is a console bundle containing the game is "other".
- If the listing title says "complete" or mentions manual and case/box, it is likely "cib".
- If the listing title says "disc only", "cart only", or has no mention of box/manual, it is likely "loose".
- If the listing says "sealed", "brand new sealed", or "graded", it is "sealed".
- If unsure about condition, default to "other".

Listings:
${listingLines}

Respond with ONLY a JSON array, no other text or markdown formatting:
[{"itemId": "...", "relevant": true, "condition": "cib", "relevance": 9}, ...]`;
}

function parseGeminiResponse(responseText: string): GeminiScoredItem[] {
  // Strip markdown code fences if present
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed: unknown = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error('Gemini response is not a JSON array');
  }

  return parsed as GeminiScoredItem[];
}

/**
 * Scores listings using Gemini AI to determine relevance and condition.
 * Only CIB (Complete in Box) listings with relevance >= 5 are kept.
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
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error('Gemini returned an empty response');
  }

  const scoredItems = parseGeminiResponse(responseText);

  // Build a lookup map of the original listings by itemId
  const listingMap = new Map(listings.map((l) => [l.itemId, l]));

  // Filter: keep only CIB, relevant, and relevance >= 5
  const results: ScoredListing[] = [];

  for (const scored of scoredItems) {
    const original = listingMap.get(scored.itemId);
    if (!original) {
      continue; // Gemini returned an itemId we didn't send — skip
    }

    if (!scored.relevant) {
      continue;
    }

    if (scored.condition !== 'cib') {
      continue;
    }

    if (scored.relevance < 5) {
      continue;
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
