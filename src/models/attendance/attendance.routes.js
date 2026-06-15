import express from "express";
import { validate } from "../../middlewares/validate.js";
import verifyAccess from "../../middlewares/verifyAccess.js";
import allowTo from "../../middlewares/allowTo.js";
import { qrScanLimiter, qrGenerateLimiter } from "../../middlewares/rateLimiter.js";
import {
  AttendanceAssignmentIdParamsSchema,
  AttendanceReportQuerySchema,
  AttendanceAnalyticsQuerySchema,
  GenerateAttendanceTokenSchema,
  ScanAttendanceTokenSchema,
} from "./attendance.validation.js";
import {
  generateCheckInToken,
  generateCheckOutToken,
  checkInAssignment,
  checkOutAssignment,
  getEmployerAttendanceReport,
  getAdminAttendanceAnalytics,
} from "./attendance.controller.js";

const attendanceRoutes = express.Router();

attendanceRoutes.post(
  "/job-assignments/:id/check-in-qr",
  verifyAccess,
  allowTo("employer"),
  qrGenerateLimiter,
  validate(AttendanceAssignmentIdParamsSchema, "params"),
  validate(GenerateAttendanceTokenSchema),
  generateCheckInToken
);

attendanceRoutes.post(
  "/job-assignments/:id/check-out-qr",
  verifyAccess,
  allowTo("employer"),
  qrGenerateLimiter,
  validate(AttendanceAssignmentIdParamsSchema, "params"),
  validate(GenerateAttendanceTokenSchema),
  generateCheckOutToken
);

attendanceRoutes.post(
  "/job-assignments/:id/check-in",
  verifyAccess,
  allowTo("worker"),
  qrScanLimiter,
  validate(AttendanceAssignmentIdParamsSchema, "params"),
  validate(ScanAttendanceTokenSchema),
  checkInAssignment
);

attendanceRoutes.post(
  "/job-assignments/:id/check-out",
  verifyAccess,
  allowTo("worker"),
  qrScanLimiter,
  validate(AttendanceAssignmentIdParamsSchema, "params"),
  validate(ScanAttendanceTokenSchema),
  checkOutAssignment
);

attendanceRoutes.get(
  "/attendance/reports/employer",
  verifyAccess,
  allowTo("employer"),
  validate(AttendanceReportQuerySchema, "query"),
  getEmployerAttendanceReport
);

attendanceRoutes.get(
  "/attendance/admin/analytics",
  verifyAccess,
  allowTo("admin"),
  validate(AttendanceAnalyticsQuerySchema, "query"),
  getAdminAttendanceAnalytics
);

export default attendanceRoutes;
