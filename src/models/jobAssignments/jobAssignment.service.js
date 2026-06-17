import mongoose from "mongoose";
import JobAssignment from "./jobAssignment.model.js";
import Job from "../jobs/job.model.js";
import Application from "../applications/application.model.js";
import { releaseToWorker } from "../payments/escrow.service.js";
import {
  createNotification,
  createNotificationPersistenceError,
  isUnexpectedDuplicateKeyError,
} from "../notifications/notification.service.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";

/* =========================
   SAFE POPULATE FIELDS
========================= */

const SAFE_WORKER_FIELDS = "name role profile_image bio";
const SAFE_EMPLOYER_FIELDS = "name role profile_image bio";
const SAFE_JOB_FIELDS = "title category location status";

/* =========================
   PAGINATION
========================= */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const buildPagination = (query = {}) => {
  const page = Math.max(Number(query.page) || DEFAULT_PAGE, 1);
  const limit = Math.min(
    Math.max(Number(query.limit) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

/* =========================
   REFUND WINDOW (FROM SCHEMA)
========================= */

export const addDynamicRefundState = (assignment) => {
  if (!assignment) return assignment;

  const obj =
    typeof assignment.toObject === "function"
      ? assignment.toObject()
      : assignment;

  const attendance = obj.attendance || {};

  if (
    attendance.checked_in_at &&
    !attendance.checked_out_at &&
    obj.status === "in_progress" &&
    obj.marketplace_status === "FUNDS_HELD"
  ) {
    const checkInTime = new Date(attendance.checked_in_at).getTime();
    const windowMs = 30 * 60 * 1000;

    if (Date.now() - checkInTime <= windowMs) {
      obj.marketplace_status = "REFUND_WINDOW_ACTIVE";
      obj.refund_deadline = new Date(checkInTime + windowMs);
    }
  }

  return obj;
};

/* =========================
   GET ASSIGNMENTS (WORKER)
========================= */

export const getMyAssignments = async (workerId, query = {}) => {
  const pagination = buildPagination(query);

  const filter = { worker: workerId };
  if (query.status) filter.status = query.status;

  const [assignments, total] = await Promise.all([
    JobAssignment.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("job", SAFE_JOB_FIELDS)
      .populate("employer", SAFE_EMPLOYER_FIELDS)
      .populate("worker", SAFE_WORKER_FIELDS)
      .lean(),

    JobAssignment.countDocuments(filter),
  ]);

  return {
    assignments: assignments.map(addDynamicRefundState),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
};

/* =========================
   CHECK IN (START)
========================= */

export const startAssignment = async (assignmentId, workerId) => {
  const assignment = await JobAssignment.findById(assignmentId).populate(
    "job",
    "_id status"
  );

  if (!assignment) throw new AppError("Assignment not found", 404);

  if (assignment.worker.toString() !== workerId) {
    throw new AppError("Not allowed", 403);
  }

  if (assignment.status !== "assigned") {
    throw new AppError("Already started", 400);
  }

  const updated = await JobAssignment.findOneAndUpdate(
    {
      _id: assignmentId,
      worker: workerId,
      status: "assigned",
    },
    {
      status: "in_progress",
      "attendance.checked_in_at": new Date(),
    },
    { new: true }
  )
    .populate("job", SAFE_JOB_FIELDS)
    .populate("worker", SAFE_WORKER_FIELDS)
    .lean();

  return addDynamicRefundState(updated);
};

/* =========================
   CHECK OUT (COMPLETE)
========================= */

export const completeAssignment = async (assignmentId, employerId) => {
  const assignment = await JobAssignment.findById(assignmentId).populate(
    "job",
    "_id owner status"
  );

  if (!assignment) throw new AppError("Assignment not found", 404);

  if (assignment.employer.toString() !== employerId) {
    throw new AppError("Not allowed", 403);
  }

  if (assignment.status !== "in_progress") {
    throw new AppError("Not in progress", 400);
  }

  if (assignment.payment) {
    return await releaseToWorker(assignmentId, employerId);
  }

  const updated = await JobAssignment.findOneAndUpdate(
    {
      _id: assignmentId,
      employer: employerId,
      status: "in_progress",
    },
    {
      status: "completed",
      "attendance.checked_out_at": new Date(),
    },
    { new: true }
  )
    .populate("job", SAFE_JOB_FIELDS)
    .populate("worker", SAFE_WORKER_FIELDS)
    .lean();

  return addDynamicRefundState(updated);
};

/* =========================
   NO SHOW (IMPORTANT FIX)
========================= */

export const markNoShow = async (assignmentId, employerId) => {
  const assignment = await JobAssignment.findById(assignmentId).populate(
    "job",
    "_id owner status"
  );

  if (!assignment) throw new AppError("Assignment not found", 404);

  if (assignment.employer.toString() !== employerId) {
    throw new AppError("Not allowed", 403);
  }

  if (assignment.status !== "assigned") {
    throw new AppError("Only assigned can be marked no-show", 400);
  }

  const updated = await JobAssignment.findOneAndUpdate(
    {
      _id: assignmentId,
      employer: employerId,
      status: "assigned",
    },
    {
      status: "cancelled",
      "attendance.no_show": true,
    },
    { new: true }
  )
    .populate("job", SAFE_JOB_FIELDS)
    .populate("worker", SAFE_WORKER_FIELDS)
    .lean();

  return addDynamicRefundState(updated);
};

/* =========================
   GET JOB ASSIGNMENTS (EMPLOYER)
========================= */

export const getJobAssignments = async (jobId, employerId, query = {}) => {
  const job = await Job.findById(jobId);

  if (!job) throw new AppError("Job not found", 404);

  if (job.owner.toString() !== employerId) {
    throw new AppError("Not allowed", 403);
  }

  const pagination = buildPagination(query);

  const filter = { job: jobId };
  if (query.status) filter.status = query.status;

  const [assignments, total] = await Promise.all([
    JobAssignment.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("worker", SAFE_WORKER_FIELDS)
      .populate("employer", SAFE_EMPLOYER_FIELDS)
      .lean(),

    JobAssignment.countDocuments(filter),
  ]);

  return {
    assignments: assignments.map(addDynamicRefundState),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
};

/* =========================
   GET BY ID (SECURE)
========================= */

export const getAssignmentById = async (assignmentId, userId) => {
  const assignment = await JobAssignment.findById(assignmentId)
    .populate("job", SAFE_JOB_FIELDS)
    .populate("worker", SAFE_WORKER_FIELDS)
    .populate("employer", SAFE_EMPLOYER_FIELDS)
    .lean();

  if (!assignment) throw new AppError("Not found", 404);

  const isWorker = assignment.worker._id.toString() === userId;
  const isEmployer = assignment.employer._id.toString() === userId;

  if (!isWorker && !isEmployer) {
    throw new AppError("Forbidden", 403);
  }

  return addDynamicRefundState(assignment);
};  capacityRelease.status === "in_progress";

        if (shouldReopen) {
          await Job.findOneAndUpdate(
            { _id: capacityRelease._id, status: "in_progress" },
            { status: "open" },
            { session }
          );

          const eligibleWorkerIds = (
            await Application.find({
              job: capacityRelease._id,
              status: { $in: ["pending", "rejected"] },
            })
              .distinct("worker")
              .session(session)
          ).filter(
            (workerId) => workerId.toString() !== assignment.worker.toString()
          );

          for (const workerId of eligibleWorkerIds) {
            await createNotification({
              recipient: workerId,
              actor: employerId,
              type: "job_reopened",
              title: "وظيفة متاحة من جديد",
              message: `تم فتح فرصة عمل جديدة في وظيفة "${capacityRelease.title}" بعد تسجيل غياب أحد العمال`,
              entityType: "job_assignment",
              entityId: assignment._id,
              job: capacityRelease._id,
              deduplicationKey: `job_reopened:${assignment._id}:${workerId}`,
              session,
            });
          }
        }
      }
    });
  } catch (error) {
    if (isUnexpectedDuplicateKeyError(error)) {
      throw createNotificationPersistenceError();
    }

    throw error;
  } finally {
    session.endSession();
  }

  const resAssignment = await JobAssignment.findById(updated._id)
    .populate("job", SAFE_JOB_FIELDS)
    .populate("worker", SAFE_WORKER_FIELDS)
    .populate("employer", SAFE_EMPLOYER_FIELDS)
    .select("-__v")
    .lean();
  return addDynamicRefundState(resAssignment);
};

export const getJobAssignments = async (jobId, employerId, query = {}) => {
  const job = await Job.findById(jobId).select("_id owner");

  assertJobExists(job);
  assertJobOwner(job, employerId);

  const pagination = buildPagination(query);
  const filter = applyStatusFilter({ job: jobId }, query);

  const [assignments, total] = await Promise.all([
    JobAssignment.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("worker", SAFE_WORKER_FIELDS)
      .select("-__v")
      .lean(),
    JobAssignment.countDocuments(filter),
  ]);

  return {
    assignments: assignments.map(addDynamicRefundState),
    pagination: createPaginationMeta(pagination, total),
  };
};
