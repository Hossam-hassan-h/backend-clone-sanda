import express from "express";
import { validate } from "../../middlewares/validate.js";
import verifyAccess from "../../middlewares/verifyAccess.js";
import allowTo from "../../middlewares/allowTo.js";
import {
  CreateApplicationSchema,
  ApplicationIdParamsSchema,
  JobIdParamsSchema,
  ApplicationListingQuerySchema,
} from "./application.validation.js";
import {
  createApplication,
  getMyApplications,
  getJobApplications,
  rejectApplication,
  acceptApplication,
  cancelApplication,
} from "./application.controller.js";

const applicationRoutes = express.Router();

applicationRoutes.post(
  "/jobs/:jobId/applications",
  verifyAccess,
  allowTo("worker"),
  validate(JobIdParamsSchema, "params"),
  validate(CreateApplicationSchema),
  createApplication
);

applicationRoutes.get(
  "/applications/me",
  verifyAccess,
  allowTo("worker"),
  validate(ApplicationListingQuerySchema, "query"),
  getMyApplications
);

applicationRoutes.get(
  "/jobs/:jobId/applications",
  verifyAccess,
  allowTo("employer"),
  validate(JobIdParamsSchema, "params"),
  validate(ApplicationListingQuerySchema, "query"),
  getJobApplications
);

applicationRoutes.patch(
  "/applications/:id/accept",
  verifyAccess,
  allowTo("employer"),
  validate(ApplicationIdParamsSchema, "params"),
  acceptApplication
);

applicationRoutes.patch(
  "/applications/:id/reject",
  verifyAccess,
  allowTo("employer"),
  validate(ApplicationIdParamsSchema, "params"),
  rejectApplication
);

applicationRoutes.patch(
  "/applications/:id/cancel",
  verifyAccess,
  allowTo("worker"),
  validate(ApplicationIdParamsSchema, "params"),
  cancelApplication
);

export default applicationRoutes;
