import express from "express";
import { validate } from "../../middlewares/validate.js";
import verifyAccess from "../../middlewares/verifyAccess.js";
import allowTo from "../../middlewares/allowTo.js";
import {
  AdminUserIdParamsSchema,
  AdminUserUpdateSchema,
  AdminWorkerModerationSchema,
  AdminUsersQuerySchema,
  AdminJobIdParamsSchema,
  AdminJobUpdateSchema,
  AdminJobsQuerySchema,
  AdminChatIdParamsSchema,
  AdminChatQuerySchema,
  AdminReportIdParamsSchema,
  AdminReportUpdateStatusSchema,
  AdminReportReviewSchema,
  AdminReportsQuerySchema,
  AdminUserLogsQuerySchema,
} from "./admin.validation.js";
import {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  banUser,
  unbanUser,
  verifyUser,
  unverifyUser,
  suspendWorker,
  blockWorker,
  restoreWorker,
  getUserLogs,
  getAllJobs,
  getJobById,
  updateJob,
  deleteJob,
  getAllChats,
  getChatById,
  getAllReports,
  getReportById,
  updateReportStatus,
  reviewReport,
  deleteReport,
} from "./admin.controller.js";

const adminRoutes = express.Router();

// Protect all admin routes
adminRoutes.use(verifyAccess, allowTo("admin"));

// ─── Users ───

adminRoutes.get("/users", validate(AdminUsersQuerySchema, "query"), getAllUsers);

adminRoutes.get("/users/:id", validate(AdminUserIdParamsSchema, "params"), getUserById);

adminRoutes.put(
  "/users/:id",
  validate(AdminUserIdParamsSchema, "params"),
  validate(AdminUserUpdateSchema),
  updateUser
);

adminRoutes.delete("/users/:id", validate(AdminUserIdParamsSchema, "params"), deleteUser);

adminRoutes.patch("/users/:id/ban", validate(AdminUserIdParamsSchema, "params"), banUser);

adminRoutes.patch("/users/:id/unban", validate(AdminUserIdParamsSchema, "params"), unbanUser);

adminRoutes.patch("/users/:id/verify", validate(AdminUserIdParamsSchema, "params"), verifyUser);

adminRoutes.patch("/users/:id/unverify", validate(AdminUserIdParamsSchema, "params"), unverifyUser);

adminRoutes.patch("/users/:id/suspend", validate(AdminUserIdParamsSchema, "params"), validate(AdminWorkerModerationSchema), suspendWorker);

adminRoutes.patch("/users/:id/block", validate(AdminUserIdParamsSchema, "params"), validate(AdminWorkerModerationSchema), blockWorker);

adminRoutes.patch("/users/:id/restore", validate(AdminUserIdParamsSchema, "params"), validate(AdminWorkerModerationSchema), restoreWorker);

adminRoutes.get("/user-logs", validate(AdminUserLogsQuerySchema, "query"), getUserLogs);

// ─── Jobs ───

adminRoutes.get("/jobs", validate(AdminJobsQuerySchema, "query"), getAllJobs);

adminRoutes.get("/jobs/:id", validate(AdminJobIdParamsSchema, "params"), getJobById);

adminRoutes.put(
  "/jobs/:id",
  validate(AdminJobIdParamsSchema, "params"),
  validate(AdminJobUpdateSchema),
  updateJob
);

adminRoutes.delete("/jobs/:id", validate(AdminJobIdParamsSchema, "params"), deleteJob);

// ─── Chat ───

adminRoutes.get("/chats", validate(AdminChatQuerySchema, "query"), getAllChats);

adminRoutes.get(
  "/chats/:id",
  validate(AdminChatIdParamsSchema, "params"),
  getChatById
);

// ─── Reports ───

adminRoutes.get("/reports", validate(AdminReportsQuerySchema, "query"), getAllReports);

adminRoutes.get(
  "/reports/:id",
  validate(AdminReportIdParamsSchema, "params"),
  getReportById
);

adminRoutes.patch(
  "/reports/:id/status",
  validate(AdminReportIdParamsSchema, "params"),
  validate(AdminReportUpdateStatusSchema),
  updateReportStatus
);

adminRoutes.patch(
  "/reports/:id/review",
  validate(AdminReportIdParamsSchema, "params"),
  validate(AdminReportReviewSchema),
  reviewReport
);

adminRoutes.delete(
  "/reports/:id",
  validate(AdminReportIdParamsSchema, "params"),
  deleteReport
);

export default adminRoutes;
