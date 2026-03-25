import type { EbayListing } from '../ebay/search.js';
import type { GameRecord } from '../dal/types.js';

export interface ScoredListing extends EbayListing {
  relevance: number;
  condition: string;
}

/**
 * Stub scorer: returns the first 10 listings with default scores.
 * Will be replaced with Gemini AI scoring during the DB integration phase.
 */
export async function scoreListings(
  _game: GameRecord,
  listings: EbayListing[],
): Promise<ScoredListing[]> {
  return listings.slice(0, 10).map((listing) => ({
    ...listing,
    relevance: 10,
    condition: 'cib',
  }));
}
