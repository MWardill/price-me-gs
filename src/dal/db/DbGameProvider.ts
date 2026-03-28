import { query } from './db.js';
import type { GameRecord, GameListProvider } from '../types.js';

export class DbGameProvider implements GameListProvider {
  async getGames(): Promise<GameRecord[]> {
    const userEmail = process.env.USER_EMAIL || 'mat3740@gmail.com';
    const runsPerWeekStr = process.env.RUNS_PER_WEEK || '1';
    const runsPerWeek = parseFloat(runsPerWeekStr);
    
    // Get total distinct games for this user (constrained to 1 per user/game anyway)
    const totalResult = await query(`
      SELECT COUNT(gc.game_id) as total
      FROM games_collection gc
      JOIN users u ON gc.user_id = u.id
      WHERE u.email = $1
    `, [userEmail]);
    
    const totalGames = parseInt(totalResult.rows[0].total, 10);
    if (totalGames === 0) {
      console.log(`No games found for user ${userEmail}`);
      return [];
    }

    // 4 runs per hour, 24 hours, 7 days = 672
    const runsPerWeekTotal = 672; 
    const gamesPerRun = Math.ceil((totalGames * runsPerWeek) / runsPerWeekTotal);

    console.log(`Config: ${runsPerWeek} runs/week. Total games: ${totalGames}. Fetching ${gamesPerRun} game(s) this run.`);

    const result = await query(`
      SELECT g.id, g.title, c.name as console
      FROM games_collection gc
      JOIN users u ON gc.user_id = u.id
      JOIN games g ON gc.game_id = g.id
      JOIN consoles c ON g.console_id = c.id
      LEFT JOIN pricing_runs pr ON g.id = pr.game_id
      WHERE u.email = $1
      ORDER BY pr.last_priced_at ASC NULLS FIRST
      LIMIT $2
    `, [userEmail, gamesPerRun]);

    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      console: row.console,
    }));
  }
}
