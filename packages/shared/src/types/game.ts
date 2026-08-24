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
export type ChessColor = "w" | "b";
export type ChessPiece = "p" | "n" | "b" | "r" | "q" | "k";
export type ChessWinner = ChessColor | "DRAW" | null;

export type ChessState = {
  fen: string;
  board: (ChessPiece | null)[];
  colors: (ChessColor | null)[];
  turn: ChessColor;
  winner: ChessWinner;
  check: boolean;
  lastMove: { from: string; to: string } | null;
};

/**
 * Generic room configuration. Game-specific configuration is validated by the
 * room manager without adding game state to the Game model.
 */
export type GameConfig = Record<string, unknown>;

export type TicTacToeMark = "X" | "O";
export type TicTacToeWinner = TicTacToeMark | "DRAW" | null;

export type TicTacToeState = {
  board: (TicTacToeMark | null)[];
  turn: string;
  winner: TicTacToeWinner;
  rematchVotes: string[];
};

export type SnakePoint = { x: number; y: number };
export type SnakeDirection = SnakePoint;

export type SnakePlayerState = {
  playerId: string;
  body: SnakePoint[];
  direction: SnakeDirection;
  score: number;
  alive: boolean;
};

export type SnakeState = {
  width: number;
  height: number;
  food: SnakePoint;
  players: SnakePlayerState[];
  winner: string | "DRAW" | null;
  rematchVotes: string[];
};

export type RematchState = {
  requestedBy: string | null;
  acceptedBy: string[];
  declinedBy: string[];
};

export type FlappyState = {
  score: number;
  bestScore: number;
  birdY: number;
  velocity: number;
  pipeX: number;
  pipeGapY: number;
  running: boolean;
  players?: FlappyPlayerState[];
  winner?: string | "DRAW" | null;
  rematchVotes?: string[];
};

export type FlappyPlayerState = {
  playerId: string;
  birdY: number;
  velocity: number;
  score: number;
  alive: boolean;
};

export type Game = {
  id: string;
  players: Player[];
  status: GameStatus;
  gameType: GameType;
  config: GameConfig;
  ticTacToe?: TicTacToeState;
  chess?: ChessState;
  snake?: SnakeState;
  flappy?: FlappyState;
  rematch?: RematchState;
};
