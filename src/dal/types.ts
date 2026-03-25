export interface GameRecord {
  id: number;
  title: string;
  console: string;
}

export interface GameListProvider {
  getGames(): Promise<GameRecord[]>;
}
