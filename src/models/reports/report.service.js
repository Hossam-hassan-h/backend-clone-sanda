import mongoose from "mongoose";
import Report from "./report.model.js";
import User from "../users/users.model.js";
import Job from "../jobs/job.model.js";
import { createNotification } from "../notifications/notification.service.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";

export const createReport = async (userId, reportData) => {
  const { reported_user, reason, job } = reportData;

  const reportedUser = await User.findById(reported_user).select("_id role");
  if (!reportedUser) {
    throw new AppError("Reported user not found", 404, statusText.FAIL);
  }

  if (reported_user === userId) {
    throw new AppError("You cannot report yourself", 400, statusText.FAIL);
  }

  if (job) {
    const jobExists = await Job.findById(job).select("_id");
    if (!jobExists) {
      throw new AppError("Job not found", 404, statusText.FAIL);
    }
  }

  const report = await Report.create({
    reported_user,
    reported_by: userId,
    reason,
    job: job ?? null,
  });

  const admins = await User.find({ role: "admin", is_active: true }).select("_id");
  for (const admin of admins) {
    await createNotification({
      recipient: admin._id,
      actor: userId,
      type: "report_created",
      title: "بلاغ جديد",
      message: `تم تقديم بلاغ جديد: ${reason.substring(0, 100)}`,
      entityType: "report",
      entityId: report._id,
      job: job ?? null,
      deduplicationKey: `report_created:${report._id}:${admin._id}`,
    });
  }

  return await Report.findById(report._id)
    .populate("reported_user", "name profile_image role")
    .populate("reported_by", "name profile_image role")
    .populate("job", "title status")
    .select("-__v")
    .lean();
};

export const getUserReports = async (userId) => {
  return await Report.find({ reported_by: userId })
    .populate("reported_user", "name profile_image role")
    .populate("job", "title status")
    .sort({ createdAt: -1 })
    .select("-__v")
    .lean();
};

export const getReportById = async (reportId, userId) => {
  const report = await Report.findById(reportId)
    .populate("reported_user", "name profile_image role email phone")
    .populate("reported_by", "name profile_image role email phone")
    .populate("job", "title status category location")
    .select("-__v")
    .lean();

  if (!report) {
    throw new AppError("Report not found", 404, statusText.FAIL);
  }

  const user = await User.findById(userId).select("role").lean();
  if (report.reported_by._id.toString() !== userId && user?.role !== "admin") {
    throw new AppError("Not authorized to view this report", 403, statusText.FAIL);
  }

  return report;
};
