import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { EbayListing } from '../ebay/search.js';
import type { GameRecord } from '../dal/types.js';

const game: GameRecord = { id: 1, title: 'Sonic Adventure', console: 'Dreamcast' };

function makeListing(id: number, overrides?: Partial<EbayListing>): EbayListing {
  return {
    itemId: `item${id}`,
    title: `Listing ${id}`,
    price: 10 + id,
    currency: 'GBP',
    ...overrides,
  };
}

// Mock the @google/genai module
const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: mockGenerateContent,
      };
    },
  };
});

// Import after mocking
const { scoreListings } = await import('./scorer.js');

describe('scoreListings (Gemini AI)', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  it('returns empty array when given no listings', async () => {
    const result = await scoreListings(game, [], 'fake-api-key', 'test-model');
    expect(result).toEqual([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('keeps only CIB + relevant listings from Gemini response', async () => {
    const listings = [
      makeListing(0, { title: 'Sonic Adventure Dreamcast Complete CIB' }),
      makeListing(1, { title: 'Sonic Adventure 2 Dreamcast' }),
      makeListing(2, { title: 'Sonic Adventure Dreamcast Disc Only' }),
      makeListing(3, { title: 'Sonic Adventure Dreamcast Sealed' }),
      makeListing(4, { title: 'Dreamcast Console Bundle' }),
    ];

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { itemId: 'item0', relevant: true, condition: 'cib', relevance: 9 },
        { itemId: 'item1', relevant: false, condition: 'cib', relevance: 3 },
        { itemId: 'item2', relevant: true, condition: 'loose', relevance: 8 },
        { itemId: 'item3', relevant: true, condition: 'sealed', relevance: 8 },
        { itemId: 'item4', relevant: false, condition: 'other', relevance: 2 },
      ]),
    });

    const result = await scoreListings(game, listings, 'fake-api-key', 'test-model');

    // Only item0 should survive: CIB + relevant + relevance >= 5
    expect(result).toHaveLength(1);
    expect(result[0].itemId).toBe('item0');
    expect(result[0].relevance).toBe(9);
    expect(result[0].condition).toBe('cib');
    // Original listing data preserved
    expect(result[0].price).toBe(10);
    expect(result[0].currency).toBe('GBP');
  });

  it('excludes CIB listings with relevance below 5', async () => {
    const listings = [makeListing(0)];

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { itemId: 'item0', relevant: true, condition: 'cib', relevance: 4 },
      ]),
    });

    const result = await scoreListings(game, listings, 'fake-api-key', 'test-model');
    expect(result).toHaveLength(0);
  });

  it('handles Gemini response wrapped in markdown code fences', async () => {
    const listings = [makeListing(0)];

    mockGenerateContent.mockResolvedValueOnce({
      text: '```json\n[{"itemId": "item0", "relevant": true, "condition": "cib", "relevance": 9}]\n```',
    });

    const result = await scoreListings(game, listings, 'fake-api-key', 'test-model');
    expect(result).toHaveLength(1);
    expect(result[0].itemId).toBe('item0');
  });

  it('returns empty array when Gemini filters out all listings', async () => {
    const listings = [makeListing(0), makeListing(1)];

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { itemId: 'item0', relevant: false, condition: 'other', relevance: 2 },
        { itemId: 'item1', relevant: true, condition: 'loose', relevance: 7 },
      ]),
    });

    const result = await scoreListings(game, listings, 'fake-api-key', 'test-model');
    expect(result).toHaveLength(0);
  });

  it('throws when Gemini call fails', async () => {
    const listings = [makeListing(0)];

    mockGenerateContent.mockRejectedValueOnce(new Error('API rate limit exceeded'));

    await expect(scoreListings(game, listings, 'fake-api-key', 'test-model')).rejects.toThrow(
      'API rate limit exceeded',
    );
  });

  it('throws when Gemini returns empty response', async () => {
    const listings = [makeListing(0)];

    mockGenerateContent.mockResolvedValueOnce({ text: '' });

    await expect(scoreListings(game, listings, 'fake-api-key', 'test-model')).rejects.toThrow(
      'Gemini returned an empty response',
    );
  });

  it('throws when Gemini returns unparseable response', async () => {
    const listings = [makeListing(0)];

    mockGenerateContent.mockResolvedValueOnce({ text: 'not valid json at all' });

    await expect(scoreListings(game, listings, 'fake-api-key', 'test-model')).rejects.toThrow();
  });

  it('skips items in Gemini response with unknown itemIds', async () => {
    const listings = [makeListing(0)];

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { itemId: 'item0', relevant: true, condition: 'cib', relevance: 9 },
        { itemId: 'unknown-item', relevant: true, condition: 'cib', relevance: 10 },
      ]),
    });

    const result = await scoreListings(game, listings, 'fake-api-key', 'test-model');
    expect(result).toHaveLength(1);
    expect(result[0].itemId).toBe('item0');
  });

  it('includes shortDescription and condition in prompt when available', async () => {
    const listings = [
      makeListing(0, {
        title: 'Sonic Adventure Dreamcast',
        shortDescription: 'Complete with manual',
        condition: 'Used',
      }),
    ];

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { itemId: 'item0', relevant: true, condition: 'cib', relevance: 9 },
      ]),
    });

    await scoreListings(game, listings, 'fake-api-key', 'test-model');

    // Verify the prompt sent to Gemini contains the extra data
    const callArgs = mockGenerateContent.mock.calls[0][0];
    const prompt = callArgs.contents as string;
    expect(prompt).toContain('Complete with manual');
    expect(prompt).toContain('eBay Condition: "Used"');
  });
});
