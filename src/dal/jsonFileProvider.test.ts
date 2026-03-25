import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { JsonFileGameListProvider } from './jsonFileProvider.js';

const testDir = join(tmpdir(), 'price-me-gs-test');

beforeAll(async () => {
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('JsonFileGameListProvider', () => {
  it('loads and returns games from a valid JSON file', async () => {
    const filePath = join(testDir, 'valid.json');
    const games = [
      { id: 1, title: 'Sonic Adventure', console: 'Dreamcast' },
      { id: 2, title: 'Shenmue', console: 'Dreamcast' },
    ];
    await writeFile(filePath, JSON.stringify(games));

    const provider = new JsonFileGameListProvider(filePath);
    const result = await provider.getGames();

    expect(result).toEqual(games);
  });

  it('throws a descriptive error when the file does not exist', async () => {
    const provider = new JsonFileGameListProvider('/nonexistent/path/games.json');
    await expect(provider.getGames()).rejects.toThrow(
      'Game list file not found: /nonexistent/path/games.json',
    );
  });

  it('throws a descriptive error when the file contains invalid JSON', async () => {
    const filePath = join(testDir, 'invalid.json');
    await writeFile(filePath, 'this is not json {{{');

    const provider = new JsonFileGameListProvider(filePath);
    await expect(provider.getGames()).rejects.toThrow('Game list file contains invalid JSON');
  });

  it('throws when the file contains a JSON object instead of an array', async () => {
    const filePath = join(testDir, 'object.json');
    await writeFile(filePath, JSON.stringify({ id: 1, title: 'Test' }));

    const provider = new JsonFileGameListProvider(filePath);
    await expect(provider.getGames()).rejects.toThrow('Game list file must contain a JSON array');
  });
});
