const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

export interface EbayListing {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  itemWebUrl?: string;
  imageUrl?: string;
  shortDescription?: string;
  condition?: string;
}

interface EbayItemSummary {
  itemId: string;
  title: string;
  price?: {
    value: string;
    currency: string;
  };
  image?: {
    imageUrl: string;
  };
  itemWebUrl?: string;
  shortDescription?: string;
  condition?: string;
}

interface EbaySearchResponse {
  itemSummaries?: EbayItemSummary[];
}

export async function searchListings(
  query: string,
  accessToken: string,
): Promise<EbayListing[]> {
  const params = new URLSearchParams({
    q: query,
    filter: 'buyingOptions:{FIXED_PRICE},itemLocationCountry:GB',
    limit: '50',
    marketplace_id: 'EBAY_GB',
    fieldgroups: 'EXTENDED',
  });

  const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`eBay search failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as EbaySearchResponse;

  if (!data.itemSummaries) {
    return [];
  }

  return data.itemSummaries
    .filter((item) => item.price != null)
    .map((item) => ({
      itemId: item.itemId,
      title: item.title,
      price: parseFloat(item.price!.value),
      currency: item.price!.currency,
      itemWebUrl: item.itemWebUrl,
      imageUrl: item.image?.imageUrl,
      shortDescription: item.shortDescription,
      condition: item.condition,
    }));
}
