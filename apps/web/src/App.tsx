import { useEffect, useMemo, useState } from "react";
import type { ChessMode, Game, GameConfig, GameType } from "@opengames/shared";
import "./App.css";
import { socket } from "./socket";

type Screen = "selection" | "configuration" | "waiting" | "started";
type GameEvent = { game: Game };
type ErrorEvent = { message: string };

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
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState(socket.connected);

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
    socket.on("game-error", onGameError);
    socket.on("opponent-not-found", onGameError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("game-created", onGameCreated);
      socket.off("player-joined", onPlayerJoined);
      socket.off("game-started", onGameStarted);
      socket.off("game-error", onGameError);
      socket.off("opponent-not-found", onGameError);
      socket.disconnect();
    };
  }, []);

  const normalizedPlayerName = () => playerName.trim() || "Player";
  const chooseGame = (gameType: GameType) => {
    setSelectedGame(gameType);
    setMessage("");
    setScreen("configuration");
  };
  const createGame = () => {
    if (!selectedGame) return;
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
    setMessage("");
    socket.emit("join-game", { gameId, playerName: normalizedPlayerName() });
  };
  const leaveGame = () => {
    if (game) socket.emit("leave-game", game.id);
    setGame(null);
    setMessage("");
    setScreen("selection");
  };

  const gameLabel = game
    ? games.find(({ type }) => type === game.gameType)?.label
    : "";
  const modeLabel =
    game?.config.mode === "string" ? game.config.mode : "Standard";

  return (
    <main className="game-lobby">
      <header className="lobby-header">
        <div>
          <p className="eyebrow">OpenGames</p>
          <h1>Play together.</h1>
        </div>
        <span className={connected ? "connection online" : "connection"}>
          {connected ? "Connected" : "Connecting..."}
        </span>
      </header>

      {screen === "selection" && (
        <section className="lobby-panel">
          <h2>Choose a game</h2>
          <p className="lead">
            Select a game before creating or finding a room.
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
                <strong>{gameOption.label}</strong>
                <span>{gameOption.description}</span>
              </button>
            ))}
          </div>
          <div className="join-by-id">
            <label htmlFor="game-id">Or join with a game ID</label>
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
        </section>
      )}

      {screen === "configuration" && selectedGame && (
        <section className="lobby-panel configuration-panel">
          <button
            className="back-button"
            onClick={() => setScreen("selection")}
          >
            ← Back
          </button>
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
              Find opponent
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
          <p className="game-id">
            Game ID <code>{game.id}</code>
          </p>
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
          <h2>Game Started</h2>
          <p className="lead">
            Both players are connected. Game play will arrive in a future phase.
          </p>
          <p className="game-id">
            Game ID <code>{game.id}</code>
          </p>
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
