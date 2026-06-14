import mongoose from "mongoose";
import Rating from "./rating.model.js";
import User from "../users/users.model.js";
import Job from "../jobs/job.model.js";
import JobAssignment from "../jobAssignments/jobAssignment.model.js";
import {
  createNotification,
  createNotificationPersistenceError,
  isUnexpectedDuplicateKeyError,
} from "../notifications/notification.service.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";

const SAFE_REVIEWER_FIELDS = "name role profile_image bio";
const SAFE_JOB_FIELDS = "title status";
const SAFE_RATING_JOB_FIELDS =
  "title category location status start_date end_date";
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

const createEmptyBreakdown = () => ({
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
});

const isDuplicateKeyError = (error) => error?.code === 11000;

const isRatingDuplicateError = (error) =>
  isDuplicateKeyError(error) &&
  Boolean(error.keyPattern?.job) &&
  Boolean(error.keyPattern?.reviewer) &&
  Boolean(error.keyPattern?.reviewed_user);

const assertUserExists = async (userId) => {
  const user = await User.exists({ _id: userId });

  if (!user) {
    throw new AppError("User not found", 404, statusText.FAIL);
  }

  return user;
};

const assertJobExists = (job) => {
  if (!job) {
    throw new AppError("Job not found", 404, statusText.FAIL);
  }
};

const assertReviewedUserExists = (reviewedUser) => {
  if (!reviewedUser) {
    throw new AppError("Reviewed user not found", 404, statusText.FAIL);
  }
};

const assertNotSelfRating = (reviewerId, reviewedUserId) => {
  if (reviewerId === reviewedUserId) {
    throw new AppError("You cannot rate yourself", 400, statusText.FAIL);
  }
};

const throwRatingNotAllowed = () => {
  throw new AppError(
    "You are not allowed to rate this user for this job",
    403,
    statusText.FAIL
  );
};

const assertReviewedUserRole = (reviewerRole, reviewedUser) => {
  if (reviewerRole === "employer" && reviewedUser.role !== "worker") {
    throwRatingNotAllowed();
  }

  if (reviewerRole === "worker" && reviewedUser.role !== "employer") {
    throwRatingNotAllowed();
  }
};

const buildGeneralCompletedAssignmentFilter = ({
  jobId,
  reviewerRole,
  reviewedUserId,
}) => {
  const baseFilter = {
    job: jobId,
    status: "completed",
    completed_at: { $ne: null },
  };

  if (reviewerRole === "employer") {
    return {
      ...baseFilter,
      worker: reviewedUserId,
    };
  }

  return {
    ...baseFilter,
    employer: reviewedUserId,
  };
};

const buildReviewerCompletedAssignmentFilter = ({
  jobId,
  reviewerId,
  reviewerRole,
  reviewedUserId,
}) => {
  const baseFilter = {
    job: jobId,
    status: "completed",
    completed_at: { $ne: null },
  };

  if (reviewerRole === "employer") {
    return {
      ...baseFilter,
      worker: reviewedUserId,
      employer: reviewerId,
    };
  }

  return {
    ...baseFilter,
    worker: reviewerId,
    employer: reviewedUserId,
  };
};

const assertCompletedAssignmentExists = (assignment) => {
  if (!assignment) {
    throw new AppError(
      "Job assignment is not completed",
      400,
      statusText.FAIL
    );
  }
};

const assertReviewerAssignmentExists = (assignment) => {
  if (!assignment) {
    throwRatingNotAllowed();
  }
};

const assertRatingAllowed = ({
  assignment,
  job,
  reviewerId,
  reviewerRole,
  reviewedUserId,
}) => {
  if (reviewerRole === "employer") {
    if (
      job.owner.toString() !== reviewerId ||
      assignment.employer.toString() !== reviewerId ||
      assignment.worker.toString() !== reviewedUserId
    ) {
      throwRatingNotAllowed();
    }

    return;
  }

  if (
    assignment.worker.toString() !== reviewerId ||
    assignment.employer.toString() !== reviewedUserId ||
    job.owner.toString() !== reviewedUserId
  ) {
    throwRatingNotAllowed();
  }
};

export const createRating = async (
  jobId,
  reviewerId,
  reviewerRole,
  ratingData
) => {
  const reviewedUserId = ratingData.reviewed_user;

  const job = await Job.findById(jobId).select("_id owner status");
  assertJobExists(job);

  const reviewedUser = await User.findById(reviewedUserId).select("_id role");
  assertReviewedUserExists(reviewedUser);

  assertNotSelfRating(reviewerId, reviewedUserId);
  assertReviewedUserRole(reviewerRole, reviewedUser);

  const generalAssignment = await JobAssignment.findOne(
    buildGeneralCompletedAssignmentFilter({
      jobId,
      reviewerRole,
      reviewedUserId,
    })
  ).select("_id");

  assertCompletedAssignmentExists(generalAssignment);

  const reviewerAssignment = await JobAssignment.findOne(
    buildReviewerCompletedAssignmentFilter({
      jobId,
      reviewerId,
      reviewerRole,
      reviewedUserId,
    })
  ).select("_id job worker employer status completed_at");

  assertReviewerAssignmentExists(reviewerAssignment);

  assertRatingAllowed({
    assignment: reviewerAssignment,
    job,
    reviewerId,
    reviewerRole,
    reviewedUserId,
  });

  const session = await mongoose.startSession();

  try {
    let rating;

    await session.withTransaction(async () => {
      [rating] = await Rating.create(
        [
          {
            job: jobId,
            reviewer: reviewerId,
            reviewed_user: reviewedUserId,
            stars: ratingData.stars,
            comment: ratingData.comment,
          },
        ],
        { session }
      );

      await createNotification({
        recipient: reviewedUserId,
        actor: reviewerId,
        type: "rating_received",
        title: "New rating received",
        message: "You received a new rating.",
        entityType: "rating",
        entityId: rating._id,
        job: jobId,
        deduplicationKey: `rating_received:${rating._id}`,
        session,
      });
    });

    return await Rating.findById(rating._id)
      .populate("job", SAFE_RATING_JOB_FIELDS)
      .populate("reviewer", SAFE_REVIEWER_FIELDS)
      .populate("reviewed_user", SAFE_REVIEWER_FIELDS)
      .select("-__v -updatedAt")
      .lean();
  } catch (error) {
    if (isRatingDuplicateError(error)) {
      throw new AppError(
        "You have already rated this user for this job",
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

export const getUserRatings = async (userId, query = {}) => {
  await assertUserExists(userId);

  const pagination = buildPagination(query);
  const filter = { reviewed_user: userId };

  const [ratings, total] = await Promise.all([
    Rating.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("reviewer", SAFE_REVIEWER_FIELDS)
      .populate("job", SAFE_JOB_FIELDS)
      .select("-__v")
      .lean(),
    Rating.countDocuments(filter),
  ]);

  return {
    ratings,
    pagination: createPaginationMeta(pagination, total),
  };
};

export const getUserRatingSummary = async (userId) => {
  await assertUserExists(userId);

  const reviewedUserId = new mongoose.Types.ObjectId(userId);

  const summary = await Rating.aggregate([
    { $match: { reviewed_user: reviewedUserId } },
    {
      $group: {
        _id: "$stars",
        count: { $sum: 1 },
      },
    },
  ]);

  const breakdown = createEmptyBreakdown();
  let totalStars = 0;
  let count = 0;

  summary.forEach((item) => {
    breakdown[item._id] = item.count;
    totalStars += item._id * item.count;
    count += item.count;
  });

  return {
    average: count ? Number((totalStars / count).toFixed(2)) : 0,
    count,
    breakdown,
  };
};
