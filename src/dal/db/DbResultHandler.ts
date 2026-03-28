import { query } from './db.js';
import type { ResultHandler, PriceResult } from '../../output/types.js';

export class DbResultHandler implements ResultHandler {
  async handleResult(result: PriceResult): Promise<void> {
    const gameId = result.id;
    const price = result.price;
    const sampleSize = result.sampleSize;

    console.log(`[DB] Writing result for game_id=${gameId}`);

    // 1. Insert into price_history
    await query(`
      INSERT INTO price_history (game_id, price, currency, sample_size)
      VALUES ($1, $2, $3, $4)
    `, [gameId, price, result.currency, sampleSize]);

    // 2. Upsert into pricing_runs
    await query(`
      INSERT INTO pricing_runs (game_id, last_priced_at)
      VALUES ($1, NOW())
      ON CONFLICT (game_id) DO UPDATE 
      SET last_priced_at = NOW()
    `, [gameId]);

    // 3. Recalculate price_report
    // Get average of the last 2 months prices
    const avgResult = await query(`
      SELECT AVG(price) as avg_price 
      FROM price_history
      WHERE game_id = $1 AND priced_at >= NOW() - INTERVAL '2 months' AND price IS NOT NULL
    `, [gameId]);

    const newAvgStr = avgResult.rows[0].avg_price;
    const newAvg: number | null = newAvgStr ? parseFloat(newAvgStr) : null;

    if (newAvg !== null) {
      // Get previous report
      const reportResult = await query(`
        SELECT current_price FROM price_report WHERE game_id = $1
      `, [gameId]);

      let priceMove = 'new';
      if (reportResult.rowCount && reportResult.rowCount > 0 && reportResult.rows[0].current_price) {
        const oldPrice = parseFloat(reportResult.rows[0].current_price);
        if (newAvg > oldPrice) {
          priceMove = 'up';
        } else if (newAvg < oldPrice) {
          priceMove = 'down';
        } else {
          priceMove = 'neutral';
        }
      }

      await query(`
        INSERT INTO price_report (game_id, current_price, price_move, last_calculated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (game_id) DO UPDATE 
        SET current_price = EXCLUDED.current_price,
            price_move = EXCLUDED.price_move,
            last_calculated_at = NOW()
      `, [gameId, newAvg.toFixed(2), priceMove]);
      
      console.log(`[DB] Report updated. Moving: ${priceMove}, New avg: ${newAvg.toFixed(2)}`);
    } else {
       console.log(`[DB] Not enough valid price data to update price_report for game_id=${gameId}`);
    }
  }

  async finalize(): Promise<void> {
    console.log('[DB] DbResultHandler finalize completed.');
  }
}
