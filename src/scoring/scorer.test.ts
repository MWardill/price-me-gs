import { describe, expect, it } from 'vitest';
import type { EbayListing } from '../ebay/search.js';
import type { GameRecord } from '../dal/types.js';
import { scoreListings } from './scorer.js';

const game: GameRecord = { id: 1, title: 'Sonic Adventure', console: 'Dreamcast' };

function makeListing(id: number): EbayListing {
  return { itemId: `item${id}`, title: `Listing ${id}`, price: 10 + id, currency: 'GBP' };
}

describe('scoreListings (stub)', () => {
  it('returns max 10 listings when given more than 10', async () => {
    const listings = Array.from({ length: 20 }, (_, i) => makeListing(i));
    const result = await scoreListings(game, listings);
    expect(result).toHaveLength(10);
  });

  it('returns all listings when given fewer than 10', async () => {
    const listings = Array.from({ length: 5 }, (_, i) => makeListing(i));
    const result = await scoreListings(game, listings);
    expect(result).toHaveLength(5);
  });

  it('returns exactly 10 listings when given exactly 10', async () => {
    const listings = Array.from({ length: 10 }, (_, i) => makeListing(i));
    const result = await scoreListings(game, listings);
    expect(result).toHaveLength(10);
  });

  it('preserves original listing data on each returned item', async () => {
    const listings = [makeListing(0)];
    const result = await scoreListings(game, listings);
    expect(result[0].itemId).toBe('item0');
    expect(result[0].title).toBe('Listing 0');
    expect(result[0].price).toBe(10);
    expect(result[0].currency).toBe('GBP');
  });

  it('sets relevance and condition on every returned item', async () => {
    const listings = [makeListing(0), makeListing(1)];
    const result = await scoreListings(game, listings);
    for (const item of result) {
      expect(item.relevance).toBe(10);
      expect(item.condition).toBe('cib');
    }
  });

  it('returns an empty array when given no listings', async () => {
    const result = await scoreListings(game, []);
    expect(result).toEqual([]);
  });
});
