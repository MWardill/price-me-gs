import { join } from 'node:path';
import { getAccessToken } from './ebay/auth.js';
import { searchListings } from './ebay/search.js';
import { scoreListings } from './scoring/scorer.js';
import { calculatePrice } from './pricing/calculate.js';
import { JsonFileGameListProvider } from './dal/jsonFileProvider.js';
import { DbGameProvider } from './dal/db/DbGameProvider.js';
import { JsonResultHandler } from './output/JsonResultHandler.js';
import { DbResultHandler } from './dal/db/DbResultHandler.js';
import { closePool } from './dal/db/db.js';
import type { PriceResult, ResultHandler } from './output/types.js';
import type { GameListProvider } from './dal/types.js';

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
  const geminiApiKey = getRequiredEnv('GEMINI_API_KEY');
  const geminiModel = process.env['GEMINI_MODEL'] ?? 'gemini-3-flash-preview';
  const useDb = process.env['USE_DB'] === 'true';

  let provider: GameListProvider;
  let handler: ResultHandler;

  if (useDb) {
    provider = new DbGameProvider();
    handler = new DbResultHandler();
  } else {
    const inputFile = process.env['INPUT_FILE'] ?? join('tasks', 'games-input.json');
    const outputFile = process.env['OUTPUT_FILE'] ?? join('tasks', 'prices-output.json');
    provider = new JsonFileGameListProvider(inputFile);
    handler = new JsonResultHandler(outputFile);
  }

  const games = await provider.getGames();
  console.log(`Loaded ${games.length} game(s) for processing.`);

  if (games.length === 0) {
    console.log('No games to process. Exiting.');
    return;
  }

  const accessToken = await getAccessToken(clientId, clientSecret);

  for (const game of games) {
    const query = `${game.title} ${game.console}`;
    console.log(`Processing: ${query}`);

    let result: PriceResult;

    try {
      // Small delay to avoid eBay rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));

      const listings = await searchListings(query, accessToken);
      console.log(`  Found ${listings.length} listing(s)`);

      const scored = await scoreListings(game, listings, geminiApiKey, geminiModel);
      console.log(`  ${scored.length} listing(s) after scoring`);

      const price = calculatePrice(scored);
      const calculatedAt = new Date().toISOString().slice(0, 10);

      result = {
        id: game.id,
        title: game.title,
        console: game.console,
        price,
        currency: 'GBP',
        calculatedAt,
        sampleSize: scored.length,
      };

      console.log(`  Price: ${price != null ? `£${price}` : 'insufficient data'}`);
    } catch (err) {
      console.error(`  Error processing "${query}":`, err);
      result = {
        id: game.id,
        title: game.title,
        console: game.console,
        price: null,
        currency: 'GBP',
        calculatedAt: new Date().toISOString().slice(0, 10),
        sampleSize: 0,
      };
    }

    try {
      await handler.handleResult(result);
    } catch (err) {
      console.error(`  Error handling result for "${query}":`, err);
    }
  }

  await handler.finalize();
  console.log(`\nDone.`);
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Attempt graceful DB pool shutdown
    try {
      if (process.env['USE_DB'] === 'true') {
        await closePool();
      }
    } catch (err) {
      console.error('Error closing DB pool:', err);
    }
  });
