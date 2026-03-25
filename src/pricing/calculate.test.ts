import { describe, expect, it } from 'vitest';
import type { ScoredListing } from '../scoring/scorer.js';
import { calculatePrice } from './calculate.js';

function makeListings(prices: number[]): ScoredListing[] {
  return prices.map((price, i) => ({
    itemId: `item${i}`,
    title: `Listing ${i}`,
    price,
    currency: 'GBP',
    relevance: 10,
    condition: 'cib',
  }));
}

describe('calculatePrice', () => {
  it('returns null when fewer than 3 listings are given', () => {
    expect(calculatePrice(makeListings([10, 15]))).toBeNull();
    expect(calculatePrice(makeListings([10]))).toBeNull();
    expect(calculatePrice(makeListings([]))).toBeNull();
  });

  it('returns a number for exactly 3 listings', () => {
    const result = calculatePrice(makeListings([10, 15, 20]));
    expect(result).not.toBeNull();
  });

  it('removes listings priced more than 2× the median', () => {
    // Median of [10, 12, 14, 100] = 13, so 2× = 26; 100 should be excluded
    const result = calculatePrice(makeListings([10, 12, 14, 100]));
    // After removing 100: [10, 12, 14], cheapest 30% rounded up to min 3 → mean of all 3
    expect(result).toBe(12); // (10+12+14)/3 = 12
  });

  it('returns null when fewer than 3 listings remain after outlier removal', () => {
    // Median of [10, 200, 300] = 200, 2× = 400; nothing removed, 3 left
    // But: median of [10, 11, 500, 600] = (11+500)/2 = 255.5, 2× = 511; 500 and 600 both ≤ 511; all kept
    // Let's make one that drops below 3:
    // [10, 500, 600]: median = 500, 2× = 1000; all ≤ 1000, 3 remain → not null
    // [5, 10, 500]: median = 10, 2× = 20; 500 excluded → 2 remain → null
    const result = calculatePrice(makeListings([5, 10, 500]));
    expect(result).toBeNull();
  });

  it('takes the cheapest 30% of remaining listings (min 3)', () => {
    // 10 listings at prices 10..19, cheapest 30% = 3 items (10, 11, 12), mean = 11
    const result = calculatePrice(makeListings([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]));
    expect(result).toBe(11); // (10+11+12)/3 = 11
  });

  it('rounds the result to 2 decimal places', () => {
    // (10 + 11 + 13) / 3 = 11.333...
    const result = calculatePrice(makeListings([10, 11, 13]));
    expect(result).toBe(11.33);
  });

  it('handles all listings at the same price', () => {
    const result = calculatePrice(makeListings([20, 20, 20, 20, 20]));
    expect(result).toBe(20);
  });

  it('handles a single large outlier correctly', () => {
    // 5 listings: [10, 11, 12, 13, 999]
    // Median = 12, 2× = 24; 999 excluded
    // Remaining: [10, 11, 12, 13] — cheapest 30% of 4 = 1.2 → rounded to min 3 → [10,11,12]
    // Mean = 11
    const result = calculatePrice(makeListings([10, 11, 12, 13, 999]));
    expect(result).toBe(11);
  });
});
