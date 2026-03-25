import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetCache, getAccessToken } from './auth.js';

describe('getAccessToken', () => {
  beforeEach(() => {
    _resetCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches a token from the eBay auth endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token-abc', expires_in: 7200 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const token = await getAccessToken('my-client-id', 'my-client-secret');

    expect(token).toBe('test-token-abc');
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.ebay.com/identity/v1/oauth2/token');
    expect(options.method).toBe('POST');

    const expectedCredentials = Buffer.from('my-client-id:my-client-secret').toString('base64');
    expect((options.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${expectedCredentials}`,
    );
    expect(options.body).toContain('grant_type=client_credentials');
  });

  it('returns the cached token on a second call without fetching again', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'cached-token', expires_in: 7200 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const first = await getAccessToken('id', 'secret');
    const second = await getAccessToken('id', 'secret');

    expect(first).toBe('cached-token');
    expect(second).toBe('cached-token');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('re-fetches when the cached token is expired', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'old-token', expires_in: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'new-token', expires_in: 7200 }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const first = await getAccessToken('id', 'secret');
    // expires_in: 0 means it expired immediately (buffer makes it negative)
    const second = await getAccessToken('id', 'secret');

    expect(first).toBe('old-token');
    expect(second).toBe('new-token');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws when the auth endpoint returns an error status', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(getAccessToken('bad-id', 'bad-secret')).rejects.toThrow(
      'eBay auth failed: 401 Unauthorized',
    );
  });
});
