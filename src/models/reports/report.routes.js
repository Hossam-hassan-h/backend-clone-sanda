import express from "express";
import { validate } from "../../middlewares/validate.js";
import verifyAccess from "../../middlewares/verifyAccess.js";
import allowTo from "../../middlewares/allowTo.js";
import { createReport, getMyReports, getReport } from "./report.controller.js";
import { CreateReportSchema, ReportIdParamsSchema } from "./report.validation.js";

const reportRoutes = express.Router();

reportRoutes.post(
  "/reports",
  verifyAccess,
  allowTo("worker", "employer"),
  validate(CreateReportSchema),
  createReport
);

reportRoutes.get(
  "/reports/mine",
  verifyAccess,
  allowTo("worker", "employer"),
  getMyReports
);

reportRoutes.get(
  "/reports/:id",
  verifyAccess,
  validate(ReportIdParamsSchema, "params"),
  getReport
);

export default reportRoutes;
