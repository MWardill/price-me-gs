/**
 * Local test script: runs the full pricing pipeline for a single game by ID.
 *
 * Usage:
 *   npm run test-game -- --id 1576
 */
import { getAccessToken } from './ebay/auth.js';
import { searchListings } from './ebay/search.js';
import { scoreListings } from './scoring/scorer.js';
import { calculatePrice } from './pricing/calculate.js';
import { DbResultHandler } from './dal/db/DbResultHandler.js';
import { query } from './dal/db/db.js';
import { closePool } from './dal/db/db.js';
import type { GameRecord } from './dal/types.js';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseGameId(): number {
  const idFlag = process.argv.indexOf('--id');
  if (idFlag === -1 || !process.argv[idFlag + 1]) {
    throw new Error('Usage: npm run test-game -- --id <game_id>');
  }
  const id = parseInt(process.argv[idFlag + 1], 10);
  if (isNaN(id)) {
    throw new Error(`Invalid game ID: ${process.argv[idFlag + 1]}`);
  }
  return id;
}

async function fetchGameById(gameId: number): Promise<GameRecord> {
  const result = await query(
    `SELECT g.id, g.title, c.name as console
     FROM games g
     JOIN consoles c ON g.console_id = c.id
     WHERE g.id = $1`,
    [gameId],
  );

  if (result.rows.length === 0) {
    throw new Error(`No game found with id=${gameId}`);
  }

  const row = result.rows[0];
  return { id: row.id, title: row.title, console: row.console };
}

async function main(): Promise<void> {
  const gameId = parseGameId();

  const clientId = getRequiredEnv('EBAY_CLIENT_ID');
  const clientSecret = getRequiredEnv('EBAY_CLIENT_SECRET');
  const geminiApiKey = getRequiredEnv('GEMINI_API_KEY');
  const geminiModel = process.env['GEMINI_MODEL'] ?? 'gemini-3-flash-preview';

  console.log(`test-game: fetching game id=${gameId} from DB...`);
  const game = await fetchGameById(gameId);
  console.log(`Found: "${game.title}" (${game.console})`);

  const accessToken = await getAccessToken(clientId, clientSecret);
  const handler = new DbResultHandler();

  const queryStr = `${game.title} ${game.console}`;
  console.log(`\nSearching eBay for: ${queryStr}`);

  const listings = await searchListings(queryStr, accessToken);
  console.log(`Found ${listings.length} listing(s)`);

  const scored = await scoreListings(game, listings, geminiApiKey, geminiModel);
  console.log(`${scored.length} listing(s) after scoring`);

  const price = calculatePrice(scored);
  const calculatedAt = new Date().toISOString().slice(0, 10);

  const result = {
    id: game.id,
    title: game.title,
    console: game.console,
    price,
    currency: 'GBP' as const,
    calculatedAt,
    sampleSize: scored.length,
  };

  console.log(`\nPrice: ${price != null ? `£${price}` : 'insufficient data (null)'}`);

  await handler.handleResult(result);
  await handler.finalize();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch (err) {
      console.error('Error closing DB pool:', err);
    }
  });
