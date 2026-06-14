import express from "express";
import { validate } from "../../middlewares/validate.js";
import verifyAccess from "../../middlewares/verifyAccess.js";
import allowTo from "../../middlewares/allowTo.js";
import {
  CreateJobSchema,
  UpdateJobSchema,
  JobIdParamsSchema,
  JobListingQuerySchema,
} from "./job.validation.js";
import {
  getJobs,
  getMyJobs,
  getJobById,
  createJob,
  updateJob,
  cancelJob,
} from "./job.controller.js";

const jobRoutes = express.Router();

jobRoutes.get(
  "/my-jobs",
  verifyAccess,
  allowTo("employer"),
  validate(JobListingQuerySchema, "query"),
  getMyJobs
);

jobRoutes.get("/", validate(JobListingQuerySchema, "query"), getJobs);

jobRoutes.get("/:id", validate(JobIdParamsSchema, "params"), getJobById);

jobRoutes.post(
  "/",
  verifyAccess,
  allowTo("employer"),
  validate(CreateJobSchema),
  createJob
);

jobRoutes.put(
  "/:id",
  verifyAccess,
  allowTo("employer"),
  validate(JobIdParamsSchema, "params"),
  validate(UpdateJobSchema),
  updateJob
);

jobRoutes.delete(
  "/:id",
  verifyAccess,
  allowTo("employer"),
  validate(JobIdParamsSchema, "params"),
  cancelJob
);

export default jobRoutes;
