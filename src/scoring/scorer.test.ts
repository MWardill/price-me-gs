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
    Type: {
      ARRAY: 'ARRAY',
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      INTEGER: 'INTEGER',
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

  it('returns only CIB listings that Gemini identifies', async () => {
    const listings = [
      makeListing(0, { title: 'Sonic Adventure Dreamcast Complete CIB' }),
      makeListing(1, { title: 'Sonic Adventure 2 Dreamcast' }),
      makeListing(2, { title: 'Sonic Adventure Dreamcast Disc Only' }),
    ];

    // Gemini only returns the CIB match (the prompt tells it to filter)
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { itemId: 'item0', condition: 'cib', relevance: 9 },
      ]),
    });

    const result = await scoreListings(game, listings, 'fake-api-key', 'test-model');

    expect(result).toHaveLength(1);
    expect(result[0].itemId).toBe('item0');
    expect(result[0].relevance).toBe(9);
    expect(result[0].condition).toBe('cib');
    // Original listing data preserved
    expect(result[0].price).toBe(10);
    expect(result[0].currency).toBe('GBP');
  });

  it('filters out items with relevance below 7 even if Gemini returns them', async () => {
    const listings = [makeListing(0)];

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { itemId: 'item0', condition: 'cib', relevance: 6 },
      ]),
    });

    const result = await scoreListings(game, listings, 'fake-api-key', 'test-model');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when Gemini returns empty array', async () => {
    const listings = [makeListing(0), makeListing(1)];

    mockGenerateContent.mockResolvedValueOnce({
      text: '[]',
    });

    const result = await scoreListings(game, listings, 'fake-api-key', 'test-model');
    expect(result).toHaveLength(0);
  });

  it('uses structured output config in the API call', async () => {
    const listings = [makeListing(0)];

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { itemId: 'item0', condition: 'cib', relevance: 9 },
      ]),
    });

    await scoreListings(game, listings, 'fake-api-key', 'test-model');

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.config.responseMimeType).toBe('application/json');
    expect(callArgs.config.responseSchema).toBeDefined();
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

  it('throws when Gemini returns item with invalid condition', async () => {
    const listings = [makeListing(0)];

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { itemId: 'item0', condition: 'loose', relevance: 9 },
      ]),
    });

    await expect(scoreListings(game, listings, 'fake-api-key', 'test-model')).rejects.toThrow(
      'invalid "condition"',
    );
  });

  it('skips items in Gemini response with unknown itemIds', async () => {
    const listings = [makeListing(0)];

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { itemId: 'item0', condition: 'cib', relevance: 9 },
        { itemId: 'unknown-item', condition: 'cib', relevance: 10 },
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
        { itemId: 'item0', condition: 'cib', relevance: 9 },
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
