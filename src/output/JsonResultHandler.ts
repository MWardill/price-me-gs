import { writeFile } from 'node:fs/promises';
import type { ResultHandler, PriceResult } from './types.js';

export class JsonResultHandler implements ResultHandler {
  private results: PriceResult[] = [];

  constructor(private readonly outputPath: string) {}

  async handleResult(result: PriceResult): Promise<void> {
    this.results.push(result);
  }

  async finalize(): Promise<void> {
    await writeFile(this.outputPath, JSON.stringify(this.results, null, 2), 'utf-8');
  }
}
