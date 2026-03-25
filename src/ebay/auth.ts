const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SCOPE = 'https://api.ebay.com/oauth/api_scope';

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cache: CachedToken | null = null;

export async function getAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return cache.accessToken;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
  });

  if (!response.ok) {
    throw new Error(`eBay auth failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as TokenResponse;

  // Cache with a 60-second buffer before actual expiry
  cache = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in - 60) * 1000,
  };

  return cache.accessToken;
}

/** Reset the token cache (for testing) */
export function _resetCache(): void {
  cache = null;
}
