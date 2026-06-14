import { Server } from "socket.io";
import { authenticateSocket } from "./auth.js";
import { setSocketServer } from "./emitters.js";

export const initializeSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:8080", "http://127.0.0.1:8080"],
      credentials: true,
    },
  });

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    socket.join(`user:${socket.user.userId}`);
  });

  setSocketServer(io);

  return io;
};
