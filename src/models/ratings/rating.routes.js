import express from "express";
import { validate } from "../../middlewares/validate.js";
import verifyAccess from "../../middlewares/verifyAccess.js";
import allowTo from "../../middlewares/allowTo.js";
import {
  CreateRatingSchema,
  JobIdParamsSchema,
  UserIdParamsSchema,
  RatingListingQuerySchema,
} from "./rating.validation.js";
import {
  createRating,
  getUserRatings,
  getUserRatingSummary,
} from "./rating.controller.js";

const ratingRoutes = express.Router();

ratingRoutes.post(
  "/jobs/:jobId/ratings",
  verifyAccess,
  allowTo("worker", "employer"),
  validate(JobIdParamsSchema, "params"),
  validate(CreateRatingSchema),
  createRating
);

ratingRoutes.get(
  "/users/:userId/ratings",
  validate(UserIdParamsSchema, "params"),
  validate(RatingListingQuerySchema, "query"),
  getUserRatings
);

ratingRoutes.get(
  "/users/:userId/rating-summary",
  validate(UserIdParamsSchema, "params"),
  getUserRatingSummary
);

export default ratingRoutes;
