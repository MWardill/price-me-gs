import { query, closePool } from '../dal/db/db.js';

async function main() {
  console.log('price-me-gs: Starting DB cleanup...');
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    const result = await query(`
      DELETE FROM price_history 
      WHERE priced_at < NOW() - INTERVAL '6 months'
    `);
    console.log(`Cleanup complete. Deleted ${result.rowCount} old historical records.`);
  } catch (e) {
    console.error('Error during cleanup:', e);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

main();
