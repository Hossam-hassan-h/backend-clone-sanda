import mongoose from "mongoose";
import JobAssignment from "./jobAssignment.model.js";
import Job from "../jobs/job.model.js";
import { releaseToWorker } from "../payments/escrow.service.js";
import {
  createNotification,
  createNotificationPersistenceError,
  isUnexpectedDuplicateKeyError,
} from "../notifications/notification.service.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";

const SAFE_WORKER_FIELDS = "name role profile_image bio";
const SAFE_EMPLOYER_FIELDS = "name role profile_image bio";
const SAFE_JOB_FIELDS =
  "title category location status start_date end_date salary";
const ACTIVE_JOB_STATUSES = ["open", "in_progress"];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export const addDynamicRefundState = (assignment) => {
  if (!assignment) return assignment;
  const obj = typeof assignment.toObject === "function" ? assignment.toObject() : assignment;

  if (
    obj.checked_in_at &&
    !obj.checked_out_at &&
    obj.status !== "completed" &&
    obj.marketplace_status === "FUNDS_HELD"
  ) {
    const checkInTime = new Date(obj.checked_in_at).getTime();
    const thirtyMinutes = 30 * 60 * 1000;
    if (Date.now() - checkInTime <= thirtyMinutes) {
      obj.marketplace_status = "REFUND_WINDOW_ACTIVE";
      obj.refund_deadline = new Date(checkInTime + thirtyMinutes).toISOString();
    }
  }
  return obj;
};

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

const createPaginationMeta = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const applyStatusFilter = (filter, query = {}) => {
  if (query.status) filter.status = query.status;
  return filter;
};

const assertJobExists = (job) => {
  if (!job) {
    throw new AppError("Job not found", 404, statusText.FAIL);
  }
};

const assertJobOwner = (job, employerId) => {
  if (job.owner.toString() !== employerId) {
    throw new AppError(
      "You are not allowed to access assignments for this job",
      403,
      statusText.FAIL
    );
  }
};

const assertAssignmentExists = (assignment) => {
  if (!assignment) {
    throw new AppError("Assignment not found", 404, statusText.FAIL);
  }
};

const assertWorkerOwnsAssignment = (assignment, workerId) => {
  if (assignment.worker.toString() !== workerId) {
    throw new AppError(
      "You are not allowed to start this assignment",
      403,
      statusText.FAIL
    );
  }
};

const assertEmployerOwnsAssignment = (assignment, employerId) => {
  if (assignment.employer.toString() !== employerId) {
    throw new AppError(
      "You are not allowed to complete this assignment",
      403,
      statusText.FAIL
    );
  }
};

const assertStartJobStatus = (job) => {
  if (!ACTIVE_JOB_STATUSES.includes(job.status)) {
    throw new AppError(
      "Job status does not allow assignment start",
      400,
      statusText.FAIL
    );
  }
};

const assertCompletionJobStatus = (job) => {
  if (!ACTIVE_JOB_STATUSES.includes(job.status)) {
    throw new AppError(
      "Job status does not allow assignment completion",
      400,
      statusText.FAIL
    );
  }
};

export const getMyAssignments = async (workerId, query = {}) => {
  const pagination = buildPagination(query);
  const filter = applyStatusFilter({ worker: workerId }, query);

  const [assignments, total] = await Promise.all([
    JobAssignment.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("job", SAFE_JOB_FIELDS)
      .populate("employer", SAFE_EMPLOYER_FIELDS)
      .select("-__v")
      .lean(),
    JobAssignment.countDocuments(filter),
  ]);

  return {
    assignments: assignments.map(addDynamicRefundState),
    pagination: createPaginationMeta(pagination, total),
  };
};

export const startAssignment = async (assignmentId, workerId) => {
  const assignment = await JobAssignment.findById(assignmentId)
    .select("_id job worker status")
    .populate("job", "_id status");

  assertAssignmentExists(assignment);
  assertJobExists(assignment.job);
  assertWorkerOwnsAssignment(assignment, workerId);

  if (assignment.status !== "assigned") {
    throw new AppError(
      "Assignment is not in assigned status",
      400,
      statusText.FAIL
    );
  }

  assertStartJobStatus(assignment.job);

  const updatedAssignment = await JobAssignment.findOneAndUpdate(
    {
      _id: assignmentId,
      worker: workerId,
      status: "assigned",
    },
    {
      status: "in_progress",
      started_at: new Date(),
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!updatedAssignment) {
    throw new AppError(
      "Assignment is not in assigned status",
      400,
      statusText.FAIL
    );
  }

  const resAssignment = await JobAssignment.findById(updatedAssignment._id)
    .populate("job", SAFE_JOB_FIELDS)
    .populate("worker", SAFE_WORKER_FIELDS)
    .populate("employer", SAFE_EMPLOYER_FIELDS)
    .select("-__v")
    .lean();
  return addDynamicRefundState(resAssignment);
};

export const completeAssignment = async (assignmentId, employerId) => {
  const precheckAssignment = await JobAssignment.findById(assignmentId)
    .select("_id job worker employer status payment")
    .populate("job", "_id owner status");

  assertAssignmentExists(precheckAssignment);
  assertJobExists(precheckAssignment.job);
  assertEmployerOwnsAssignment(precheckAssignment, employerId);
  assertJobOwner(precheckAssignment.job, employerId);

  if (precheckAssignment.status !== "in_progress") {
    throw new AppError(
      "Assignment is not in progress",
      400,
      statusText.FAIL
    );
  }

  assertCompletionJobStatus(precheckAssignment.job);

  if (precheckAssignment.payment) {
    return await releaseToWorker(assignmentId, employerId);
  }

  const session = await mongoose.startSession();

  try {
    let updatedAssignmentId;

    await session.withTransaction(async () => {
      const updatedAssignment = await JobAssignment.findOneAndUpdate(
        {
          _id: assignmentId,
          employer: employerId,
          status: "in_progress",
          payment: null,
        },
        {
          status: "completed",
          completed_at: new Date(),
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!updatedAssignment) {
        throw new AppError(
          "Assignment is not in progress",
          400,
          statusText.FAIL
        );
      }

      updatedAssignmentId = updatedAssignment._id;

      await createNotification({
        recipient: precheckAssignment.worker,
        actor: employerId,
        type: "assignment_completed",
        title: "Assignment completed",
        message: "Your assignment has been marked as completed.",
        entityType: "job_assignment",
        entityId: precheckAssignment._id,
        job: precheckAssignment.job._id,
        deduplicationKey: `assignment_completed:${precheckAssignment._id}`,
        session,
      });
    });

    const resAssignment = await JobAssignment.findById(updatedAssignmentId)
      .populate("job", SAFE_JOB_FIELDS)
      .populate("worker", SAFE_WORKER_FIELDS)
      .populate("employer", SAFE_EMPLOYER_FIELDS)
      .select("-__v")
      .lean();
    return addDynamicRefundState(resAssignment);
  } catch (error) {
    if (isUnexpectedDuplicateKeyError(error)) {
      throw createNotificationPersistenceError();
    }

    throw error;
  } finally {
    session.endSession();
  }
};

export const getAssignmentById = async (assignmentId, userId) => {
  const assignment = await JobAssignment.findById(assignmentId)
    .populate("job", SAFE_JOB_FIELDS)
    .populate("worker", SAFE_WORKER_FIELDS)
    .populate("employer", SAFE_EMPLOYER_FIELDS)
    .select("-__v -attendance_token_generation_locks")
    .lean();

  assertAssignmentExists(assignment);

  const isWorker = assignment.worker._id.toString() === userId;
  const isEmployer = assignment.employer._id.toString() === userId;

  if (!isWorker && !isEmployer) {
    throw new AppError("You are not allowed to access this assignment", 403, statusText.FAIL);
  }

  return addDynamicRefundState(assignment);
};

export const markNoShow = async (assignmentId, employerId) => {
  const assignment = await JobAssignment.findById(assignmentId)
    .select("_id job worker employer status")
    .populate("job", "_id owner status");

  assertAssignmentExists(assignment);
  assertJobExists(assignment.job);
  assertEmployerOwnsAssignment(assignment, employerId);
  assertJobOwner(assignment.job, employerId);

  if (assignment.status !== "assigned") {
    throw new AppError(
      "Only assigned assignments can be marked as no-show",
      400,
      statusText.FAIL
    );
  }

  const updated = await JobAssignment.findOneAndUpdate(
    {
      _id: assignmentId,
      employer: employerId,
      status: "assigned",
    },
    { status: "cancelled" },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw new AppError("Failed to mark assignment as no-show", 400, statusText.FAIL);
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
