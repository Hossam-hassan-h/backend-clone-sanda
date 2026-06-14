import * as reportService from "./report.service.js";
import catchError from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";

export const createReport = catchError(async (req, res) => {
  const report = await reportService.createReport(req.user.id, req.body);
  res.status(201).json({ status: statusText.SUCCESS, data: report });
});

export const getMyReports = catchError(async (req, res) => {
  const reports = await reportService.getUserReports(req.user.id);
  res.json({ status: statusText.SUCCESS, data: reports });
});

export const getReport = catchError(async (req, res) => {
  const report = await reportService.getReportById(req.params.id, req.user.id);
  res.json({ status: statusText.SUCCESS, data: report });
});
