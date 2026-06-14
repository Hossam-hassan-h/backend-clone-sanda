import { verifyAccessToken } from "../utils/jwt.js";

export const authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token || typeof token !== "string") {
    return next(new Error("Unauthorized"));
  }

  try {
    const decoded = verifyAccessToken(token);
    socket.user = {
      userId: decoded.userId,
      role: decoded.role,
    };
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
};
