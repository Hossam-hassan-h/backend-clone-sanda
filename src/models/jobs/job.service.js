import Job from "./job.model.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";

const SAFE_OWNER_FIELDS = "name role profile_image bio";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const buildRegex = (value) => ({ $regex: escapeRegex(value), $options: "i" });

const applyOptionalFilters = (filter, query = {}) => {
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.location) filter.location = query.location;
  if (query.q || query.search) {
    const searchRegex = buildRegex(query.q || query.search);
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { category: searchRegex },
      { location: searchRegex },
    ];
  }

  return filter;
};

const buildPublicJobFilter = (query = {}) => {
  if (query.status && query.status !== "open") {
    throw new AppError(
      "Public job listing only supports open jobs",
      400,
      statusText.FAIL,
    );
  }

  return applyOptionalFilters(
    { status: "open" },
    { ...query, status: undefined },
  );
};

const buildOwnerJobFilter = (ownerId, query = {}) =>
  applyOptionalFilters({ owner: ownerId }, query);

const buildPagination = (query = {}) => {
  const page = Math.max(Number(query.page) || DEFAULT_PAGE, 1);
  const limit = Math.min(
    Math.max(Number(query.limit) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const formatPaginatedJobs = async (filter, pagination) => {
  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .sort({ start_date: 1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("owner", SAFE_OWNER_FIELDS)
      .populate("applicants_count")
      .select("-__v"),
    Job.countDocuments(filter),
  ]);

  return {
    jobs,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
    },
  };
};

const assertJobExists = (job) => {
  if (!job) {
    throw new AppError("Job not found", 404, statusText.FAIL);
  }
};

const assertOwner = (job, ownerId) => {
  if (job.owner.toString() !== ownerId) {
    throw new AppError(
      "You are not allowed to manage this job",
      403,
      statusText.FAIL,
    );
  }
};

const assertEditable = (job) => {
  if (job.status === "completed") {
    throw new AppError("Completed jobs cannot be edited", 400, statusText.FAIL);
  }

  if (job.status === "cancelled") {
    throw new AppError("Cancelled jobs cannot be edited", 400, statusText.FAIL);
  }
};

const assertCancellable = (job) => {
  if (job.status === "completed") {
    throw new AppError(
      "Completed jobs cannot be cancelled",
      400,
      statusText.FAIL,
    );
  }

  if (job.status === "cancelled") {
    throw new AppError("Job is already cancelled", 400, statusText.FAIL);
  }
};

const assertValidDateRange = (job, updateData) => {
  const startDate = updateData.start_date
    ? new Date(updateData.start_date)
    : job.start_date;
  const endDate = updateData.end_date
    ? new Date(updateData.end_date)
    : job.end_date;

  if (startDate && endDate && endDate < startDate) {
    throw new AppError(
      "End date cannot be earlier than start date",
      400,
      statusText.FAIL,
    );
  }
};

export const getJobs = async (query = {}) => {
  const filter = buildPublicJobFilter(query);
  const pagination = buildPagination(query);

  return await formatPaginatedJobs(filter, pagination);
};

export const getMyJobs = async (ownerId, query = {}) => {
  const filter = buildOwnerJobFilter(ownerId, query);
  const pagination = buildPagination(query);

  return await formatPaginatedJobs(filter, pagination);
};

export const getJobById = async (jobId) => {
  const job = await Job.findById(jobId)
    .populate("owner", SAFE_OWNER_FIELDS)
    .populate("applicants_count")
    .select("-__v");

  assertJobExists(job);

  return job;
};

export const createJob = async (jobData, ownerId) => {
  const job = await Job.create({
    ...jobData,
    owner: ownerId,
  });

  return await getJobById(job._id);
};

export const updateJob = async (jobId, ownerId, updateData) => {
  const job = await Job.findById(jobId);

  assertJobExists(job);
  assertOwner(job, ownerId);
  assertEditable(job);
  assertValidDateRange(job, updateData);

  Object.assign(job, updateData);
  await job.save();

  return await getJobById(job._id);
};

export const cancelJob = async (jobId, ownerId) => {
  const job = await Job.findById(jobId);

  assertJobExists(job);
  assertOwner(job, ownerId);
  assertCancellable(job);

  job.status = "cancelled";
  await job.save();

  return await getJobById(job._id);
};
