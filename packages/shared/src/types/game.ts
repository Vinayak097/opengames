export type Player = {
  id: string;
  name?: string;
};

export type GameStatus = "WAITING" | "IN_PROGRESS" | "FINISHED";

/**
 * The game modes the room service can currently create. These values select a
 * room only; rules and game state belong to later game-specific phases.
 */
export type GameType = "CHESS" | "SNAKE" | "TIC_TAC_TOE" | "FLAPPY";

export type ChessMode = "BULLET" | "BLITZ" | "RAPID";

/**
 * Generic room configuration. Game-specific configuration is validated by the
 * room manager without adding game state to the Game model.
 */
export type GameConfig = Record<string, unknown>;

export type Game = {
  id: string;
  players: Player[];
  status: GameStatus;
  gameType: GameType;
  config: GameConfig;
};
