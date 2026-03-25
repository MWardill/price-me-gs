import type { ScoredListing } from '../scoring/scorer.js';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function calculatePrice(listings: ScoredListing[]): number | null {
  if (listings.length < 3) {
    return null;
  }

  // Step 1: remove price outliers (price > 2× median)
  const prices = listings.map((l) => l.price);
  const med = median(prices);
  const filtered = listings.filter((l) => l.price <= med * 2);

  if (filtered.length < 3) {
    return null;
  }

  // Step 2: sort ascending, take cheapest 30% (min 3)
  const sorted = [...filtered].sort((a, b) => a.price - b.price);
  const subsetSize = Math.max(3, Math.floor(sorted.length * 0.3));
  const subset = sorted.slice(0, subsetSize);

  // Step 3: mean of the subset
  const mean = subset.reduce((sum, l) => sum + l.price, 0) / subset.length;
  return Math.round(mean * 100) / 100;
}
