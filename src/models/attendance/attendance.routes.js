import express from "express";
import { validate } from "../../middlewares/validate.js";
import verifyAccess from "../../middlewares/verifyAccess.js";
import allowTo from "../../middlewares/allowTo.js";
import {
  AttendanceAssignmentIdParamsSchema,
  GenerateAttendanceTokenSchema,
  ScanAttendanceTokenSchema,
} from "./attendance.validation.js";
import {
  generateCheckInToken,
  generateCheckOutToken,
  checkInAssignment,
  checkOutAssignment,
} from "./attendance.controller.js";

const attendanceRoutes = express.Router();

attendanceRoutes.post(
  "/job-assignments/:id/check-in-qr",
  verifyAccess,
  allowTo("employer"),
  validate(AttendanceAssignmentIdParamsSchema, "params"),
  validate(GenerateAttendanceTokenSchema),
  generateCheckInToken
);

attendanceRoutes.post(
  "/job-assignments/:id/check-out-qr",
  verifyAccess,
  allowTo("employer"),
  validate(AttendanceAssignmentIdParamsSchema, "params"),
  validate(GenerateAttendanceTokenSchema),
  generateCheckOutToken
);

attendanceRoutes.post(
  "/job-assignments/:id/check-in",
  verifyAccess,
  allowTo("worker"),
  validate(AttendanceAssignmentIdParamsSchema, "params"),
  validate(ScanAttendanceTokenSchema),
  checkInAssignment
);

attendanceRoutes.post(
  "/job-assignments/:id/check-out",
  verifyAccess,
  allowTo("worker"),
  validate(AttendanceAssignmentIdParamsSchema, "params"),
  validate(ScanAttendanceTokenSchema),
  checkOutAssignment
);

export default attendanceRoutes;
