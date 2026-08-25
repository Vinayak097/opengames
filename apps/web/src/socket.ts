import { io } from "socket.io-client";

const serverUrl =
  import.meta.env.VITE_SERVER_URL ?? "https://opengames-f96k.onrender.com";

export const socket = io(serverUrl, {
  autoConnect: false,
  transports: ["polling", "websocket"],
  // This app uses Socket.IO's connection ID, not cookie-based authentication.
  // Avoid credentialed cross-origin polling requests so the browser does not
  // require `Access-Control-Allow-Credentials` from the server.
  withCredentials: false,
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: 10,
});
