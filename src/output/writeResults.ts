import { writeFile } from 'node:fs/promises';
import type { PriceResult } from './types.js';

export async function writeResults(
  results: PriceResult[],
  outputPath: string,
): Promise<void> {
  await writeFile(outputPath, JSON.stringify(results, null, 2), 'utf-8');
}
