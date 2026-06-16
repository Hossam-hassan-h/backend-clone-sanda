import crypto from "crypto";
import mongoose from "mongoose";
import AttendanceToken from "./attendanceToken.model.js";
import JobAssignment from "../jobAssignments/jobAssignment.model.js";
import Payment from "../payments/payment.model.js";
import { executeReleasePayment } from "../payments/escrow.service.js";
import {
  createNotification,
  createNotificationPersistenceError,
  isUnexpectedDuplicateKeyError,
} from "../notifications/notification.service.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";

const TOKEN_TTL_MINUTES = 5;
const GENERATION_LOCK_MS = 30 * 1000;
const ACTIVE_JOB_STATUSES = ["open", "in_progress"];
const SAFE_WORKER_FIELDS = "name role profile_image bio";
const SAFE_EMPLOYER_FIELDS = "name role profile_image bio";
const SAFE_JOB_FIELDS =
  "title category location status start_date end_date salary";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const generateRawToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const getExpiryDate = () =>
  new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
const isDuplicateKeyError = (error) => error?.code === 11000;

const buildPagination = (query = {}) => {
  const page = Math.max(Number(query.page) || DEFAULT_PAGE, 1);
  const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
};

const createPaginationMeta = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const normalizeStatusFilter = (status) => {
  if (!status) return undefined;
  if (status === "checked-in") return "in_progress";
  if (status === "checked-out") return "completed";
  if (status === "no-show") return "cancelled";
  return status;
};

const assertAssignmentExists = (assignment) => {
  if (!assignment) {
    throw new AppError("Assignment not found", 404, statusText.FAIL);
  }
};

const assertJobExists = (job) => {
  if (!job) {
    throw new AppError("Job not found", 404, statusText.FAIL);
  }
};

const assertActiveJobStatus = (job) => {
  if (!ACTIVE_JOB_STATUSES.includes(job.status)) {
    throw new AppError(
      "Job status does not allow attendance",
      400,
      statusText.FAIL
    );
  }
};

const assertEmployerOwnsAttendance = (assignment, employerId) => {
  if (
    assignment.employer.toString() !== employerId ||
    assignment.job.owner.toString() !== employerId
  ) {
    throw new AppError(
      "You are not allowed to manage attendance for this assignment",
      403,
      statusText.FAIL
    );
  }
};

const assertWorkerOwnsAssignment = (assignment, workerId, message) => {
  if (assignment.worker.toString() !== workerId) {
    throw new AppError(message, 403, statusText.FAIL);
  }
};

const getPopulatedAssignment = async (assignmentId, session = null) => {
  const query = JobAssignment.findById(assignmentId)
    .populate("job", "_id owner status")
    .select(
      "_id job worker employer status checked_in_at checked_out_at started_at completed_at check_in_location check_out_location payment marketplace_status"
    );

  if (session) {
    query.session(session);
  }

  return await query;
};

const formatAssignmentResponse = async (assignmentId) =>
  await JobAssignment.findById(assignmentId)
    .populate("job", SAFE_JOB_FIELDS)
    .populate("worker", SAFE_WORKER_FIELDS)
    .populate("employer", SAFE_EMPLOYER_FIELDS)
    .select("-__v -attendance_token_generation_locks")
    .lean();

const getAttendanceStatus = (assignment) => {
  if (assignment.checked_out_at) return "checked_out";
  if (assignment.checked_in_at) return "checked_in";
  return "none";
};

const getWorkedHours = (assignment) => {
  if (!assignment.checked_in_at || !assignment.checked_out_at) return null;
  return Math.max(
    0,
    (new Date(assignment.checked_out_at).getTime() -
      new Date(assignment.checked_in_at).getTime()) /
      3600000
  );
};

const getDynamicRefundState = (assignment) => {
  let marketplaceStatus = assignment.marketplace_status;
  let refundDeadline = null;

  if (
    assignment.checked_in_at &&
    !assignment.checked_out_at &&
    assignment.status !== "completed" &&
    assignment.marketplace_status === "FUNDS_HELD"
  ) {
    const checkInTime = new Date(assignment.checked_in_at).getTime();
    const thirtyMinutes = 30 * 60 * 1000;
    if (Date.now() - checkInTime <= thirtyMinutes) {
      marketplaceStatus = "REFUND_WINDOW_ACTIVE";
      refundDeadline = new Date(checkInTime + thirtyMinutes).toISOString();
    }
  }

  return { marketplaceStatus, refundDeadline };
};

const serializeAttendanceAssignment = (assignment) => {
  const job = assignment.job || {};
  const worker = assignment.worker || {};
  const { marketplaceStatus, refundDeadline } = getDynamicRefundState(assignment);
  return {
    id: assignment._id?.toString(),
    jobId: job._id?.toString() || assignment.job?.toString(),
    job: {
      id: job._id?.toString(),
      title: job.title,
      city: job.location,
      price: job.salary,
      status: job.status,
    },
    workerId: worker._id?.toString() || assignment.worker?.toString(),
    worker: {
      id: worker._id?.toString(),
      name: worker.name,
      avatar: worker.profile_image?.url,
      rating: worker.rating,
    },
    employerId: assignment.employer?._id?.toString() || assignment.employer?.toString(),
    status: assignment.status,
    checkInTime: assignment.checked_in_at,
    checkOutTime: assignment.checked_out_at,
    checkedInAt: assignment.checked_in_at,
    checkedOutAt: assignment.checked_out_at,
    completedAt: assignment.completed_at,
    refundDeadline: refundDeadline || assignment.refund_deadline || null,
    marketplaceStatus,
    payment: assignment.payment,
    attendanceStatus: getAttendanceStatus(assignment),
    workedHours: getWorkedHours(assignment),
    checkInLocation: assignment.check_in_location || null,
    checkOutLocation: assignment.check_out_location || null,
    createdAt: assignment.createdAt,
  };
};

const buildAttendanceFilter = (baseFilter, query = {}) => {
  const filter = { ...baseFilter };
  const status = normalizeStatusFilter(query.status);
  if (status) filter.status = status;
  if (query.jobId) filter.job = query.jobId;
  if (query.fromDate || query.toDate) {
    filter.createdAt = {};
    if (query.fromDate) filter.createdAt.$gte = new Date(query.fromDate);
    if (query.toDate) filter.createdAt.$lte = new Date(query.toDate);
  }
  return filter;
};

export const getEmployerAttendanceReport = async (employerId, query = {}) => {
  const pagination = buildPagination(query);
  const filter = buildAttendanceFilter({ employer: employerId }, query);

  let workerIds = null;
  if (query.workerName) {
    const User = (await import("../users/users.model.js")).default;
    const workers = await User.find({
      name: { $regex: query.workerName, $options: "i" },
      role: "worker",
    }).select("_id");
    workerIds = workers.map((worker) => worker._id);
    filter.worker = { $in: workerIds };
  }

  const [assignments, total] = await Promise.all([
    JobAssignment.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("job", SAFE_JOB_FIELDS)
      .populate("worker", SAFE_WORKER_FIELDS)
      .populate("employer", SAFE_EMPLOYER_FIELDS)
      .select("-__v -attendance_token_generation_locks")
      .lean(),
    JobAssignment.countDocuments(filter),
  ]);

  return {
    data: assignments.map(serializeAttendanceAssignment),
    pagination: createPaginationMeta(pagination, total),
  };
};

export const getAdminAttendanceAnalytics = async (query = {}) => {
  const pagination = buildPagination(query);
  const filter = buildAttendanceFilter({}, query);

  const [assignments, total, allForAnalytics] = await Promise.all([
    JobAssignment.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("job", SAFE_JOB_FIELDS)
      .populate("worker", SAFE_WORKER_FIELDS)
      .populate("employer", SAFE_EMPLOYER_FIELDS)
      .select("-__v -attendance_token_generation_locks")
      .lean(),
    JobAssignment.countDocuments(filter),
    JobAssignment.find(filter).select("checked_in_at checked_out_at status").lean(),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const workedHours = allForAnalytics
    .map(getWorkedHours)
    .filter((hours) => hours != null);
  const totalWorkedHours = workedHours.reduce((sum, hours) => sum + hours, 0);

  return {
    analytics: {
      totalAssignments: total,
      todayCheckIns: allForAnalytics.filter((item) => item.checked_in_at && item.checked_in_at >= today).length,
      activeShifts: allForAnalytics.filter((item) => item.checked_in_at && !item.checked_out_at).length,
      avgWorkedHours: workedHours.length ? totalWorkedHours / workedHours.length : 0,
      totalWorkedHours,
    },
    data: assignments.map(serializeAttendanceAssignment),
    pagination: createPaginationMeta(pagination, total),
  };
};

const assertAssignmentStatusForToken = (assignment, type) => {
  if (type === "check_in") {
    if (assignment.status !== "assigned") {
      throw new AppError("Assignment is not assigned", 400, statusText.FAIL);
    }

    if (assignment.checked_in_at) {
      throw new AppError(
        "Worker has already checked in",
        400,
        statusText.FAIL
      );
    }
  }

  if (type === "check_out") {
    if (assignment.status !== "in_progress") {
      throw new AppError(
        "Assignment is not in progress",
        400,
        statusText.FAIL
      );
    }

    if (assignment.checked_out_at) {
      throw new AppError(
        "Worker has already checked out",
        400,
        statusText.FAIL
      );
    }
  }
};

const acquireGenerationLock = async ({ assignmentId, type, session }) => {
  const now = new Date();
  const lockUntil = new Date(Date.now() + GENERATION_LOCK_MS);
  const lockField = `attendance_token_generation_locks.${type}`;

  const lockedAssignment = await JobAssignment.findOneAndUpdate(
    {
      _id: assignmentId,
      $or: [
        { [lockField]: null },
        { [lockField]: { $exists: false } },
        { [lockField]: { $lte: now } },
      ],
    },
    {
      $set: {
        [lockField]: lockUntil,
      },
    },
    {
      new: true,
      session,
    }
  );

  if (!lockedAssignment) {
    throw new AppError(
      "An active attendance token already exists",
      409,
      statusText.FAIL
    );
  }
};

const generateAttendanceToken = async (
  assignmentId,
  employerId,
  type,
  options = {}
) => {
  const session = await mongoose.startSession();

  try {
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = getExpiryDate();

    try {
      await session.withTransaction(async () => {
        const assignment = await getPopulatedAssignment(assignmentId, session);

        assertAssignmentExists(assignment);
        assertJobExists(assignment.job);
        assertEmployerOwnsAttendance(assignment, employerId);
        assertActiveJobStatus(assignment.job);
        assertAssignmentStatusForToken(assignment, type);

        await acquireGenerationLock({
          assignmentId: assignment._id,
          type,
          session,
        });

        if (options.replace === true) {
          await AttendanceToken.updateMany(
            {
              assignment: assignment._id,
              type,
              usedAt: null,
              isRevoked: false,
            },
            {
              isRevoked: true,
            },
            { session }
          );
        } else {
          await AttendanceToken.updateMany(
            {
              assignment: assignment._id,
              type,
              usedAt: null,
              isRevoked: false,
              expiresAt: { $lte: new Date() },
            },
            {
              isRevoked: true,
            },
            { session }
          );
        }

        await AttendanceToken.create(
          [
            {
              job: assignment.job._id,
              assignment: assignment._id,
              employer: assignment.employer,
              type,
              tokenHash,
              expiresAt,
            },
          ],
          { session }
        );
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          "An active attendance token already exists",
          409,
          statusText.FAIL
        );
      }

      throw error;
    }

    return {
      qrToken: rawToken,
      type,
      expiresAt,
    };
  } finally {
    session.endSession();
  }
};

const consumeAttendanceToken = async ({
  assignment,
  qrToken,
  expectedType,
  session,
}) => {
  const tokenHash = hashToken(qrToken);
  const token = await AttendanceToken.findOne({ tokenHash }).session(session);

  if (!token) {
    throw new AppError("Invalid attendance token", 400, statusText.FAIL);
  }

  if (token.type !== expectedType) {
    throw new AppError("Attendance token type mismatch", 400, statusText.FAIL);
  }

  if (
    token.assignment.toString() !== assignment._id.toString() ||
    token.job.toString() !== assignment.job._id.toString() ||
    token.employer.toString() !== assignment.employer.toString()
  ) {
    throw new AppError("Invalid attendance token", 400, statusText.FAIL);
  }

  if (token.isRevoked) {
    throw new AppError("Invalid attendance token", 400, statusText.FAIL);
  }

  if (token.usedAt) {
    throw new AppError(
      "Attendance token already used",
      409,
      statusText.FAIL
    );
  }

  if (token.expiresAt <= new Date()) {
    throw new AppError("Attendance token expired", 410, statusText.FAIL);
  }

  const usedToken = await AttendanceToken.findOneAndUpdate(
    {
      _id: token._id,
      usedAt: null,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    },
    {
      usedAt: new Date(),
    },
    {
      new: true,
      session,
    }
  );

  if (!usedToken) {
    throw new AppError(
      "Attendance token already used",
      409,
      statusText.FAIL
    );
  }
};

export const generateCheckInToken = async (
  assignmentId,
  employerId,
  options = {}
) => await generateAttendanceToken(assignmentId, employerId, "check_in", options);

export const generateCheckOutToken = async (
  assignmentId,
  employerId,
  options = {}
) =>
  await generateAttendanceToken(assignmentId, employerId, "check_out", options);

const normalizeLocation = (location) =>
  location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    ? { lat: location.lat, lng: location.lng }
    : undefined;

export const checkInAssignment = async (assignmentId, workerId, qrToken, location) => {
  const session = await mongoose.startSession();

  try {
    let updatedAssignmentId;

    await session.withTransaction(async () => {
      const assignment = await getPopulatedAssignment(assignmentId, session);

      assertAssignmentExists(assignment);
      assertJobExists(assignment.job);
      assertWorkerOwnsAssignment(
        assignment,
        workerId,
        "You are not allowed to check in for this assignment"
      );
      assertActiveJobStatus(assignment.job);

      if (assignment.status !== "assigned") {
        throw new AppError(
          "Assignment is not assigned",
          400,
          statusText.FAIL
        );
      }

      if (assignment.checked_in_at) {
        throw new AppError(
          "Worker has already checked in",
          400,
          statusText.FAIL
        );
      }

      await consumeAttendanceToken({
        assignment,
        qrToken,
        expectedType: "check_in",
        session,
      });

      const now = new Date();
      const update = {
        status: "in_progress",
        checked_in_at: now,
        started_at: now,
      };
      const safeLocation = normalizeLocation(location);
      if (safeLocation) update.check_in_location = safeLocation;

      const updatedAssignment = await JobAssignment.findOneAndUpdate(
        {
          _id: assignmentId,
          worker: workerId,
          status: "assigned",
          checked_in_at: null,
        },
        update,
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!updatedAssignment) {
        throw new AppError(
          "Worker has already checked in",
          400,
          statusText.FAIL
        );
      }

      updatedAssignmentId = updatedAssignment._id;

      await createNotification({
        recipient: assignment.employer,
        actor: workerId,
        type: "worker_checked_in",
        title: "Worker checked in",
        message: "A worker checked in for your job.",
        entityType: "job_assignment",
        entityId: assignment._id,
        job: assignment.job._id,
        deduplicationKey: `check_in:${assignment._id}`,
        session,
      });
    });

    return await formatAssignmentResponse(updatedAssignmentId);
  } catch (error) {
    if (isUnexpectedDuplicateKeyError(error)) {
      throw createNotificationPersistenceError();
    }

    throw error;
  } finally {
    session.endSession();
  }
};

export const checkOutAssignment = async (assignmentId, workerId, qrToken, location) => {
  const session = await mongoose.startSession();

  try {
    let updatedAssignmentId;

    await session.withTransaction(async () => {
      const assignment = await getPopulatedAssignment(assignmentId, session);

      assertAssignmentExists(assignment);
      assertJobExists(assignment.job);
      assertWorkerOwnsAssignment(
        assignment,
        workerId,
        "You are not allowed to check out for this assignment"
      );
      assertActiveJobStatus(assignment.job);

      if (assignment.status !== "in_progress") {
        throw new AppError(
          "Assignment is not in progress",
          400,
          statusText.FAIL
        );
      }

      if (!assignment.checked_in_at) {
        throw new AppError(
          "Worker has not checked in",
          400,
          statusText.FAIL
        );
      }

      if (assignment.checked_out_at) {
        throw new AppError(
          "Worker has already checked out",
          400,
          statusText.FAIL
        );
      }

      await consumeAttendanceToken({
        assignment,
        qrToken,
        expectedType: "check_out",
        session,
      });

      const now = new Date();
      const update = {
        checked_out_at: now,
        status: "completed",
        completed_at: now,
      };
      const safeLocation = normalizeLocation(location);
      if (safeLocation) update.check_out_location = safeLocation;

      const updatedAssignment = await JobAssignment.findOneAndUpdate(
        {
          _id: assignmentId,
          worker: workerId,
          status: "in_progress",
          checked_out_at: null,
        },
        update,
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!updatedAssignment) {
        throw new AppError(
          "Worker has already checked out",
          400,
          statusText.FAIL
        );
      }

      if (updatedAssignment.payment) {
        const payment = await Payment.findOneAndUpdate(
          { _id: updatedAssignment.payment, status: "FUNDS_HELD" },
          { status: "RELEASED", released_at: now },
          { new: true, runValidators: true, session }
        );

        if (!payment) {
          throw new AppError("Payment is not held in escrow", 400, statusText.FAIL);
        }

        await executeReleasePayment(updatedAssignment, payment, session, workerId);
        updatedAssignment.marketplace_status = "RELEASED";
        await updatedAssignment.save({ session });
      }

      updatedAssignmentId = updatedAssignment._id;

      await createNotification({
        recipient: assignment.employer,
        actor: workerId,
        type: "worker_checked_out",
        title: "Worker checked out",
        message: "A worker checked out from your job.",
        entityType: "job_assignment",
        entityId: assignment._id,
        job: assignment.job._id,
        deduplicationKey: `check_out:${assignment._id}`,
        session,
      });

      await createNotification({
        recipient: assignment.worker,
        actor: workerId,
        type: "assignment_completed",
        title: "Assignment completed",
        message: "Your assignment has been marked as completed.",
        entityType: "job_assignment",
        entityId: assignment._id,
        job: assignment.job._id,
        deduplicationKey: `assignment_completed:${assignment._id}`,
        session,
      });
    });

    return await formatAssignmentResponse(updatedAssignmentId);
  } catch (error) {
    if (isUnexpectedDuplicateKeyError(error)) {
      throw createNotificationPersistenceError();
    }

    throw error;
  } finally {
    session.endSession();
  }
};
