import express from "express";
import { createServer } from "http";
import { Server, type Socket } from "socket.io";
import type { Game, GameConfig, GameType } from "@opengames/shared";
import { GameManager, GameManagerError } from "./managers/GameManager";

const app = express();
const httpServer = createServer(app);

/**
 * Allowed frontend origins
 *
 * Local development:
 * - Vite: http://localhost:5173
 * - Other local frontend: http://localhost:3000
 *
 * Production:
 * - Vercel frontend
 */
const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "https://opengames-web.vercel.app",
];

/**
 * Read additional origins from Render environment variables.
 *
 * Example:
 *
 * CLIENT_URL=https://opengames-web.vercel.app
 *
 * OR:
 *
 * ALLOWED_ORIGINS=http://localhost:5173,https://opengames-web.vercel.app
 */

/**
 * Vercel gives preview deployments a unique subdomain. Keep this limited to
 * this frontend project rather than allowing every `*.vercel.app` origin.

/**
 * Socket.IO server
 */
const io = new Server(httpServer, {
  cors: {
    origin: defaultAllowedOrigins,
  },
});

/**
 * Game manager
 */
const gameManager = new GameManager();

type CreateGameRequest = {
  gameType: GameType;
  config: GameConfig;
  playerName?: string;
};

type JoinGameRequest = {
  gameId: string;
  playerName?: string;
};

type FindOpponentRequest = {
  gameType: GameType;
  config: GameConfig;
  playerName?: string;
};

type GameResponse = { game: Game | undefined } | { error: string };

type GameEvent = {
  game: Game;
};

type GameErrorEvent = {
  message: string;
};

type TicTacToeMoveRequest = {
  gameId: string;
  cell: number;
};

type SnakeMoveRequest = {
  gameId: string;
  direction: {
    x: number;
    y: number;
  };
};

type ChessMoveRequest = {
  gameId: string;
  from: string;
  to: string;
  promotion?: string;
};

type RematchResponseRequest = {
  gameId: string;
  accept: boolean;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof GameManagerError
    ? error.message
    : "Unable to complete request";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCreateGameRequest = (value: unknown): value is CreateGameRequest =>
  isObject(value) &&
  "gameType" in value &&
  isObject(value.config) &&
  (value.playerName === undefined || typeof value.playerName === "string");

const isJoinGameRequest = (value: unknown): value is JoinGameRequest =>
  isObject(value) &&
  typeof value.gameId === "string" &&
  (value.playerName === undefined || typeof value.playerName === "string");

const isFindOpponentRequest = (value: unknown): value is FindOpponentRequest =>
  isObject(value) &&
  "gameType" in value &&
  isObject(value.config) &&
  (value.playerName === undefined || typeof value.playerName === "string");

const isTicTacToeMoveRequest = (
  value: unknown,
): value is TicTacToeMoveRequest =>
  isObject(value) &&
  typeof value.gameId === "string" &&
  typeof value.cell === "number";

const isSnakeMoveRequest = (value: unknown): value is SnakeMoveRequest =>
  isObject(value) &&
  typeof value.gameId === "string" &&
  isObject(value.direction) &&
  typeof value.direction.x === "number" &&
  typeof value.direction.y === "number";

const isChessMoveRequest = (value: unknown): value is ChessMoveRequest =>
  isObject(value) &&
  typeof value.gameId === "string" &&
  typeof value.from === "string" &&
  typeof value.to === "string" &&
  (value.promotion === undefined || typeof value.promotion === "string");

const isRematchResponseRequest = (
  value: unknown,
): value is RematchResponseRequest =>
  isObject(value) &&
  typeof value.gameId === "string" &&
  typeof value.accept === "boolean";

const emitGameError = (socket: Socket, message: string): void => {
  socket.emit("game-error", {
    message,
  } satisfies GameErrorEvent);
};

const emitGameStarted = (game: Game): void => {
  io.to(game.id).emit("game-started", { game } satisfies GameEvent);
};

/**
 * Socket.IO connection
 */
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on(
    "create-game",
    (request: unknown, callback?: (response: GameResponse) => void) => {
      try {
        if (!isCreateGameRequest(request)) {
          throw new GameManagerError("Invalid create-game request");
        }

        const game = gameManager.createGame(
          request.gameType,
          {
            id: socket.id,
            name: request.playerName,
          },
          request.config,
        );

        void socket.join(game.id);

        socket.emit("game-created", {
          game,
        } satisfies GameEvent);

        callback?.({ game });
      } catch (error) {
        const message = getErrorMessage(error);

        emitGameError(socket, message);

        callback?.({
          error: message,
        });
      }
    },
  );

  socket.on(
    "join-game",
    (request: unknown, callback?: (response: GameResponse) => void) => {
      try {
        if (!isJoinGameRequest(request)) {
          throw new GameManagerError("Invalid join-game request");
        }

        const game = gameManager.joinGame(request.gameId, {
          id: socket.id,
          name: request.playerName,
        });

        void socket.join(game.id);

        socket.to(game.id).emit("player-joined", {
          player: game.players.at(-1),
          game,
        });

        io.to(game.id).emit("game-updated", game);

        emitGameStarted(game);

        callback?.({ game });
      } catch (error) {
        const message = getErrorMessage(error);

        emitGameError(socket, message);

        callback?.({
          error: message,
        });
      }
    },
  );

  socket.on(
    "find-opponent",
    (request: unknown, callback?: (response: GameResponse) => void) => {
      try {
        if (!isFindOpponentRequest(request)) {
          throw new GameManagerError("Invalid find-opponent request");
        }

        const waitingGame = gameManager.findWaitingGame(
          request.gameType,
          request.config,
        );

        if (!waitingGame) {
          const message = "No opponent found";

          socket.emit("opponent-not-found", {
            message,
          } satisfies GameErrorEvent);

          callback?.({
            error: message,
          });

          return;
        }

        const game = gameManager.joinGame(waitingGame.id, {
          id: socket.id,
          name: request.playerName,
        });

        void socket.join(game.id);

        socket.to(game.id).emit("player-joined", {
          player: game.players.at(-1),
          game,
        });

        io.to(game.id).emit("game-updated", game);

        emitGameStarted(game);

        callback?.({ game });
      } catch (error) {
        const message = getErrorMessage(error);

        emitGameError(socket, message);

        callback?.({
          error: message,
        });
      }
    },
  );

  socket.on("tic-tac-toe-move", (request: unknown) => {
    try {
      if (!isTicTacToeMoveRequest(request)) {
        throw new GameManagerError("Invalid move request");
      }

      const game = gameManager.makeTicTacToeMove(
        request.gameId,
        socket.id,
        request.cell,
      );

      io.to(game.id).emit("game-updated", game);
    } catch (error) {
      emitGameError(socket, getErrorMessage(error));
    }
  });

  socket.on("chess-move", (request: unknown) => {
    try {
      if (!isChessMoveRequest(request)) {
        throw new GameManagerError("Invalid Chess move request");
      }

      const game = gameManager.makeChessMove(
        request.gameId,
        socket.id,
        request.from,
        request.to,
        request.promotion,
      );

      io.to(game.id).emit("game-updated", game);
    } catch (error) {
      emitGameError(socket, getErrorMessage(error));
    }
  });

  socket.on("tic-tac-toe-rematch", (gameId: unknown) => {
    try {
      if (typeof gameId !== "string") {
        throw new GameManagerError("Invalid rematch request");
      }

      const game = gameManager.requestTicTacToeRematch(gameId, socket.id);

      io.to(game.id).emit("game-updated", game);

      if (game.status === "IN_PROGRESS") {
        emitGameStarted(game);
      }
    } catch (error) {
      emitGameError(socket, getErrorMessage(error));
    }
  });

  socket.on("snake-move", (request: unknown) => {
    try {
      if (!isSnakeMoveRequest(request)) {
        throw new GameManagerError("Invalid Snake move request");
      }

      const game = gameManager.makeSnakeMove(
        request.gameId,
        socket.id,
        request.direction,
      );

      io.to(game.id).emit("game-updated", game);
    } catch (error) {
      emitGameError(socket, getErrorMessage(error));
    }
  });

  socket.on("snake-rematch", (gameId: unknown) => {
    try {
      if (typeof gameId !== "string") {
        throw new GameManagerError("Invalid rematch request");
      }

      const game = gameManager.requestSnakeRematch(gameId, socket.id);

      io.to(game.id).emit("game-updated", game);

      if (game.status === "IN_PROGRESS") {
        emitGameStarted(game);
      }
    } catch (error) {
      emitGameError(socket, getErrorMessage(error));
    }
  });

  socket.on("flappy-flap", (gameId: unknown) => {
    try {
      if (typeof gameId !== "string") {
        throw new GameManagerError("Invalid Flappy move request");
      }

      const game = gameManager.makeFlappyFlap(gameId, socket.id);

      io.to(game.id).emit("game-updated", game);
    } catch (error) {
      emitGameError(socket, getErrorMessage(error));
    }
  });

  socket.on("request-rematch", (gameId: unknown) => {
    try {
      if (typeof gameId !== "string") {
        throw new GameManagerError("Invalid game ID");
      }

      const game = gameManager.requestRematch(gameId, socket.id);

      io.to(game.id).emit("game-updated", game);
    } catch (error) {
      emitGameError(socket, getErrorMessage(error));
    }
  });

  socket.on("respond-rematch", (request: unknown) => {
    try {
      if (!isRematchResponseRequest(request)) {
        throw new GameManagerError("Invalid rematch response");
      }

      const game = gameManager.respondRematch(
        request.gameId,
        socket.id,
        request.accept,
      );

      io.to(game.id).emit("game-updated", game);

      if (game.status === "IN_PROGRESS") {
        emitGameStarted(game);
      }
    } catch (error) {
      emitGameError(socket, getErrorMessage(error));
    }
  });

  socket.on(
    "leave-game",
    (gameId: unknown, callback?: (response: GameResponse) => void) => {
      try {
        if (typeof gameId !== "string") {
          throw new GameManagerError("Invalid game ID");
        }

        const game = gameManager.getGame(gameId);

        gameManager.removePlayer(gameId, socket.id);

        void socket.leave(game.id);

        const updatedGame = gameManager.hasGame(game.id)
          ? gameManager.getGame(game.id)
          : undefined;

        if (updatedGame) {
          io.to(game.id).emit("game-updated", updatedGame);
        }

        callback?.({
          game: updatedGame,
        });
      } catch (error) {
        const message = getErrorMessage(error);

        emitGameError(socket, message);

        callback?.({
          error: message,
        });
      }
    },
  );

  socket.on("close-finished-game", (gameId: unknown) => {
    try {
      if (typeof gameId !== "string") {
        throw new GameManagerError("Invalid game ID");
      }

      const game = gameManager.closeFinishedGame(gameId, socket.id);

      io.to(game.id).emit("game-closed", {
        message: "The game was closed.",
        closedBy: socket.id,
      });

      io.in(game.id).socketsLeave(game.id);
    } catch (error) {
      emitGameError(socket, getErrorMessage(error));
    }
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
  });
});

/**
 * Snake + Flappy game loop
 */
setInterval(() => {
  for (const game of gameManager.advanceSnakeGames()) {
    if (game.status === "IN_PROGRESS" || game.status === "FINISHED") {
      io.to(game.id).emit("game-updated", game);
    }
  }

  for (const game of gameManager.advanceFlappyGames()) {
    io.to(game.id).emit("game-updated", game);
  }
}, 150);

/**
 * Render provides PORT through environment variables.
 */
const port = Number(process.env.PORT ?? 3000);

httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
