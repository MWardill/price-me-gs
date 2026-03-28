import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DbGameProvider } from './DbGameProvider.js';
import * as db from './db.js';

vi.mock('./db.js', () => ({
  query: vi.fn(),
  getPool: vi.fn(),
}));

describe('DbGameProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.USER_EMAIL = 'test@example.com';
    process.env.RUNS_PER_WEEK = '2';
  });

  it('calculates subsets correctly based on runs per week', async () => {
    // Mock the total count query
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [{ total: '1000' }],
      rowCount: 1,
    } as never);

    // Mock the actual fetching
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [
        { id: 1, title: 'Game A', console: 'PS1' },
      ],
      rowCount: 1,
    } as never);

    const provider = new DbGameProvider();
    const games = await provider.getGames();

    expect(db.query).toHaveBeenCalledTimes(2);
    // gamesPerRun = Math.ceil((1000 * 2) / 672) = Math.ceil(2000 / 672) = 3
    const secondCallParams = vi.mocked(db.query).mock.calls[1][1];
    expect(secondCallParams).toEqual(['test@example.com', 3]);
    
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe('Game A');
  });

  it('returns empty array if no games owned', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [{ total: '0' }],
      rowCount: 1,
    } as never);

    const provider = new DbGameProvider();
    const games = await provider.getGames();

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(games).toHaveLength(0);
  });
});
