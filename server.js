import "dotenv/config";
import http from "http";
import app from "./app.js";
import { connectDB } from "./src/models/db.js";
import { initializeSocket } from "./src/socket/index.js";

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

initializeSocket(server);
await connectDB();

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

process.on("unhandledRejection", (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

process.on("uncaughtException", (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});
