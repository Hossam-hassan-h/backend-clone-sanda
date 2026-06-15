import * as adminService from "./admin.service.js";
import catchError from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const buildRegex = (value) => ({ $regex: escapeRegex(value), $options: "i" });
const normalizeJobStatus = (status) => status?.replace(/-/g, "_");

// ─── Users ───

export const getAllUsers = catchError(async (req, res) => {
  const { page, pageSize, search, role, status: userStatus } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (userStatus === "active") filter.isBlocked = { $ne: true };
  if (userStatus === "banned") filter.isBlocked = true;
  if (userStatus === "verified") filter.is_verified = true;
  if (userStatus === "unverified") filter.is_verified = { $ne: true };
  if (userStatus === "pending_verification") filter.verification_status = "pending";
  if (search) {
    const searchRegex = buildRegex(search);
    filter.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
      { city: searchRegex },
    ];
  }
  const users = await adminService.getAllUsers(filter, { page: Number(page) || 1, pageSize: Number(pageSize) || 20 });

  res.json({
    status: statusText.SUCCESS,
    data: users.data,
    pagination: users.pagination,
  });
});

export const getUserById = catchError(async (req, res) => {
  const user = await adminService.getUserById(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const updateUser = catchError(async (req, res) => {
  const user = await adminService.updateUser(req.params.id, req.body);

  res.json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const deleteUser = catchError(async (req, res) => {
  const result = await adminService.deleteUser(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});

export const banUser = catchError(async (req, res) => {
  const user = await adminService.banUser(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const unbanUser = catchError(async (req, res) => {
  const user = await adminService.unbanUser(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const verifyUser = catchError(async (req, res) => {
  const user = await adminService.verifyUser(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const unverifyUser = catchError(async (req, res) => {
  const user = await adminService.unverifyUser(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const suspendWorker = catchError(async (req, res) => {
  const user = await adminService.suspendWorker(req.params.id, req.body, req.user.userId);

  res.json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const blockWorker = catchError(async (req, res) => {
  const user = await adminService.blockWorker(req.params.id, req.body, req.user.userId);

  res.json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const restoreWorker = catchError(async (req, res) => {
  const user = await adminService.restoreWorker(req.params.id, req.body, req.user.userId);

  res.json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const getUserLogs = catchError(async (req, res) => {
  const logs = await adminService.getUserLogs(req.query);

  res.json({
    status: statusText.SUCCESS,
    data: logs,
  });
});

// ─── Jobs ───

export const getAllJobs = catchError(async (req, res) => {
  const { page, pageSize, status, category, search } = req.query;
  const filter = {};
  if (status) filter.status = normalizeJobStatus(status);
  if (category) filter.category = category;
  if (search) {
    const searchRegex = buildRegex(search);
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { category: searchRegex },
      { location: searchRegex },
    ];
  }
  const jobs = await adminService.getAllJobs(filter, { page: Number(page) || 1, pageSize: Number(pageSize) || 20 });

  res.json({
    status: statusText.SUCCESS,
    data: jobs.data,
    pagination: jobs.pagination,
  });
});

export const getJobById = catchError(async (req, res) => {
  const job = await adminService.getJobById(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: job,
  });
});

export const updateJob = catchError(async (req, res) => {
  const job = await adminService.updateJob(req.params.id, req.body);

  res.json({
    status: statusText.SUCCESS,
    data: job,
  });
});

export const deleteJob = catchError(async (req, res) => {
  const result = await adminService.deleteJob(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});

// ─── Chat ───

export const getAllChats = catchError(async (req, res) => {
  const { page, pageSize, status, search } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    const searchRegex = buildRegex(search);
    filter.$or = [
      { "employer.name": searchRegex },
      { "worker.name": searchRegex },
    ];
  }
  const chats = await adminService.getAllChats(filter, { page: Number(page) || 1, pageSize: Number(pageSize) || 20 });

  res.json({
    status: statusText.SUCCESS,
    data: chats.data,
    pagination: chats.pagination,
  });
});

export const getChatById = catchError(async (req, res) => {
  const chat = await adminService.getChatById(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: chat,
  });
});

// ─── Reports ───

export const getAllReports = catchError(async (req, res) => {
  const { page, pageSize, ...query } = req.query;
  const reports = await adminService.getAllReports(query, { page: Number(page) || 1, pageSize: Number(pageSize) || 20 });

  res.json({
    status: statusText.SUCCESS,
    data: reports.data,
    pagination: reports.pagination,
  });
});

export const getReportById = catchError(async (req, res) => {
  const report = await adminService.getReportById(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: report,
  });
});

export const updateReportStatus = catchError(async (req, res) => {
  const report = await adminService.updateReportStatus(req.params.id, req.body.status);

  res.json({
    status: statusText.SUCCESS,
    data: report,
  });
});

export const reviewReport = catchError(async (req, res) => {
  const report = await adminService.reviewReport(req.params.id, req.body, req.user.userId);

  res.json({
    status: statusText.SUCCESS,
    data: report,
  });
});

export const deleteReport = catchError(async (req, res) => {
  const result = await adminService.deleteReport(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});
