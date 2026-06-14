import crypto from "crypto";
import mongoose from "mongoose";
import AttendanceToken from "./attendanceToken.model.js";
import JobAssignment from "../jobAssignments/jobAssignment.model.js";
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

const generateRawToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const getExpiryDate = () =>
  new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
const isDuplicateKeyError = (error) => error?.code === 11000;

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
      "_id job worker employer status checked_in_at checked_out_at started_at completed_at"
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

export const checkInAssignment = async (assignmentId, workerId, qrToken) => {
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
      const updatedAssignment = await JobAssignment.findOneAndUpdate(
        {
          _id: assignmentId,
          worker: workerId,
          status: "assigned",
          checked_in_at: null,
        },
        {
          status: "in_progress",
          checked_in_at: now,
          started_at: now,
        },
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

export const checkOutAssignment = async (assignmentId, workerId, qrToken) => {
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

      const updatedAssignment = await JobAssignment.findOneAndUpdate(
        {
          _id: assignmentId,
          worker: workerId,
          status: "in_progress",
          checked_out_at: null,
        },
        {
          checked_out_at: new Date(),
        },
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
