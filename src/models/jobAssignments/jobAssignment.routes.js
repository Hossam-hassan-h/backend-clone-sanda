import express from "express";
import { validate } from "../../middlewares/validate.js";
import verifyAccess from "../../middlewares/verifyAccess.js";
import allowTo from "../../middlewares/allowTo.js";
import {
  JobIdParamsSchema,
  JobAssignmentIdParamsSchema,
  JobAssignmentListingQuerySchema,
} from "./jobAssignment.validation.js";
import {
  getMyAssignments,
  getJobAssignments,
  getAssignmentById,
  startAssignment,
  completeAssignment,
  markNoShow,
} from "./jobAssignment.controller.js";

const jobAssignmentRoutes = express.Router();

jobAssignmentRoutes.get(
  "/job-assignments/me",
  verifyAccess,
  allowTo("worker"),
  validate(JobAssignmentListingQuerySchema, "query"),
  getMyAssignments
);

jobAssignmentRoutes.get(
  "/jobs/:jobId/assignments",
  verifyAccess,
  allowTo("employer"),
  validate(JobIdParamsSchema, "params"),
  validate(JobAssignmentListingQuerySchema, "query"),
  getJobAssignments
);

jobAssignmentRoutes.patch(
  "/job-assignments/:id/start",
  verifyAccess,
  allowTo("worker"),
  validate(JobAssignmentIdParamsSchema, "params"),
  startAssignment
);

jobAssignmentRoutes.get(
  "/job-assignments/:id",
  verifyAccess,
  validate(JobAssignmentIdParamsSchema, "params"),
  getAssignmentById
);

jobAssignmentRoutes.patch(
  "/job-assignments/:id/no-show",
  verifyAccess,
  allowTo("employer"),
  validate(JobAssignmentIdParamsSchema, "params"),
  markNoShow
);

jobAssignmentRoutes.patch(
  "/job-assignments/:id/complete",
  verifyAccess,
  allowTo("employer"),
  validate(JobAssignmentIdParamsSchema, "params"),
  completeAssignment
);

export default jobAssignmentRoutes;
