import * as applicationService from "./application.service.js";
import catchError from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";

export const createApplication = catchError(async (req, res) => {
  const application = await applicationService.createApplication(
    req.params.jobId,
    req.user.userId,
    req.body
  );

  res.status(201).json({
    status: statusText.SUCCESS,
    data: application,
  });
});

export const getMyApplications = catchError(async (req, res) => {
  const { applications, pagination } =
    await applicationService.getMyApplications(req.user.userId, req.query);

  res.json({
    status: statusText.SUCCESS,
    data: applications,
    pagination,
  });
});

export const getJobApplications = catchError(async (req, res) => {
  const { applications, pagination } =
    await applicationService.getJobApplications(
      req.params.jobId,
      req.user.userId,
      req.query
    );

  res.json({
    status: statusText.SUCCESS,
    data: applications,
    pagination,
  });
});

export const rejectApplication = catchError(async (req, res) => {
  const application = await applicationService.rejectApplication(
    req.params.id,
    req.user.userId
  );

  res.json({
    status: statusText.SUCCESS,
    data: application,
  });
});

export const acceptApplication = catchError(async (req, res) => {
  const result = await applicationService.acceptApplication(
    req.params.id,
    req.user.userId
  );

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});

export const cancelApplication = catchError(async (req, res) => {
  const application = await applicationService.cancelApplication(
    req.params.id,
    req.user.userId
  );

  res.json({
    status: statusText.SUCCESS,
    data: application,
  });
});
