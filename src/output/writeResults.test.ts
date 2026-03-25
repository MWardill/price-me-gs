import { readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { PriceResult } from './types.js';
import { writeResults } from './writeResults.js';

const testDir = join(tmpdir(), 'price-me-gs-output-test');

beforeAll(async () => {
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('writeResults', () => {
  it('writes a JSON array to the given path', async () => {
    const outputPath = join(testDir, 'prices.json');
    const results: PriceResult[] = [
      {
        id: 1,
        title: 'Sonic Adventure',
        console: 'Dreamcast',
        price: 24.99,
        currency: 'GBP',
        calculatedAt: '2026-03-25',
        sampleSize: 8,
      },
    ];

    await writeResults(results, outputPath);

    const raw = await readFile(outputPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    expect(parsed).toEqual(results);
  });

  it('writes pretty-printed JSON (2-space indent)', async () => {
    const outputPath = join(testDir, 'pretty.json');
    const results: PriceResult[] = [
      { id: 2, title: 'Shenmue', console: 'Dreamcast', price: 45.0, currency: 'GBP', calculatedAt: '2026-03-25', sampleSize: 5 },
    ];

    await writeResults(results, outputPath);

    const raw = await readFile(outputPath, 'utf-8');
    expect(raw).toContain('  "id": 2');
  });

  it('overwrites an existing file', async () => {
    const outputPath = join(testDir, 'overwrite.json');
    const first: PriceResult[] = [
      { id: 1, title: 'Old', console: 'Old', price: 10, currency: 'GBP', calculatedAt: '2026-01-01', sampleSize: 3 },
    ];
    const second: PriceResult[] = [
      { id: 2, title: 'New', console: 'New', price: 20, currency: 'GBP', calculatedAt: '2026-03-25', sampleSize: 4 },
    ];

    await writeResults(first, outputPath);
    await writeResults(second, outputPath);

    const raw = await readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(raw) as PriceResult[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('New');
  });

  it('writes an empty array without error', async () => {
    const outputPath = join(testDir, 'empty.json');
    await writeResults([], outputPath);
    const raw = await readFile(outputPath, 'utf-8');
    expect(JSON.parse(raw)).toEqual([]);
  });
});
