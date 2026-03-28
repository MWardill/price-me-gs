import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DbResultHandler } from './DbResultHandler.js';
import * as db from './db.js';

vi.mock('./db.js', () => ({
  query: vi.fn(),
}));

describe('DbResultHandler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('handles result normally and calculates move UP when current_price < newAvg', async () => {
    // 1. insert into price_history
    vi.mocked(db.query).mockResolvedValueOnce({ rowCount: 1 } as never);
    // 2. upsert pricing_runs
    vi.mocked(db.query).mockResolvedValueOnce({ rowCount: 1 } as never);
    
    // 3. recalculate newAvg
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [{ avg_price: '55.00' }],
      rowCount: 1,
    } as never);

    // 4. get previous report
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [{ current_price: '50.00' }],
      rowCount: 1,
    } as never);

    // 5. upsert new report
    vi.mocked(db.query).mockResolvedValueOnce({ rowCount: 1 } as never);

    const handler = new DbResultHandler();
    await handler.handleResult({
      id: 10,
      title: 'Game A',
      console: 'PS1',
      price: 60,
      currency: 'GBP',
      calculatedAt: '2026-03-28',
      sampleSize: 5
    });

    // Check we upsert price_report with UP move
    const lastCallArgs = vi.mocked(db.query).mock.calls[4];
    expect(lastCallArgs[0]).toContain('INSERT INTO price_report');
    expect(lastCallArgs[1]).toEqual([10, '55.00', 'up']);
  });

  it('skips report update if average is null (no valid history)', async () => {
    // 1 & 2
    vi.mocked(db.query).mockResolvedValueOnce({ rowCount: 1 } as never);
    vi.mocked(db.query).mockResolvedValueOnce({ rowCount: 1 } as never);
    
    // 3. newAvg null
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [{ avg_price: null }],
      rowCount: 1,
    } as never);

    const handler = new DbResultHandler();
    await handler.handleResult({
      id: 10,
      title: 'Game A',
      console: 'PS1',
      price: null,
      currency: 'GBP',
      calculatedAt: '2026-03-28',
      sampleSize: 0
    });

    // query called 3 times, not the 5 times for full path
    expect(db.query).toHaveBeenCalledTimes(3);
  });
});
