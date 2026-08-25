import { io } from "socket.io-client";

const serverUrl =
  import.meta.env.VITE_SERVER_URL ?? "https://opengames-f96k.onrender.com";

export const socket = io(serverUrl, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  withCredentials: true,
});
