export type Player = {
  id: string;
  name?: string;
};

export type GameStatus = "WAITING" | "IN_PROGRESS" | "FINISHED";

export type GameType = "CHESS" | "TIC_TAC_TOE" | "SNAKE" | "FLAPPY";

export interface Game {
  id: string;
  players: Player[];
  status: GameStatus;
  gameType: GameType;
}
