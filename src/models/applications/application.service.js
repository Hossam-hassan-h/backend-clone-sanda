import mongoose from "mongoose";
import Application from "./application.model.js";
import Job from "../jobs/job.model.js";
import JobAssignment from "../jobAssignments/jobAssignment.model.js";
import {
  createNotification,
  createNotificationPersistenceError,
  isUnexpectedDuplicateKeyError,
} from "../notifications/notification.service.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";

const SAFE_WORKER_FIELDS = "name role profile_image bio";
const SAFE_OWNER_FIELDS = "name role profile_image bio";
const SAFE_JOB_FIELDS =
  "title category location salary status start_date end_date owner";
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

const assertApplicationExists = (application) => {
  if (!application) {
    throw new AppError("Application not found", 404, statusText.FAIL);
  }
};

const assertJobOwner = (job, employerId) => {
  if (job.owner.toString() !== employerId) {
    throw new AppError(
      "You are not allowed to access applications for this job",
      403,
      statusText.FAIL
    );
  }
};

const assertRejectAllowed = (application, employerId) => {
  if (application.job.owner.toString() !== employerId) {
    throw new AppError(
      "You are not allowed to reject this application",
      403,
      statusText.FAIL
    );
  }
};

const assertPending = (application) => {
  if (application.status !== "pending") {
    throw new AppError("Application is not pending", 400, statusText.FAIL);
  }
};

const isDuplicateKeyError = (error) => error?.code === 11000;

const isApplicationDuplicateError = (error) =>
  isDuplicateKeyError(error) &&
  Boolean(error.keyPattern?.job) &&
  Boolean(error.keyPattern?.worker);

const assertAcceptJobOwner = (job, employerId) => {
  if (job.owner.toString() !== employerId) {
    throw new AppError(
      "You are not allowed to accept applications for this job",
      403,
      statusText.FAIL
    );
  }
};

const assertAcceptableJobStatus = (job) => {
  if (job.status !== "open") {
    throw new AppError(
      "Job status does not allow acceptance",
      400,
      statusText.FAIL
    );
  }
};

const mapAssignmentDuplicateError = (error) => {
  const isAssignmentDuplicateError =
    isDuplicateKeyError(error) &&
    (Boolean(error.keyPattern?.application) ||
      (Boolean(error.keyPattern?.job) && Boolean(error.keyPattern?.worker)));

  if (!isAssignmentDuplicateError) return null;

  return new AppError(
    "Job assignment already exists",
    409,
    statusText.FAIL
  );
};

const getApplicationWithJobOwner = async (applicationId) => {
  const application = await Application.findById(applicationId).populate(
    "job",
    "_id owner"
  );

  assertApplicationExists(application);

  if (!application.job) {
    throw new AppError("Job not found", 404, statusText.FAIL);
  }

  return application;
};

export const createApplication = async (
  jobId,
  workerId,
  applicationData = {}
) => {
  const session = await mongoose.startSession();

  try {
    let createdApplication;

    await session.withTransaction(async () => {
      const job = await Job.findById(jobId)
        .select("_id owner status")
        .session(session);

      assertJobExists(job);

      if (job.status !== "open") {
        throw new AppError("Job is not open", 400, statusText.FAIL);
      }

      if (job.owner.toString() === workerId) {
        throw new AppError(
          "You cannot apply to your own job",
          400,
          statusText.FAIL
        );
      }

      [createdApplication] = await Application.create(
        [
          {
            job: jobId,
            worker: workerId,
            message: applicationData.message,
            status: "pending",
          },
        ],
        { session }
      );

      await createNotification({
        recipient: job.owner,
        actor: workerId,
        type: "application_created",
        title: "New job application",
        message: "A worker applied to your job.",
        entityType: "application",
        entityId: createdApplication._id,
        job: job._id,
        deduplicationKey: `application_created:${createdApplication._id}`,
        session,
      });
    });

    return await Application.findById(createdApplication._id)
      .populate({
        path: "job",
        select: SAFE_JOB_FIELDS,
        populate: {
          path: "owner",
          select: SAFE_OWNER_FIELDS,
        },
      })
      .populate("worker", SAFE_WORKER_FIELDS)
      .select("-__v");
  } catch (error) {
    if (isApplicationDuplicateError(error)) {
      throw new AppError(
        "You have already applied to this job",
        409,
        statusText.FAIL
      );
    }

    if (isUnexpectedDuplicateKeyError(error)) {
      throw createNotificationPersistenceError();
    }

    throw error;
  } finally {
    session.endSession();
  }
};

export const getMyApplications = async (workerId, query = {}) => {
  const pagination = buildPagination(query);
  const filter = applyStatusFilter({ worker: workerId }, query);

  const [applications, total] = await Promise.all([
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate({
        path: "job",
        select: SAFE_JOB_FIELDS,
        populate: {
          path: "owner",
          select: SAFE_OWNER_FIELDS,
        },
      })
      .select("-__v")
      .lean(),
    Application.countDocuments(filter),
  ]);

  return {
    applications,
    pagination: createPaginationMeta(pagination, total),
  };
};

export const getJobApplications = async (jobId, employerId, query = {}) => {
  const job = await Job.findById(jobId).select("_id owner");

  assertJobExists(job);
  assertJobOwner(job, employerId);

  const pagination = buildPagination(query);
  const filter = applyStatusFilter({ job: jobId }, query);

  const [applications, total] = await Promise.all([
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("worker", SAFE_WORKER_FIELDS)
      .select("-__v")
      .lean(),
    Application.countDocuments(filter),
  ]);

  return {
    applications,
    pagination: createPaginationMeta(pagination, total),
  };
};

export const rejectApplication = async (applicationId, employerId) => {
  const session = await mongoose.startSession();

  try {
    let rejectedApplication;

    await session.withTransaction(async () => {
      const application = await Application.findById(applicationId)
        .populate("job", "_id owner")
        .session(session);

      assertApplicationExists(application);

      if (!application.job) {
        throw new AppError("Job not found", 404, statusText.FAIL);
      }

      assertRejectAllowed(application, employerId);
      assertPending(application);

      application.status = "rejected";
      await application.save({ session });

      rejectedApplication = application;

      await createNotification({
        recipient: application.worker,
        actor: employerId,
        type: "application_rejected",
        title: "Application rejected",
        message: "Your application has been rejected.",
        entityType: "application",
        entityId: application._id,
        job: application.job._id,
        deduplicationKey: `application_rejected:${application._id}`,
        session,
      });
    });

    return await Application.findById(rejectedApplication._id)
      .populate("worker", SAFE_WORKER_FIELDS)
      .populate("job", "title status")
      .select("-__v");
  } catch (error) {
    if (isUnexpectedDuplicateKeyError(error)) {
      throw createNotificationPersistenceError();
    }

    throw error;
  } finally {
    session.endSession();
  }
};

export const acceptApplication = async (applicationId, employerId) => {
  const session = await mongoose.startSession();

  try {
    let acceptedApplication;
    let assignment;

    await session.withTransaction(async () => {
      const application = await Application.findById(applicationId).session(
        session
      );

      assertApplicationExists(application);
      assertPending(application);

      const job = await Job.findById(application.job)
        .select("_id owner status accepted_workers_count required_workers")
        .session(session);

      assertJobExists(job);
      assertAcceptJobOwner(job, employerId);
      assertAcceptableJobStatus(job);

      const reservedJob = await Job.findOneAndUpdate(
        {
          _id: job._id,
          status: "open",
          $expr: {
            $lt: ["$accepted_workers_count", "$required_workers"],
          },
        },
        {
          $inc: { accepted_workers_count: 1 },
        },
        {
          new: true,
          session,
        }
      );

      if (!reservedJob) {
        throw new AppError(
          "Job has reached the required worker capacity",
          409,
          statusText.FAIL
        );
      }

      acceptedApplication = await Application.findOneAndUpdate(
        {
          _id: application._id,
          status: "pending",
        },
        {
          status: "accepted",
        },
        {
          new: true,
          session,
        }
      );

      if (!acceptedApplication) {
        throw new AppError(
          "Application is not pending",
          400,
          statusText.FAIL
        );
      }

      try {
        [assignment] = await JobAssignment.create(
          [
            {
              job: job._id,
              application: application._id,
              worker: application.worker,
              employer: employerId,
              status: "assigned",
            },
          ],
          { session }
        );
      } catch (error) {
        const mappedError = mapAssignmentDuplicateError(error);
        if (mappedError) throw mappedError;
        throw error;
      }

      await createNotification({
        recipient: application.worker,
        actor: employerId,
        type: "application_accepted",
        title: "Application accepted",
        message: "Your application has been accepted.",
        entityType: "application",
        entityId: application._id,
        job: job._id,
        deduplicationKey: `application_accepted:${application._id}`,
        session,
      });
    });

    const [applicationResult, assignmentResult] = await Promise.all([
      Application.findById(acceptedApplication._id)
        .populate("worker", SAFE_WORKER_FIELDS)
        .populate("job", "title status")
        .select("-__v"),
      JobAssignment.findById(assignment._id)
        .populate("worker", SAFE_WORKER_FIELDS)
        .populate("employer", SAFE_OWNER_FIELDS)
        .populate(
          "job",
          "title category location status start_date end_date salary"
        )
        .select("-__v"),
    ]);

    return {
      application: applicationResult,
      assignment: assignmentResult,
    };
  } catch (error) {
    if (isUnexpectedDuplicateKeyError(error)) {
      throw createNotificationPersistenceError();
    }

    throw error;
  } finally {
    session.endSession();
  }
};

export const cancelApplication = async (applicationId, workerId) => {
  const application = await Application.findById(applicationId).populate(
    "job",
    "_id"
  );

  assertApplicationExists(application);

  if (application.worker.toString() !== workerId) {
    throw new AppError(
      "You are not allowed to cancel this application",
      403,
      statusText.FAIL
    );
  }

  assertPending(application);

  application.status = "cancelled";
  await application.save();

  return await Application.findById(application._id)
    .populate({
      path: "job",
      select: SAFE_JOB_FIELDS,
      populate: {
        path: "owner",
        select: SAFE_OWNER_FIELDS,
      },
    })
    .select("-__v");
};
