import * as ratingService from "./rating.service.js";
import catchError from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";

export const createRating = catchError(async (req, res) => {
  const rating = await ratingService.createRating(
    req.params.jobId,
    req.user.userId,
    req.user.role,
    req.body
  );

  res.status(201).json({
    status: statusText.SUCCESS,
    data: rating,
  });
});

export const getUserRatings = catchError(async (req, res) => {
  const { ratings, pagination } = await ratingService.getUserRatings(
    req.params.userId,
    req.query
  );

  res.json({
    status: statusText.SUCCESS,
    data: ratings,
    pagination,
  });
});

export const getUserRatingSummary = catchError(async (req, res) => {
  const summary = await ratingService.getUserRatingSummary(req.params.userId);

  res.json({
    status: statusText.SUCCESS,
    data: summary,
  });
});
