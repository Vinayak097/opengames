import { randomUUID } from "node:crypto";
import { Chess } from "chess.js";
import type {
  ChessColor,
  ChessState,
  FlappyPlayerState,
  FlappyState,
  Game,
  GameConfig,
  GameType,
  Player,
  SnakeDirection,
  SnakeState,
  TicTacToeMark,
} from "@opengames/shared";

export const MAX_PLAYERS_PER_GAME = 2;

const GAME_TYPES = [
  "CHESS",
  "SNAKE",
  "TIC_TAC_TOE",
  "FLAPPY",
] as const satisfies readonly GameType[];

const CHESS_MODES = ["BULLET", "BLITZ", "RAPID"] as const;

export class GameManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameManagerError";
  }
}

export class GameManager {
  private readonly games = new Map<string, Game>();

  createGame(gameType: unknown, player: Player, config: unknown): Game {
    const validGameType = validateGameType(gameType);
    const validConfig = validateGameConfig(validGameType, config);
    validatePlayer(player);

    const game: Game = {
      id: randomUUID(),
      players: [player],
      status: "WAITING",
      gameType: validGameType,
      config: validConfig,
      rematch: { requestedBy: null, acceptedBy: [], declinedBy: [] },
    };
    if (validGameType === "TIC_TAC_TOE") {
      game.ticTacToe = {
        board: Array(9).fill(null),
        turn: player.id,
        winner: null,
        rematchVotes: [],
      };
    }
    if (validGameType === "CHESS") game.chess = createChessState();
    this.games.set(game.id, game);
    return game;
  }

  makeTicTacToeMove(gameId: string, playerId: string, cell: unknown): Game {
    const game = this.getGame(gameId);
    if (game.gameType !== "TIC_TAC_TOE" || !game.ticTacToe) {
      throw new GameManagerError("This game does not support Tic-Tac-Toe moves");
    }
    if (game.status !== "IN_PROGRESS") {
      throw new GameManagerError("The game is not in progress");
    }
    if (typeof cell !== "number" || !Number.isInteger(cell) || cell < 0 || cell > 8) {
      throw new GameManagerError("Choose a valid board cell");
    }
    const playerIndex = game.players.findIndex((player) => player.id === playerId);
    if (playerIndex === -1) {
      throw new GameManagerError("Player is not in this game");
    }
    if (game.ticTacToe.turn !== playerId) {
      throw new GameManagerError("Wait for your turn");
    }
    if (game.ticTacToe.board[cell] !== null) {
      throw new GameManagerError("That cell is already taken");
    }

    const mark: TicTacToeMark = playerIndex === 0 ? "X" : "O";
    game.ticTacToe.board[cell] = mark;
    if (hasWinningLine(game.ticTacToe.board, mark)) {
      game.ticTacToe.winner = mark;
      game.status = "FINISHED";
    } else if (game.ticTacToe.board.every((value) => value !== null)) {
      game.ticTacToe.winner = "DRAW";
      game.status = "FINISHED";
    } else {
      game.ticTacToe.turn = game.players[playerIndex === 0 ? 1 : 0].id;
    }
    return game;
  }

  makeChessMove(gameId: string, playerId: string, from: unknown, to: unknown, promotion: unknown): Game {
    const game = this.getGame(gameId);
    if (game.gameType !== "CHESS" || !game.chess) throw new GameManagerError("This game does not support Chess moves");
    if (game.status !== "IN_PROGRESS") throw new GameManagerError("The game is not in progress");
    if (typeof from !== "string" || typeof to !== "string") throw new GameManagerError("Choose valid Chess squares");
    const playerIndex = game.players.findIndex((player) => player.id === playerId);
    if (playerIndex === -1) throw new GameManagerError("Player is not in this game");
    const color: ChessColor = playerIndex === 0 ? "w" : "b";
    if (game.chess.turn !== color) throw new GameManagerError("Wait for your turn");
    const chess = new Chess(chessFen(game.chess));
    try {
      const move = chess.move({ from, to, promotion: typeof promotion === "string" ? promotion : undefined });
      game.chess = chessState(chess, move.from, move.to);
      if (chess.isGameOver()) game.status = "FINISHED";
    } catch {
      throw new GameManagerError("That Chess move is not legal");
    }
    return game;
  }

  requestTicTacToeRematch(gameId: string, playerId: string): Game {
    const game = this.getGame(gameId);
    if (game.gameType !== "TIC_TAC_TOE" || !game.ticTacToe) {
      throw new GameManagerError("This game does not support Tic-Tac-Toe rematches");
    }
    if (game.status !== "FINISHED") {
      throw new GameManagerError("Finish the game before requesting a rematch");
    }
    if (!game.players.some((player) => player.id === playerId)) {
      throw new GameManagerError("Player is not in this game");
    }

    if (!game.ticTacToe.rematchVotes.includes(playerId)) {
      game.ticTacToe.rematchVotes.push(playerId);
    }
    if (game.ticTacToe.rematchVotes.length === MAX_PLAYERS_PER_GAME) {
      game.ticTacToe.board = Array(9).fill(null);
      game.ticTacToe.turn = game.players[0].id;
      game.ticTacToe.winner = null;
      game.ticTacToe.rematchVotes = [];
      game.status = "IN_PROGRESS";
    }
    return game;
  }

  requestSnakeRematch(gameId: string, playerId: string): Game {
    const game = this.getGame(gameId);
    if (game.gameType !== "SNAKE" || !game.snake) {
      throw new GameManagerError("This game does not support Snake rematches");
    }
    if (game.status !== "FINISHED") {
      throw new GameManagerError("Finish the game before requesting a rematch");
    }
    if (!game.players.some((player) => player.id === playerId)) {
      throw new GameManagerError("Player is not in this game");
    }
    if (!game.snake.rematchVotes.includes(playerId)) game.snake.rematchVotes.push(playerId);
    if (game.snake.rematchVotes.length === MAX_PLAYERS_PER_GAME) {
      game.snake = createSnakeState(game.players);
      game.status = "IN_PROGRESS";
    }
    return game;
  }

  requestRematch(gameId: string, playerId: string): Game {
    const game = this.getGame(gameId);
    if (game.status !== "FINISHED" || !game.rematch) throw new GameManagerError("This game is not ready for a rematch");
    if (!game.players.some((player) => player.id === playerId)) throw new GameManagerError("Player is not in this game");
    game.rematch = { requestedBy: playerId, acceptedBy: [playerId], declinedBy: [] };
    return game;
  }

  respondRematch(gameId: string, playerId: string, accept: boolean): Game {
    const game = this.getGame(gameId);
    if (game.status !== "FINISHED" || !game.rematch?.requestedBy) throw new GameManagerError("There is no pending rematch request");
    if (game.rematch.requestedBy === playerId || !game.players.some((player) => player.id === playerId)) throw new GameManagerError("Only the other player can respond");
    if (!accept) {
      game.rematch.declinedBy = [playerId];
      return game;
    }
    game.rematch.acceptedBy = [...new Set([...game.rematch.acceptedBy, playerId])];
    if (game.rematch.acceptedBy.length === MAX_PLAYERS_PER_GAME) {
      if (game.gameType === "TIC_TAC_TOE" && game.ticTacToe) {
        game.ticTacToe = { board: Array(9).fill(null), turn: game.players[0].id, winner: null, rematchVotes: [] };
      }
      if (game.gameType === "SNAKE") game.snake = createSnakeState(game.players);
      if (game.gameType === "FLAPPY") game.flappy = createFlappyState(game.players);
      if (game.gameType === "CHESS") game.chess = createChessState();
      game.rematch = { requestedBy: null, acceptedBy: [], declinedBy: [] };
      game.status = "IN_PROGRESS";
    }
    return game;
  }

  joinGame(gameId: string, player: Player): Game {
    const game = this.getGame(gameId);
    validatePlayer(player);
    if (game.status !== "WAITING") {
      throw new GameManagerError("Game has already started");
    }
    if (
      game.players.some((existingPlayer) => existingPlayer.id === player.id)
    ) {
      throw new GameManagerError("Duplicate player");
    }
    if (game.players.length >= MAX_PLAYERS_PER_GAME) {
      throw new GameManagerError("Game is already full");
    }

    game.players.push(player);
    if (game.players.length === MAX_PLAYERS_PER_GAME) {
      game.status = "IN_PROGRESS";
      if (game.gameType === "SNAKE") {
        game.snake = createSnakeState(game.players);
      }
      if (game.gameType === "FLAPPY") {
        game.flappy = createFlappyState(game.players);
      }
    }
    return game;
  }

  makeSnakeMove(gameId: string, playerId: string, direction: unknown): Game {
    const game = this.getGame(gameId);
    if (game.gameType !== "SNAKE" || !game.snake) {
      throw new GameManagerError("This game does not support Snake moves");
    }
    if (game.status !== "IN_PROGRESS") {
      throw new GameManagerError("The game is not in progress");
    }
    if (!isSnakeDirection(direction)) {
      throw new GameManagerError("Choose a valid Snake direction");
    }
    const snakePlayer = game.snake.players.find((player) => player.playerId === playerId);
    if (!snakePlayer || !snakePlayer.alive) {
      throw new GameManagerError("You are not active in this game");
    }
    if (direction.x === -snakePlayer.direction.x && direction.y === -snakePlayer.direction.y) {
      return game;
    }
    snakePlayer.direction = direction;
    return game;
  }

  makeFlappyFlap(gameId: string, playerId: string): Game {
    const game = this.getGame(gameId);
    const player = game.flappy?.players?.find(({ playerId: id }) => id === playerId);
    if (game.gameType !== "FLAPPY" || !game.flappy || !player) throw new GameManagerError("This game does not support Flappy moves");
    if (game.status !== "IN_PROGRESS" || !player.alive) throw new GameManagerError("The game is not in progress");
    player.velocity = -2.8;
    return game;
  }

  advanceFlappyGames(): Game[] {
    const updatedGames: Game[] = [];
    for (const game of this.games.values()) {
      if (game.status !== "IN_PROGRESS" || game.gameType !== "FLAPPY" || !game.flappy?.players) continue;
      advanceFlappy(game.flappy);
      if (game.flappy.winner) game.status = "FINISHED";
      updatedGames.push(game);
    }
    return updatedGames;
  }

  advanceSnakeGames(): Game[] {
    const updatedGames: Game[] = [];
    for (const game of this.games.values()) {
      if (game.status !== "IN_PROGRESS" || game.gameType !== "SNAKE" || !game.snake) continue;
      advanceSnake(game.snake);
      if (game.snake.winner) game.status = "FINISHED";
      updatedGames.push(game);
    }
    return updatedGames;
  }

  findWaitingGame(gameType: unknown, config: unknown): Game | undefined {
    const validGameType = validateGameType(gameType);
    const validConfig = validateGameConfig(validGameType, config);

    return [...this.games.values()].find(
      (game) =>
        game.status === "WAITING" &&
        game.players.length < MAX_PLAYERS_PER_GAME &&
        game.gameType === validGameType &&
        configsMatch(game.config, validConfig),
    );
  }

  getGame(gameId: string): Game {
    if (!gameId.trim()) {
      throw new GameManagerError("Invalid game ID");
    }
    const game = this.games.get(gameId);
    if (!game) {
      throw new GameManagerError("Game not found");
    }
    return game;
  }

  removeGame(gameId: string): void {
    this.getGame(gameId);
    this.games.delete(gameId);
  }

  closeFinishedGame(gameId: string, playerId: string): Game {
    const game = this.getGame(gameId);
    if (game.status !== "FINISHED") {
      throw new GameManagerError("Only finished games can be closed");
    }
    if (!game.players.some((player) => player.id === playerId)) {
      throw new GameManagerError("Player is not in this game");
    }
    this.games.delete(gameId);
    return game;
  }

  hasGame(gameId: string): boolean {
    return this.games.has(gameId);
  }

  removePlayer(gameId: string, playerId: string): void {
    const game = this.getGame(gameId);
    if (!playerId.trim()) {
      throw new GameManagerError("Invalid player ID");
    }
    if (!game.players.some((player) => player.id === playerId)) {
      throw new GameManagerError("Player is not in this game");
    }
    game.players = game.players.filter((player) => player.id !== playerId);
    if (game.players.length === 0) {
      this.games.delete(gameId);
    } else {
      game.status = "WAITING";
    }
  }
}

function hasWinningLine(
  board: (TicTacToeMark | null)[],
  mark: TicTacToeMark,
): boolean {
  return [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ].some((line) => line.every((cell) => board[cell] === mark));
}

function createChessState(): ChessState {
  return chessState(new Chess(), null, null);
}

function chessState(chess: Chess, from: string | null, to: string | null): ChessState {
  const board = chess.board();
  const pieces = board.flatMap((rank) => rank.map((piece) => piece?.type ?? null));
  const colors = board.flatMap((rank) => rank.map((piece) => piece?.color ?? null));
  const winner: ChessState["winner"] = chess.isCheckmate() ? (chess.turn() === "w" ? "b" : "w") : chess.isDraw() ? "DRAW" : null;
  return { fen: chess.fen(), board: pieces, colors, turn: chess.turn(), winner, check: chess.inCheck(), lastMove: from && to ? { from, to } : null };
}

function chessFen(state: ChessState): string {
  return state.fen;
}

function createSnakeState(players: Player[]): SnakeState {
  return {
    width: 24,
    height: 14,
    food: { x: 12, y: 7 },
    winner: null,
    rematchVotes: [],
    players: [
      { playerId: players[0].id, body: [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }], direction: { x: 1, y: 0 }, score: 0, alive: true },
      { playerId: players[1].id, body: [{ x: 19, y: 9 }, { x: 20, y: 9 }, { x: 21, y: 9 }], direction: { x: -1, y: 0 }, score: 0, alive: true },
    ],
  };
}

function advanceSnake(state: SnakeState): void {
  const nextHeads = state.players.map((snakePlayer) => {
    const head = snakePlayer.body[0];
    return { x: head.x + snakePlayer.direction.x, y: head.y + snakePlayer.direction.y };
  });

  state.players.forEach((snakePlayer, index) => {
    if (!snakePlayer.alive) return;
    const nextHead = nextHeads[index];
    const hitWall = nextHead.x < 0 || nextHead.x >= state.width || nextHead.y < 0 || nextHead.y >= state.height;
    const hitSelf = snakePlayer.body.some((part) => part.x === nextHead.x && part.y === nextHead.y);
    const hitOpponent = state.players.some((other, otherIndex) => otherIndex !== index && other.alive && other.body.some((part) => part.x === nextHead.x && part.y === nextHead.y));
    const hitHead = nextHeads.some((head, otherIndex) => otherIndex !== index && state.players[otherIndex].alive && head.x === nextHead.x && head.y === nextHead.y);
    if (hitWall || hitSelf || hitOpponent || hitHead) {
      snakePlayer.alive = false;
      return;
    }
    snakePlayer.body = [nextHead, ...snakePlayer.body];
    if (nextHead.x === state.food.x && nextHead.y === state.food.y) {
      snakePlayer.score += 1;
      state.food = nextFood(state);
    } else {
      snakePlayer.body.pop();
    }
  });

  const alivePlayers = state.players.filter((snakePlayer) => snakePlayer.alive);
  if (alivePlayers.length <= 1) {
    state.winner = alivePlayers.length === 1 ? alivePlayers[0].playerId : "DRAW";
    state.players.forEach((snakePlayer) => {
      if (!snakePlayer.alive) snakePlayer.body = [];
    });
  }
}

function nextFood(state: SnakeState): { x: number; y: number } {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const food = { x: Math.floor(Math.random() * state.width), y: Math.floor(Math.random() * state.height) };
    if (!state.players.some((snakePlayer) => snakePlayer.body.some((part) => part.x === food.x && part.y === food.y))) return food;
  }
  return { x: 0, y: 0 };
}

function isSnakeDirection(value: unknown): value is SnakeDirection {
  if (!isPlainObject(value) || typeof value.x !== "number" || typeof value.y !== "number") return false;
  return Math.abs(value.x) + Math.abs(value.y) === 1;
}

function createFlappyState(players: Player[]): FlappyState {
  const flappyPlayers: FlappyPlayerState[] = players.map((player) => ({
    playerId: player.id,
    birdY: 45,
    velocity: 0,
    score: 0,
    alive: true,
  }));
  return { score: 0, bestScore: 0, birdY: 45, velocity: 0, pipeX: 100, pipeGapY: 48, running: true, players: flappyPlayers, winner: null, rematchVotes: [] };
}

function advanceFlappy(state: FlappyState): void {
  state.pipeX -= 1.7;
  if (state.pipeX < -12) {
    state.pipeX = 100;
    state.pipeGapY = 25 + Math.random() * 45;
  }
  state.players?.forEach((player) => {
    if (!player.alive) return;
    player.velocity += 0.18;
    player.birdY += player.velocity;
    const passedPipe = state.pipeX > 16 && state.pipeX < 18;
    const hitPipe = state.pipeX > 10 && state.pipeX < 29 && (player.birdY < state.pipeGapY - 12 || player.birdY > state.pipeGapY + 12);
    if (player.birdY < 0 || player.birdY > 94 || hitPipe) {
      player.alive = false;
    } else if (passedPipe) {
      player.score += 1;
    }
  });
  const alive = state.players?.filter((player) => player.alive) ?? [];
  if (alive.length <= 1) {
    state.winner = alive.length === 1 ? alive[0].playerId : "DRAW";
    state.running = false;
  }
}

function validateGameType(gameType: unknown): GameType {
  if (
    typeof gameType !== "string" ||
    !GAME_TYPES.includes(gameType as GameType)
  ) {
    throw new GameManagerError("Invalid game type");
  }
  return gameType as GameType;
}

function validateGameConfig(gameType: GameType, config: unknown): GameConfig {
  if (!isPlainObject(config)) {
    throw new GameManagerError("Invalid game configuration");
  }

  if (gameType === "CHESS") {
    if (
      Object.keys(config).length !== 1 ||
      typeof config.mode !== "string" ||
      !CHESS_MODES.includes(config.mode as (typeof CHESS_MODES)[number])
    ) {
      throw new GameManagerError("Invalid game configuration");
    }
    return { mode: config.mode };
  }

  if (Object.keys(config).length !== 0) {
    throw new GameManagerError("Invalid game configuration");
  }
  return {};
}

function configsMatch(first: GameConfig, second: GameConfig): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePlayer(player: Player): void {
  if (!player.id.trim()) {
    throw new GameManagerError("Invalid player ID");
  }
}
