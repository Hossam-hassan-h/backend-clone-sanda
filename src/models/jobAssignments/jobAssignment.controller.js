import * as jobAssignmentService from "./jobAssignment.service.js";
import catchError from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";

export const getMyAssignments = catchError(async (req, res) => {
  const { assignments, pagination } =
    await jobAssignmentService.getMyAssignments(req.user.userId, req.query);

  res.json({
    status: statusText.SUCCESS,
    data: assignments,
    pagination,
  });
});

export const getJobAssignments = catchError(async (req, res) => {
  const { assignments, pagination } =
    await jobAssignmentService.getJobAssignments(
      req.params.jobId,
      req.user.userId,
      req.query
    );

  res.json({
    status: statusText.SUCCESS,
    data: assignments,
    pagination,
  });
});

export const startAssignment = catchError(async (req, res) => {
  const assignment = await jobAssignmentService.startAssignment(
    req.params.id,
    req.user.userId
  );

  res.status(200).json({
    status: statusText.SUCCESS,
    data: assignment,
  });
});

export const getAssignmentById = catchError(async (req, res) => {
  const assignment = await jobAssignmentService.getAssignmentById(
    req.params.id,
    req.user.userId
  );

  res.json({
    status: statusText.SUCCESS,
    data: assignment,
  });
});

export const markNoShow = catchError(async (req, res) => {
  const assignment = await jobAssignmentService.markNoShow(
    req.params.id,
    req.user.userId
  );

  res.json({
    status: statusText.SUCCESS,
    data: assignment,
  });
});

export const completeAssignment = catchError(async (req, res) => {
  const assignment = await jobAssignmentService.completeAssignment(
    req.params.id,
    req.user.userId
  );

  res.status(200).json({
    status: statusText.SUCCESS,
    data: assignment,
  });
});
