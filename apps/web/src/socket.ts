import { io } from "socket.io-client";

const serverUrl =
  import.meta.env.VITE_SERVER_URL ?? "https://opengames-f96k.onrender.com";

export const socket = io(serverUrl, {
  autoConnect: false,
  transports: ["polling", "websocket"],
  withCredentials: true,
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: 10,
});
