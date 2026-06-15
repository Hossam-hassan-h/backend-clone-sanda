import express from 'express';
import cors from 'cors';
import userRoutes from './src/models/users/user.routes.js';
import authRoutes from './src/models/auth/auth.routes.js';
import jobRoutes from './src/models/jobs/job.routes.js';
import ratingRoutes from './src/models/ratings/rating.routes.js';
import applicationRoutes from './src/models/applications/application.routes.js';
import jobAssignmentRoutes from './src/models/jobAssignments/jobAssignment.routes.js';
import attendanceRoutes from './src/models/attendance/attendance.routes.js';
import notificationRoutes from './src/models/notifications/notification.routes.js';
import reportRoutes from './src/models/reports/report.routes.js';
import conversationRoutes from './src/models/conversations/conversation.routes.js';
import adminRoutes from './src/models/admin/admin.routes.js';
import paymentRoutes from './src/models/payments/payment.routes.js';
import { stripeWebhook } from './src/models/payments/payment.controller.js';
import walletRoutes from './src/models/wallets/wallet.routes.js';
import statusText from "./src/utils/statusText.js";
import noSqlSanitizer from './src/middlewares/sanitize.js';
import { AppError } from './src/middlewares/appError.js';

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://sanda-ten.vercel.app",
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",") : []),
].map((origin) => origin.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new AppError("Not allowed by CORS", 403, statusText.FAIL));
  },
  credentials: true,
}));
app.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(noSqlSanitizer);

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use("/api", ratingRoutes);
app.use("/api", applicationRoutes);
app.use("/api", jobAssignmentRoutes);
app.use("/api", attendanceRoutes);
app.use("/api", conversationRoutes);
app.use("/api", reportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/wallet", walletRoutes);

app.use((req, res, next) => {
 next(new AppError(`Can't find ${req.originalUrl}`, 404, statusText.FAIL));
});

app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    status: err.statusText || statusText.ERROR,
    message: err.message || "Internal Server Error"
  });
});

export default app;
