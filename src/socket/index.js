import { Server } from "socket.io";
import { authenticateSocket } from "./auth.js";
import { setSocketServer } from "./emitters.js";

export const initializeSocket = (httpServer) => {
  const allowedOrigins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://sanda-ten.vercel.app",
    ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",") : []),
  ].map((origin) => origin.trim()).filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    transports: ["websocket", "polling"],
    allowEIO3: false,
  });

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    socket.join(`user:${socket.user.userId}`);
  });

  setSocketServer(io);

  return io;
};
