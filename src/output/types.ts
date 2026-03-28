export interface PriceResult {
  id: number;
  title: string;
  console: string;
  price: number | null;
  currency: 'GBP';
  calculatedAt: string;
  sampleSize: number;
}

export interface ResultHandler {
  handleResult(result: PriceResult): Promise<void>;
  finalize(): Promise<void>;
}
