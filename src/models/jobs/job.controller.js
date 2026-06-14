import * as jobService from "./job.service.js";
import catchError from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";

export const getJobs = catchError(async (req, res, next) => {
  const result = await jobService.getJobs(req.query);

  res.json({
    status: statusText.SUCCESS,
    data: result.jobs,
    pagination: result.pagination,
  });
});

export const getMyJobs = catchError(async (req, res, next) => {
  const result = await jobService.getMyJobs(req.user.userId, req.query);

  res.json({
    status: statusText.SUCCESS,
    data: result.jobs,
    pagination: result.pagination,
  });
});

export const getJobById = catchError(async (req, res, next) => {
  const job = await jobService.getJobById(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: job,
  });
});

export const createJob = catchError(async (req, res, next) => {
  const job = await jobService.createJob(req.body, req.user.userId);

  res.status(201).json({
    status: statusText.SUCCESS,
    data: job,
  });
});

export const updateJob = catchError(async (req, res, next) => {
  const job = await jobService.updateJob(req.params.id, req.user.userId, req.body);

  res.json({
    status: statusText.SUCCESS,
    data: job,
  });
});

export const cancelJob = catchError(async (req, res, next) => {
  const job = await jobService.cancelJob(req.params.id, req.user.userId);

  res.json({
    status: statusText.SUCCESS,
    data: job,
  });
});
