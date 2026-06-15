import { verifyAccessToken } from "../utils/jwt.js";

export const authenticateSocket = (socket, next) => {
  const authToken = socket.handshake.auth?.token;
  const headerToken = socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");
  const token = authToken || headerToken;

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
