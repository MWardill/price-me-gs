import { readFile } from 'node:fs/promises';
import type { GameListProvider, GameRecord } from './types.js';

export class JsonFileGameListProvider implements GameListProvider {
  constructor(private readonly filePath: string) {}

  async getGames(): Promise<GameRecord[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf-8');
    } catch {
      throw new Error(`Game list file not found: ${this.filePath}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Game list file contains invalid JSON: ${this.filePath}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Game list file must contain a JSON array: ${this.filePath}`);
    }

    for (const [i, item] of parsed.entries()) {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Game list entry ${i} is not an object: ${this.filePath}`);
      }
      if (typeof item.id !== 'number') {
        throw new Error(`Game list entry ${i} missing numeric "id": ${this.filePath}`);
      }
      if (typeof item.title !== 'string' || !item.title) {
        throw new Error(`Game list entry ${i} missing string "title": ${this.filePath}`);
      }
      if (typeof item.console !== 'string' || !item.console) {
        throw new Error(`Game list entry ${i} missing string "console": ${this.filePath}`);
      }
    }

    return parsed as GameRecord[];
  }
}
