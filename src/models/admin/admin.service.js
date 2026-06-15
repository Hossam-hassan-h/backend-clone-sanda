import User from "../users/users.model.js";
import Job from "../jobs/job.model.js";
import Conversation from "../conversations/conversation.model.js";
import Message from "../messages/message.model.js";
import Report from "../reports/report.model.js";
import Transaction from "../transactions/transaction.model.js";
import UserLog from "../userLogs/userLog.model.js";
import { hashPassword } from "../../utils/bcrypt.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";

const MAX_PAGE_SIZE = 100;
const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const buildRegex = (value) => ({ $regex: escapeRegex(value), $options: "i" });
const buildPagination = ({ page = 1, pageSize = 20 } = {}) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), MAX_PAGE_SIZE);

  return {
    page: safePage,
    pageSize: safePageSize,
    skip: (safePage - 1) * safePageSize,
  };
};

const createPaginationMeta = ({ page, pageSize }, total) => ({
  page,
  pageSize,
  total,
  totalItems: total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

// ─── Users ───

export const getAllUsers = async (filter = {}, pagination = {}) => {
  const { page, pageSize, skip } = buildPagination(pagination);

  const [users, total] = await Promise.all([
    User.find(filter, { password: 0, __v: 0 }).skip(skip).limit(pageSize).sort({ createdAt: -1 }),
    User.countDocuments(filter),
  ]);

  return {
    data: users,
    pagination: createPaginationMeta({ page, pageSize }, total),
  };
};

export const getUserById = async (userId) => {
  const user = await User.findById(userId).select("-password -__v");
  if (!user) throw new AppError("User not found", 404, statusText.FAIL);
  return user;
};

export const createUser = async (userData) => {
  userData.password = await hashPassword(userData.password);
  const user = await User.create(userData);
  const userObj = user.toObject();
  delete userObj.password;
  return userObj;
};

export const updateUser = async (userId, updateData) => {
  if (updateData.password) {
    updateData.password = await hashPassword(updateData.password);
  }
  const user = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password -__v");

  if (!user) throw new AppError("User not found", 404, statusText.FAIL);
  return user;
};

export const deleteUser = async (userId) => {
  const user = await User.findByIdAndDelete(userId);
  if (!user) throw new AppError("User not found", 404, statusText.FAIL);
  return { message: "User deleted successfully" };
};

export const banUser = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { isBlocked: true },
    { new: true }
  ).select("-password -__v");

  if (!user) throw new AppError("User not found", 404, statusText.FAIL);
  return user;
};

export const unbanUser = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { isBlocked: false },
    { new: true }
  ).select("-password -__v");

  if (!user) throw new AppError("User not found", 404, statusText.FAIL);
  return user;
};

export const verifyUser = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { is_verified: true, verification_status: "approved" },
    { new: true }
  ).select("-password -__v");

  if (!user) throw new AppError("User not found", 404, statusText.FAIL);
  return user;
};

export const unverifyUser = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { is_verified: false, verification_status: "rejected" },
    { new: true }
  ).select("-password -__v");

  if (!user) throw new AppError("User not found", 404, statusText.FAIL);
  return user;
};

const logAdminAction = async ({ adminId, action, targetType, targetId }) => {
  if (!adminId || !targetId) return;
  try {
    await UserLog.create({
      user: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
    });
  } catch (error) {
    console.warn(`Failed to write admin user log: ${error.message}`);
  }
};

export const suspendWorker = async (userId, { reason, suspension_until } = {}, adminId = null) => {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      worker_state: "SUSPENDED",
      suspension_until: suspension_until ?? null,
      admin_notes: reason ?? "",
      isBlocked: false,
    },
    { new: true, runValidators: true }
  ).select("-password -__v");

  if (!user) throw new AppError("User not found", 404, statusText.FAIL);
  await logAdminAction({ adminId, action: "suspend_worker", targetType: "user", targetId: userId });
  return user;
};

export const blockWorker = async (userId, { reason } = {}, adminId = null) => {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      worker_state: "BLOCKED",
      suspension_until: null,
      admin_notes: reason ?? "",
      isBlocked: true,
    },
    { new: true, runValidators: true }
  ).select("-password -__v");

  if (!user) throw new AppError("User not found", 404, statusText.FAIL);
  await logAdminAction({ adminId, action: "block_worker", targetType: "user", targetId: userId });
  return user;
};

export const restoreWorker = async (userId, { reason } = {}, adminId = null) => {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      worker_state: "AVAILABLE",
      suspension_until: null,
      admin_notes: reason ?? "",
      isBlocked: false,
    },
    { new: true, runValidators: true }
  ).select("-password -__v");

  if (!user) throw new AppError("User not found", 404, statusText.FAIL);
  await logAdminAction({ adminId, action: "restore_worker", targetType: "user", targetId: userId });
  return user;
};

export const getUserLogs = async (query = {}) => {
  const filter = {};
  if (query.userId) filter.user = query.userId;
  if (query.targetType) filter.target_type = query.targetType;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  const logs = await UserLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(500)
    .select("-__v")
    .lean();

  return logs.map((log) => ({
    id: log._id.toString(),
    userId: log.user?.toString(),
    action: log.action,
    targetType: log.target_type,
    targetId: log.target_id?.toString(),
    createdAt: log.createdAt,
  }));
};

// ─── Jobs ───

export const getAllJobs = async (filter = {}, pagination = {}) => {
  const { page, pageSize, skip } = buildPagination(pagination);

  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .skip(skip)
      .limit(pageSize)
      .sort({ createdAt: -1 })
      .populate("owner", "name profile_image")
      .populate("applicants_count"),
    Job.countDocuments(filter),
  ]);

  return {
    data: jobs,
    pagination: createPaginationMeta({ page, pageSize }, total),
  };
};

export const getJobById = async (jobId) => {
  const job = await Job.findById(jobId)
    .populate("owner", "name profile_image")
    .populate("applicants_count");

  if (!job) throw new AppError("Job not found", 404, statusText.FAIL);
  return job;
};

export const updateJob = async (jobId, updateData) => {
  const job = await Job.findByIdAndUpdate(jobId, updateData, {
    new: true,
    runValidators: true,
  })
    .populate("owner", "name profile_image")
    .populate("applicants_count");

  if (!job) throw new AppError("Job not found", 404, statusText.FAIL);
  return job;
};

export const deleteJob = async (jobId) => {
  const job = await Job.findById(jobId);
  if (!job) throw new AppError("Job not found", 404, statusText.FAIL);

  // Prevent deletion if the job has associated payments (hold/release transactions)
  const paymentExists = await Transaction.exists({
    job: jobId,
    type: { $in: ["hold", "release"] },
  });
  if (paymentExists) {
    throw new AppError(
      "Cannot delete this job because it has associated payments. Refund or release all holdings first.",
      400,
      statusText.FAIL
    );
  }

  await Job.findByIdAndDelete(jobId);
  return { message: "Job deleted successfully" };
};

// ─── Chat ───

export const getAllChats = async (filter = {}, pagination = {}) => {
  const { page, pageSize, skip } = buildPagination(pagination);

  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      .skip(skip)
      .limit(pageSize)
      .populate("job", "title category location status")
      .populate("employer", "name profile_image")
      .populate("worker", "name profile_image")
      .populate("assignment", "status")
      .sort({ last_message_at: -1, updatedAt: -1 })
      .lean(),
    Conversation.countDocuments(filter),
  ]);

  return {
    data: conversations,
    pagination: createPaginationMeta({ page, pageSize }, total),
  };
};

export const getChatById = async (conversationId) => {
  const conversation = await Conversation.findById(conversationId)
    .populate("job", "title category location status")
    .populate("employer", "name profile_image")
    .populate("worker", "name profile_image")
    .populate("assignment", "status")
    .lean();

  if (!conversation) {
    throw new AppError("Conversation not found", 404, statusText.FAIL);
  }

  const messages = await Message.find({ conversation: conversationId })
    .populate("sender", "name")
    .sort({ createdAt: 1 })
    .lean();

  return { conversation, messages };
};

// ─── Reports ───

export const getAllReports = async (query = {}, pagination = {}) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.search) filter.reason = buildRegex(query.search);

  const { page, pageSize, skip } = buildPagination(pagination);

  const [reports, total] = await Promise.all([
    Report.find(filter)
      .skip(skip)
      .limit(pageSize)
      .populate("reported_user", "name profile_image email role")
      .populate("reported_by", "name profile_image email role")
      .populate("job", "title status category location salary")
      .sort({ createdAt: -1 })
      .select("-__v")
      .lean(),
    Report.countDocuments(filter),
  ]);

  return {
    data: reports,
    pagination: createPaginationMeta({ page, pageSize }, total),
  };
};

export const getReportById = async (reportId) => {
  const report = await Report.findById(reportId)
    .populate("reported_user", "name profile_image role email phone")
    .populate("reported_by", "name profile_image role email phone")
    .populate("job", "title status category location salary")
    .select("-__v")
    .lean();

  if (!report) {
    throw new AppError("Report not found", 404, statusText.FAIL);
  }

  return report;
};

export const updateReportStatus = async (reportId, status) => {
  const report = await Report.findByIdAndUpdate(
    reportId,
    { status },
    { new: true, runValidators: true }
  )
    .populate("reported_user", "name profile_image role")
    .populate("reported_by", "name profile_image role")
    .populate("job", "title status")
    .select("-__v")
    .lean();

  if (!report) {
    throw new AppError("Report not found", 404, statusText.FAIL);
  }

  return report;
};

export const deleteReport = async (reportId) => {
  const report = await Report.findByIdAndDelete(reportId);
  if (!report) {
    throw new AppError("Report not found", 404, statusText.FAIL);
  }
  return { message: "Report deleted successfully" };
};

export const reviewReport = async (reportId, { decision, admin_notes } = {}, adminId = null) => {
  const status = decision === "approved" ? "reviewed" : "closed";
  const report = await Report.findByIdAndUpdate(
    reportId,
    {
      status,
      review_decision: decision,
      admin_notes: admin_notes ?? "",
      reviewed_by: adminId,
      reviewed_at: new Date(),
    },
    { new: true, runValidators: true }
  )
    .populate("reported_user", "name profile_image role")
    .populate("reported_by", "name profile_image role")
    .populate("job", "title status")
    .select("-__v")
    .lean();

  if (!report) {
    throw new AppError("Report not found", 404, statusText.FAIL);
  }

  await logAdminAction({ adminId, action: `review_report_${decision}`, targetType: "report", targetId: reportId });
  return report;
};
