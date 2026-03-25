import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchListings } from './search.js';

const MOCK_TOKEN = 'bearer-token-xyz';

function makeMockResponse(itemSummaries: unknown) {
  return {
    ok: true,
    json: async () => ({ itemSummaries }),
  };
}

describe('searchListings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends correct query params and headers', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(makeMockResponse([]));
    vi.stubGlobal('fetch', mockFetch);

    await searchListings('Sonic Adventure Dreamcast', MOCK_TOKEN);

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const parsedUrl = new URL(url);

    expect(parsedUrl.origin + parsedUrl.pathname).toBe(
      'https://api.ebay.com/buy/browse/v1/item_summary/search',
    );
    expect(parsedUrl.searchParams.get('q')).toBe('Sonic Adventure Dreamcast');
    expect(parsedUrl.searchParams.get('filter')).toBe(
      'buyingOptions:{FIXED_PRICE},itemLocationCountry:GB',
    );
    expect(parsedUrl.searchParams.get('limit')).toBe('50');
    expect(parsedUrl.searchParams.get('marketplace_id')).toBe('EBAY_GB');
    expect((options.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${MOCK_TOKEN}`,
    );
  });

  it('maps eBay response to EbayListing[]', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      makeMockResponse([
        { itemId: 'item1', title: 'Sonic Adventure Dreamcast CIB', price: { value: '24.99', currency: 'GBP' } },
        { itemId: 'item2', title: 'Sonic Adventure Dreamcast Loose', price: { value: '9.99', currency: 'GBP' } },
      ]),
    );
    vi.stubGlobal('fetch', mockFetch);

    const results = await searchListings('Sonic Adventure Dreamcast', MOCK_TOKEN);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ itemId: 'item1', title: 'Sonic Adventure Dreamcast CIB', price: 24.99, currency: 'GBP' });
    expect(results[1]).toEqual({ itemId: 'item2', title: 'Sonic Adventure Dreamcast Loose', price: 9.99, currency: 'GBP' });
  });

  it('returns empty array when no itemSummaries in response', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', mockFetch);

    const results = await searchListings('Unknown Game Console', MOCK_TOKEN);

    expect(results).toEqual([]);
  });

  it('filters out items with no price', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      makeMockResponse([
        { itemId: 'item1', title: 'With price', price: { value: '15.00', currency: 'GBP' } },
        { itemId: 'item2', title: 'No price' },
      ]),
    );
    vi.stubGlobal('fetch', mockFetch);

    const results = await searchListings('Some Game', MOCK_TOKEN);

    expect(results).toHaveLength(1);
    expect(results[0].itemId).toBe('item1');
  });

  it('throws when the search endpoint returns an error status', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(searchListings('Any Game', MOCK_TOKEN)).rejects.toThrow(
      'eBay search failed: 403 Forbidden',
    );
  });
});
