import { join } from 'node:path';
import { getAccessToken } from './ebay/auth.js';
import { searchListings } from './ebay/search.js';
import { scoreListings } from './scoring/scorer.js';
import { calculatePrice } from './pricing/calculate.js';
import { JsonFileGameListProvider } from './dal/jsonFileProvider.js';
import { writeResults } from './output/writeResults.js';
import type { PriceResult } from './output/types.js';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  console.log('price-me-gs: starting eBay pricing fetch...');

  const clientId = getRequiredEnv('EBAY_CLIENT_ID');
  const clientSecret = getRequiredEnv('EBAY_CLIENT_SECRET');

  const inputFile = process.env['INPUT_FILE'] ?? join('tasks', 'games-input.json');
  const outputFile = process.env['OUTPUT_FILE'] ?? join('tasks', 'prices-output.json');

  const provider = new JsonFileGameListProvider(inputFile);
  const games = await provider.getGames();
  console.log(`Loaded ${games.length} game(s) from ${inputFile}`);

  const accessToken = await getAccessToken(clientId, clientSecret);

  const results: PriceResult[] = [];

  for (const game of games) {
    const query = `${game.title} ${game.console}`;
    console.log(`Processing: ${query}`);

    try {
      // Small delay to avoid eBay rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));

      const listings = await searchListings(query, accessToken);
      console.log(`  Found ${listings.length} listing(s)`);

      const scored = await scoreListings(game, listings);
      console.log(`  ${scored.length} listing(s) after scoring`);

      const price = calculatePrice(scored);
      const calculatedAt = new Date().toISOString().slice(0, 10);

      results.push({
        id: game.id,
        title: game.title,
        console: game.console,
        price,
        currency: 'GBP',
        calculatedAt,
        sampleSize: scored.length,
      });

      console.log(`  Price: ${price != null ? `£${price}` : 'insufficient data'}`);
    } catch (err) {
      console.error(`  Error processing "${query}":`, err);
      results.push({
        id: game.id,
        title: game.title,
        console: game.console,
        price: null,
        currency: 'GBP',
        calculatedAt: new Date().toISOString().slice(0, 10),
        sampleSize: 0,
      });
    }
  }

  await writeResults(results, outputFile);
  console.log(`\nDone. Results written to ${outputFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
