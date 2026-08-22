import { randomUUID } from "node:crypto";
import type { Game, GameConfig, GameType, Player } from "@opengames/shared";

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
    };
    this.games.set(game.id, game);
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
    }
    return game;
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
