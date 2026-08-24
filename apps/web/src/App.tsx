import { useEffect, useMemo, useState } from "react";
import type {
  ChessMode,
  Game,
  GameConfig,
  GameType,
  TicTacToeMark,
} from "@opengames/shared";
import "./App.css";
import { socket } from "./socket";

type Screen = "selection" | "matchmaking" | "configuration" | "single-player" | "waiting" | "started";
type GameEvent = { game: Game };
type ErrorEvent = { message: string; closedBy?: string };
type SnakePoint = { x: number; y: number };

const games: { type: GameType; label: string; description: string }[] = [
  { type: "CHESS", label: "Chess", description: "Classic strategy" },
  { type: "TIC_TAC_TOE", label: "Tic-Tac-Toe", description: "Quick 3×3 match" },
  { type: "SNAKE", label: "Snake", description: "Arcade showdown" },
  { type: "FLAPPY", label: "Flappy", description: "Timing challenge" },
];
const chessModes: ChessMode[] = ["BULLET", "BLITZ", "RAPID"];

function App() {
  const [screen, setScreen] = useState<Screen>("selection");
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [chessMode, setChessMode] = useState<ChessMode>("RAPID");
  const [playerName, setPlayerName] = useState("Player");
  const [gameIdToJoin, setGameIdToJoin] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [showGameId, setShowGameId] = useState(false);
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState(socket.connected);
  const [snake, setSnake] = useState<SnakePoint[]>([]);
  const [snakeFood, setSnakeFood] = useState<SnakePoint>({ x: 14, y: 6 });
  const [snakeDirection, setSnakeDirection] = useState<SnakePoint>({ x: 1, y: 0 });
  const [snakeRunning, setSnakeRunning] = useState(true);
  const [snakeHighScore, setSnakeHighScore] = useState(0);
  const [flappyBirdY, setFlappyBirdY] = useState(45);
  const [flappyVelocity, setFlappyVelocity] = useState(0);
  const [flappyPipeX, setFlappyPipeX] = useState(100);
  const [flappyGapY, setFlappyGapY] = useState(48);
  const [flappyScore, setFlappyScore] = useState(0);
  const [flappyBestScore, setFlappyBestScore] = useState(0);
  const [flappyRunning, setFlappyRunning] = useState(false);

  const config = useMemo<GameConfig>(
    () => (selectedGame === "CHESS" ? { mode: chessMode } : {}),
    [chessMode, selectedGame],
  );

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onGameCreated = ({ game: createdGame }: GameEvent) => {
      setGame(createdGame);
      setScreen("waiting");
      setMessage("");
    };
    const onGameStarted = ({ game: startedGame }: GameEvent) => {
      setGame(startedGame);
      setScreen("started");
      setMessage("");
    };
    const onGameUpdated = (updatedGame: Game) => setGame(updatedGame);
    const onGameClosed = ({ message: closeMessage, closedBy }: ErrorEvent) => {
      if (closedBy === socket.id) return;
      setGame(null);
      setSelectedGame(null);
      setShowGameId(false);
      setScreen("selection");
      setMessage(closeMessage);
    };
    const onPlayerJoined = ({ game: updatedGame }: GameEvent) => {
      setGame(updatedGame);
      setMessage("Opponent joined. Starting game...");
    };
    const onGameError = ({ message: errorMessage }: ErrorEvent) =>
      setMessage(errorMessage);

    socket.connect();
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("game-created", onGameCreated);
    socket.on("player-joined", onPlayerJoined);
    socket.on("game-started", onGameStarted);
    socket.on("game-updated", onGameUpdated);
    socket.on("game-closed", onGameClosed);
    socket.on("game-error", onGameError);
    socket.on("opponent-not-found", onGameError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("game-created", onGameCreated);
      socket.off("player-joined", onPlayerJoined);
      socket.off("game-started", onGameStarted);
      socket.off("game-updated", onGameUpdated);
      socket.off("game-closed", onGameClosed);
      socket.off("game-error", onGameError);
      socket.off("opponent-not-found", onGameError);
      socket.disconnect();
    };
  }, []);

  const normalizedPlayerName = () => playerName.trim() || "Player";
  const chooseGame = (gameType: GameType) => {
    setSelectedGame(gameType);
    setMessage("");
    if (gameType === "SNAKE") {
      setScreen("matchmaking");
      return;
    }
    setScreen("matchmaking");
    startQuickPlay(gameType, chessMode);
  };
  const startQuickPlay = (gameType: GameType, mode: ChessMode) => {
    const quickPlayConfig: GameConfig = gameType === "CHESS" ? { mode } : {};
    setMessage("Finding players...");
    socket.emit(
      "find-opponent",
      { gameType, config: quickPlayConfig, playerName: normalizedPlayerName() },
      (response: { game?: Game }) => {
        if (response.game) {
          setGame(response.game);
          return;
        }
        setMessage("No player found yet. Opening a waiting room...");
        socket.emit("create-game", {
          gameType,
          config: quickPlayConfig,
          playerName: normalizedPlayerName(),
        });
      },
    );
  };
  const createGame = () => {
    if (!selectedGame) return;
    setShowGameId(true);
    setMessage("");
    socket.emit("create-game", {
      gameType: selectedGame,
      config,
      playerName: normalizedPlayerName(),
    });
  };
  const findOpponent = () => {
    if (!selectedGame) return;
    setMessage("Searching for a matching waiting game...");
    socket.emit(
      "find-opponent",
      { gameType: selectedGame, config, playerName: normalizedPlayerName() },
      (response: { game?: Game }) => {
        if (response.game) setGame(response.game);
      },
    );
  };
  const joinGame = () => {
    const gameId = gameIdToJoin.trim();
    if (!gameId) {
      setMessage("Enter a game ID to join.");
      return;
    }
    setShowGameId(false);
    setMessage("");
    socket.emit("join-game", { gameId, playerName: normalizedPlayerName() });
  };
  const leaveGame = () => {
    if (game) socket.emit("leave-game", game.id);
    setGame(null);
    setShowGameId(false);
    setMessage("");
    setScreen("selection");
  };
  const goHome = () => {
    setMessage("");
    setSelectedGame(null);
    setGame(null);
    setShowGameId(false);
    setScreen("selection");
  };
  const openRoomManager = () => {
    setSelectedGame(selectedGame ?? "CHESS");
    setScreen("configuration");
  };
  const startSinglePlayer = (gameType: GameType) => {
    setSelectedGame(gameType);
    if (gameType === "FLAPPY") {
      setFlappyBirdY(45);
      setFlappyVelocity(0);
      setFlappyPipeX(100);
      setFlappyGapY(48);
      setFlappyScore(0);
      setFlappyRunning(true);
      setMessage("");
      setScreen("single-player");
      return;
    }
    if (gameType !== "SNAKE") {
      setMessage("Single player is currently available for Snake and Flappy.");
      return;
    }
    setSnake([{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }]);
    setSnakeFood({ x: 14, y: 6 });
    setSnakeDirection({ x: 1, y: 0 });
    setSnakeRunning(true);
    setMessage("");
    setScreen("single-player");
  };
  const handleBack = () => {
    if (screen === "configuration") {
      setScreen("matchmaking");
      return;
    }
    if (screen === "matchmaking") {
      goHome();
      return;
    }
    if (screen === "single-player") {
      goHome();
      return;
    }
    leaveGame();
  };

  useEffect(() => {
    if (screen !== "single-player" || selectedGame !== "SNAKE" || !snakeRunning) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Record<string, SnakePoint> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
      };
      const nextDirection = directions[event.key] ?? directions[event.key.toLowerCase()];
      if (nextDirection && nextDirection.x !== -snakeDirection.x && nextDirection.y !== -snakeDirection.y) {
        event.preventDefault();
        setSnakeDirection(nextDirection);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const interval = window.setInterval(() => {
      setSnake((currentSnake) => {
        const head = currentSnake[0];
        const nextHead = { x: head.x + snakeDirection.x, y: head.y + snakeDirection.y };
        const hitWall = nextHead.x < 0 || nextHead.x >= 20 || nextHead.y < 0 || nextHead.y >= 12;
        const hitSelf = currentSnake.some((part) => part.x === nextHead.x && part.y === nextHead.y);
        if (hitWall || hitSelf) {
          setSnakeRunning(false);
          return currentSnake;
        }
        const nextSnake = [nextHead, ...currentSnake];
        if (nextHead.x === snakeFood.x && nextHead.y === snakeFood.y) {
          setSnakeHighScore((score) => Math.max(score, nextSnake.length - 3));
          setSnakeFood({ x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 12) });
          return nextSnake;
        }
        nextSnake.pop();
        return nextSnake;
      });
    }, 150);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearInterval(interval);
    };
  }, [screen, selectedGame, snakeDirection, snakeFood, snakeRunning]);

  const flap = () => {
    if (screen === "single-player" && selectedGame === "FLAPPY" && flappyRunning) setFlappyVelocity(-2.8);
  };

  useEffect(() => {
    if (screen !== "single-player" || selectedGame !== "FLAPPY" || !flappyRunning) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "ArrowUp") {
        event.preventDefault();
        flap();
      }
    };
    const interval = window.setInterval(() => {
      setFlappyVelocity((velocity) => velocity + 0.18);
      setFlappyBirdY((birdY) => birdY + flappyVelocity);
      setFlappyPipeX((pipeX) => {
        const nextPipeX = pipeX - 1.6;
        if (nextPipeX < -12) {
          setFlappyGapY(25 + Math.random() * 45);
          setFlappyScore((score) => {
            setFlappyBestScore((best) => Math.max(best, score + 1));
            return score + 1;
          });
          return 100;
        }
        return nextPipeX;
      });
    }, 40);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [flappyRunning, flappyVelocity, screen, selectedGame]);

  useEffect(() => {
    if (screen !== "single-player" || selectedGame !== "FLAPPY" || !flappyRunning) return;
    const birdHitPipe = flappyPipeX > 13 && flappyPipeX < 29 && (flappyBirdY < flappyGapY - 12 || flappyBirdY > flappyGapY + 12);
    if (flappyBirdY < 0 || flappyBirdY > 94 || birdHitPipe) {
      setFlappyRunning(false);
      setFlappyBestScore((best) => Math.max(best, flappyScore));
    }
  }, [flappyBirdY, flappyGapY, flappyPipeX, flappyScore, flappyRunning, screen, selectedGame]);

  const playTicTacToe = (cell: number) => {
    if (!game || game.gameType !== "TIC_TAC_TOE") return;
    socket.emit("tic-tac-toe-move", { gameId: game.id, cell });
  };

  const sendSnakeMove = (direction: SnakePoint) => {
    if (!game || game.gameType !== "SNAKE") return;
    socket.emit("snake-move", { gameId: game.id, direction });
  };

  const flapMultiplayer = () => {
    if (game?.gameType === "FLAPPY") socket.emit("flappy-flap", game.id);
  };

  const requestRematch = () => {
    if (game) socket.emit("request-rematch", game.id);
  };

  const respondRematch = (accept: boolean) => {
    if (game) socket.emit("respond-rematch", { gameId: game.id, accept });
  };

  const rematchControls = () => {
    if (!game?.rematch) return null;
    const request = game.rematch;
    const isRequester = request.requestedBy === socket.id;
    const hasRequest = Boolean(request.requestedBy);
    if (request.declinedBy.length > 0) {
      return <><p className="rematch-status">Rematch declined.</p><button className="primary-button" onClick={requestRematch}>Request again</button></>;
    }
    if (!hasRequest) return <button className="primary-button" onClick={requestRematch}>Request rematch</button>;
    if (isRequester) return <p className="rematch-status">Rematch request sent. Waiting for the other player.</p>;
    return <div className="rematch-choice"><p className="rematch-status">Your opponent wants a new match.</p><div className="action-row centered-actions"><button className="primary-button" onClick={() => respondRematch(true)}>Accept</button><button className="secondary-button" onClick={() => respondRematch(false)}>Decline</button></div></div>;
  };

  useEffect(() => {
    if (screen !== "started" || game?.gameType !== "SNAKE" || !game.snake) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Record<string, SnakePoint> = {
        ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
      };
      const direction = directions[event.key] ?? directions[event.key.toLowerCase()];
      if (direction) {
        event.preventDefault();
        socket.emit("snake-move", { gameId: game.id, direction });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game, screen]);

  useEffect(() => {
    if (screen !== "started" || game?.gameType !== "FLAPPY" || !game.flappy?.players) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "ArrowUp") {
        event.preventDefault();
        socket.emit("flappy-flap", game.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game, screen]);

  const startNewGame = () => {
    if (!game) return;
    const nextGameType = game.gameType;
    const nextConfig = game.config;
    if (game.status === "FINISHED") socket.emit("close-finished-game", game.id);
    else socket.emit("leave-game", game.id);
    setGame(null);
    setShowGameId(true);
    setMessage("Opening a new room...");
    setSelectedGame(nextGameType);
    setScreen("waiting");
    socket.emit("create-game", {
      gameType: nextGameType,
      config: nextConfig,
      playerName: normalizedPlayerName(),
    });
  };

  const ticTacToeMarkForCell = (cell: TicTacToeMark | null) => cell ?? "";
  const steerSnake = (nextDirection: SnakePoint) => {
    if (nextDirection.x === -snakeDirection.x && nextDirection.y === -snakeDirection.y) return;
    setSnakeDirection(nextDirection);
  };
  const myMark: TicTacToeMark | null = game?.players[0]?.id === socket.id ? "X" : game?.players[1]?.id === socket.id ? "O" : null;
  const isMyTurn = Boolean(game?.ticTacToe && myMark && game.ticTacToe.turn === socket.id);

  const gameLabel = game
    ? games.find(({ type }) => type === game.gameType)?.label
    : "";
  const modeLabel =
    typeof game?.config.mode === "string" ? game.config.mode : "Standard";

  return (
    <main className="game-lobby">
      <header className="lobby-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">OG</div>
          <div>
            <p className="eyebrow">OpenGames / Game room</p>
            <h1>Play together<span>.</span></h1>
            <p className="header-note">Small games. Big rematches.</p>
          </div>
        </div>
        <span className={connected ? "connection online" : "connection"}>
          <i aria-hidden="true" /> {connected ? "Live" : "Connecting..."}
        </span>
      </header>

      {screen !== "selection" && (
        <nav className="page-nav" aria-label="Page navigation">
          <button className="back-button" onClick={handleBack}>
            <span aria-hidden="true">←</span> Back
          </button>
          <button className="menu-button" onClick={goHome} aria-label="Back to game menu">
            Game menu
          </button>
        </nav>
      )}

      {screen === "selection" && (
        <section className="lobby-panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">01 / Pick your arena</p>
              <h2>Choose a game</h2>
            </div>
            <span className="round-count">04 games</span>
          </div>
          <p className="lead">
            Pick a game and jump straight into the next open match.
          </p>
          <label className="name-field">
            Your name
            <input
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              maxLength={30}
            />
          </label>
          <div className="game-grid">
            {games.map((gameOption) => (
              <button
                className="game-card"
                key={gameOption.type}
                onClick={() => chooseGame(gameOption.type)}
              >
                <span className={`game-art game-art-${gameOption.type.toLowerCase()}`} aria-hidden="true">
                  {gameOption.type === "CHESS" ? "♞" : gameOption.type === "TIC_TAC_TOE" ? "XO" : gameOption.type === "SNAKE" ? "~" : "↑"}
                </span>
                <span className="game-card-copy">
                  <strong>{gameOption.label}</strong>
                  <span>{gameOption.description}</span>
                </span>
                <span className="card-arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          <div className="join-by-id">
            <label htmlFor="game-id"><span>Have a room code?</span> Join with a game ID</label>
            <div>
              <input
                id="game-id"
                value={gameIdToJoin}
                onChange={(event) => setGameIdToJoin(event.target.value)}
                placeholder="Paste game ID"
              />
              <button className="secondary-button" onClick={joinGame}>
                Join game
              </button>
            </div>
          </div>
          <button className="room-manager-link" onClick={openRoomManager}>
            <span>
              <strong>Room manager</strong>
              <small>Create a private room or join with a code</small>
            </span>
            <span aria-hidden="true">↗</span>
          </button>
        </section>
      )}

      {screen === "matchmaking" && selectedGame && (
        <section className="lobby-panel matchmaking-panel">
          <p className="section-kicker">Quick play / {games.find(({ type }) => type === selectedGame)?.label}</p>
          {selectedGame === "SNAKE" ? (
            <>
              <h2>Choose how to play</h2>
              <p className="lead">Warm up alone or invite another player to an arcade showdown.</p>
              <div className="snake-mode-grid">
                <button className="snake-mode-card featured" onClick={() => startSinglePlayer("SNAKE")}>
                  <span className="mode-card-art" aria-hidden="true">●</span>
                  <strong>Play single player</strong>
                  <span>Eat, grow, and beat your high score.</span>
                </button>
                <button className="snake-mode-card" onClick={() => startQuickPlay("SNAKE", chessMode)}>
                  <span className="mode-card-art multiplayer-art" aria-hidden="true">••</span>
                  <strong>Play multiplayer</strong>
                  <span>Find an opponent or open a room.</span>
                </button>
              </div>
              {message && <p className="search-status">{message}</p>}
            </>
          ) : (
            <>
              <h2>Find your next opponent</h2>
              <p className="lead">We will match you with an open player, then keep your spot ready if the room is still waiting.</p>
              <div className="search-orbit" aria-hidden="true">
                <span className="orbit-ring" />
                <span className="orbit-dot" />
                <span className="orbit-center">{selectedGame === "CHESS" ? "♞" : "OG"}</span>
              </div>
              <p className="search-status">{message || "Finding players..."}</p>
            </>
          )}
          {selectedGame === "CHESS" && (
            <fieldset className="quick-mode-fieldset">
              <legend>Time control</legend>
              <div className="mode-options">
                {chessModes.map((mode) => (
                  <label key={mode} className={chessMode === mode ? "mode-option selected" : "mode-option"}>
                    <input type="radio" name="quick-chess-mode" value={mode} checked={chessMode === mode} onChange={() => setChessMode(mode)} />
                    {mode}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="action-row centered-actions">
            {selectedGame !== "SNAKE" && <button className="primary-button" onClick={() => startQuickPlay(selectedGame, chessMode)}>Search again</button>}
            {selectedGame !== "SNAKE" && <button className="secondary-button" onClick={() => startSinglePlayer(selectedGame)}>Single player</button>}
            <button className="secondary-button" onClick={openRoomManager}>Room manager</button>
          </div>
        </section>
      )}

      {screen === "single-player" && selectedGame === "SNAKE" && (
        <section className="lobby-panel solo-panel">
          <p className="section-kicker">Single player / Snake</p>
          <h2>Snake run</h2>
          <p className="lead">Use the arrow keys, collect the food, and stay inside the board.</p>
          <div className="snake-board" role="grid" aria-label="Single-player Snake board">
            {Array.from({ length: 240 }, (_, index) => {
              const point = { x: index % 20, y: Math.floor(index / 20) };
              const isSnake = snake.some((part) => part.x === point.x && part.y === point.y);
              const isHead = snake[0]?.x === point.x && snake[0]?.y === point.y;
              const isFood = snakeFood.x === point.x && snakeFood.y === point.y;
              return <span className={`snake-cell${isSnake ? " snake-body" : ""}${isHead ? " snake-head" : ""}${isFood ? " snake-food" : ""}`} key={index} />;
            })}
          </div>
          <div className="snake-controls" aria-label="Snake direction controls">
            <button onClick={() => steerSnake({ x: 0, y: -1 })} aria-label="Move up">↑</button>
            <div>
              <button onClick={() => steerSnake({ x: -1, y: 0 })} aria-label="Move left">←</button>
              <button onClick={() => steerSnake({ x: 0, y: 1 })} aria-label="Move down">↓</button>
              <button onClick={() => steerSnake({ x: 1, y: 0 })} aria-label="Move right">→</button>
            </div>
          </div>
          <p className="solo-score">Score <strong>{Math.max(0, snake.length - 3)}</strong> · Best <strong>{snakeHighScore}</strong>{snakeRunning ? "" : " · Run over"}</p>
          {!snakeRunning && <button className="primary-button" onClick={() => startSinglePlayer("SNAKE")}>Play again</button>}
        </section>
      )}

      {screen === "single-player" && selectedGame === "FLAPPY" && (
        <section className="lobby-panel solo-panel">
          <p className="section-kicker">Single player / Flappy</p>
          <h2>Flappy flight</h2>
          <p className="lead">Tap, press Space, or use Up to fly through the gaps.</p>
          <div className="flappy-board" onClick={flap} role="button" tabIndex={0} aria-label="Flappy game board">
            <div className="flappy-cloud cloud-one" aria-hidden="true" />
            <div className="flappy-pipe pipe-top" style={{ left: `${flappyPipeX}%`, height: `${flappyGapY - 12}%` }} />
            <div className="flappy-pipe pipe-bottom" style={{ left: `${flappyPipeX}%`, top: `${flappyGapY + 12}%` }} />
            <div className="flappy-bird" style={{ top: `${flappyBirdY}%` }} aria-hidden="true">◆</div>
          </div>
          <p className="solo-score">Score <strong>{flappyScore}</strong> · Best <strong>{flappyBestScore}</strong>{flappyRunning ? "" : " · Flight over"}</p>
          {!flappyRunning && <button className="primary-button" onClick={() => startSinglePlayer("FLAPPY")}>Fly again</button>}
        </section>
      )}

      {screen === "configuration" && selectedGame && (
        <section className="lobby-panel configuration-panel">
          <p className="eyebrow">
            {games.find(({ type }) => type === selectedGame)?.label}
          </p>
          <h2>Configure your match</h2>
          {selectedGame === "CHESS" ? (
            <fieldset>
              <legend>Time control</legend>
              <div className="mode-options">
                {chessModes.map((mode) => (
                  <label
                    key={mode}
                    className={
                      chessMode === mode
                        ? "mode-option selected"
                        : "mode-option"
                    }
                  >
                    <input
                      type="radio"
                      name="chess-mode"
                      value={mode}
                      checked={chessMode === mode}
                      onChange={() => setChessMode(mode)}
                    />
                    {mode}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="configuration-note">
              This game currently uses the standard room configuration.
            </p>
          )}
          <div className="action-row">
            <button className="primary-button" onClick={createGame}>
              Create game
            </button>
            <button className="secondary-button" onClick={findOpponent}>
              Quick play instead
            </button>
          </div>
        </section>
      )}

      {screen === "waiting" && game && (
        <section className="lobby-panel status-panel">
          <p className="eyebrow">
            {gameLabel} · {modeLabel}
          </p>
          <h2>Waiting for an opponent</h2>
          <div className="waiting-indicator" aria-label="Waiting for a player">
            <span className="waiting-ring" />
            <span>Waiting for a player to join</span>
          </div>
          <div className="players">
            {game.players.map((player, index) => (
              <p key={player.id}>
                Player {index + 1}: <strong>{player.name || "Player"}</strong>
              </p>
            ))}
            <p>
              Player 2: <span>Waiting...</span>
            </p>
          </div>
          {showGameId && <p className="game-id">Game ID <code>{game.id}</code></p>}
          <button className="back-button" onClick={leaveGame}>
            Leave room
          </button>
        </section>
      )}

      {screen === "started" && game && (
        <section className="lobby-panel status-panel">
          <p className="eyebrow">
            {gameLabel} · {modeLabel}
          </p>
          <h2>{game.gameType === "TIC_TAC_TOE" ? (game.ticTacToe?.winner ? "Round complete" : "Make your mark") : game.gameType === "FLAPPY" ? (game.flappy?.winner ? "Flight complete" : "Flappy race") : "Game Started"}</h2>
          {game.gameType === "TIC_TAC_TOE" && game.ticTacToe ? (
            <div className="tic-tac-toe">
              <div className="turn-banner">
                {game.ticTacToe.winner === "DRAW" ? "Draw game" : game.ticTacToe.winner ? `${game.ticTacToe.winner} wins` : isMyTurn ? `Your turn · ${myMark}` : "Opponent's turn"}
              </div>
              <div className="board" role="grid" aria-label="Tic-Tac-Toe board">
                {game.ticTacToe.board.map((cell, index) => (
                  <button className={`board-cell mark-${cell?.toLowerCase() ?? "empty"}`} key={index} onClick={() => playTicTacToe(index)} disabled={Boolean(cell) || !isMyTurn || Boolean(game.ticTacToe?.winner)} aria-label={`Cell ${index + 1}`}>
                    {ticTacToeMarkForCell(cell)}
                  </button>
                ))}
              </div>
              <p className="match-note">You are playing as <strong>{myMark}</strong></p>
              {game.ticTacToe.winner && (
                <div className="rematch-area">
                  <div className="action-row centered-actions">
                    <button className="secondary-button" onClick={startNewGame}>New game</button>
                  </div>
                  {rematchControls()}
                </div>
              )}
            </div>
          ) : (
            game.gameType === "SNAKE" && game.snake ? (
              <div className="multiplayer-snake">
                <div className="snake-match-status">
                  {game.snake.winner === "DRAW" ? "Draw game" : game.snake.winner ? `${game.players.find((player) => player.id === game.snake?.winner)?.name ?? "Opponent"} wins` : "Race for the highest score"}
                </div>
                <div className="snake-board" style={{ gridTemplateColumns: `repeat(${game.snake.width}, 1fr)` }} role="grid" aria-label="Multiplayer Snake board">
                  {Array.from({ length: game.snake.width * game.snake.height }, (_, index) => {
                    const point = { x: index % game.snake!.width, y: Math.floor(index / game.snake!.width) };
                    const snakeIndex = game.snake!.players.findIndex((snakePlayer) => snakePlayer.body.some((part) => part.x === point.x && part.y === point.y));
                    const snakePlayer = game.snake!.players[snakeIndex];
                    const isHead = snakePlayer?.body[0]?.x === point.x && snakePlayer.body[0]?.y === point.y;
                    const isFood = game.snake!.food.x === point.x && game.snake!.food.y === point.y;
                    return <span className={`snake-cell${snakeIndex === 0 ? " snake-body" : snakeIndex === 1 ? " snake-player-two" : ""}${isHead ? " snake-head" : ""}${isFood ? " snake-food" : ""}`} key={index} />;
                  })}
                </div>
                <div className="snake-match-scores">
                  {game.snake.players.map((snakePlayer, index) => <span key={snakePlayer.playerId} className={snakePlayer.playerId === socket.id ? "current-player" : ""}>{game.players[index]?.name ?? `Player ${index + 1}`} <strong>{snakePlayer.score}</strong></span>)}
                </div>
                <div className="snake-controls" aria-label="Multiplayer Snake direction controls">
                  <button onClick={() => sendSnakeMove({ x: 0, y: -1 })} aria-label="Move up">↑</button>
                  <div><button onClick={() => sendSnakeMove({ x: -1, y: 0 })} aria-label="Move left">←</button><button onClick={() => sendSnakeMove({ x: 0, y: 1 })} aria-label="Move down">↓</button><button onClick={() => sendSnakeMove({ x: 1, y: 0 })} aria-label="Move right">→</button></div>
                </div>
                {game.snake.winner && (
                  <div className="rematch-area">
                    <div className="action-row centered-actions">
                      <button className="secondary-button" onClick={startNewGame}>New game</button>
                    </div>
                    {rematchControls()}
                  </div>
                )}
              </div>
            ) : game.gameType === "FLAPPY" && game.flappy?.players ? (
              <div className="multiplayer-flappy">
                <div className="snake-match-status">
                  {game.flappy.winner === "DRAW" ? "Draw game" : game.flappy.winner ? `${game.players.find((player) => player.id === game.flappy?.winner)?.name ?? "Opponent"} wins` : "Fly through the gaps"}
                </div>
                <div className="flappy-board" onClick={flapMultiplayer} role="button" tabIndex={0} aria-label="Multiplayer Flappy game board">
                  <div className="flappy-pipe pipe-top" style={{ left: `${game.flappy.pipeX}%`, height: `${game.flappy.pipeGapY - 12}%` }} />
                  <div className="flappy-pipe pipe-bottom" style={{ left: `${game.flappy.pipeX}%`, top: `${game.flappy.pipeGapY + 12}%` }} />
                  {game.flappy.players.map((player, index) => <div className={`flappy-bird multiplayer-bird bird-${index}`} style={{ top: `${player.birdY}%` }} key={player.playerId} aria-hidden="true">◆</div>)}
                </div>
                <div className="snake-match-scores">
                  {game.flappy.players.map((player, index) => <span key={player.playerId} className={player.playerId === socket.id ? "current-player" : ""}>{game.players[index]?.name ?? `Player ${index + 1}`} <strong>{player.score}</strong></span>)}
                </div>
                {game.flappy.winner && <div className="rematch-area"><div className="action-row centered-actions"><button className="secondary-button" onClick={startNewGame}>New game</button></div>{rematchControls()}</div>}
              </div>
            ) : <p className="lead">Both players are connected. Gameplay for this room is coming next.</p>
          )}
          {showGameId && <p className="game-id">Game ID <code>{game.id}</code></p>}
          <button className="back-button" onClick={leaveGame}>
            Leave room
          </button>
        </section>
      )}
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
    </main>
  );
}

export default App;
