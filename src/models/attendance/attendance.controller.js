import * as attendanceService from "./attendance.service.js";
import catchError from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";

export const getEmployerAttendanceReport = catchError(async (req, res) => {
  const result = await attendanceService.getEmployerAttendanceReport(
    req.user.userId,
    req.query
  );

  res.json({
    status: statusText.SUCCESS,
    data: result.data,
    pagination: result.pagination,
  });
});

export const getAdminAttendanceAnalytics = catchError(async (req, res) => {
  const result = await attendanceService.getAdminAttendanceAnalytics(req.query);

  res.json({
    status: statusText.SUCCESS,
    analytics: result.analytics,
    data: result.data,
    pagination: result.pagination,
  });
});

export const generateCheckInToken = catchError(async (req, res) => {
  const token = await attendanceService.generateCheckInToken(
    req.params.id,
    req.user.userId,
    req.body
  );

  res.status(201).json({
    status: statusText.SUCCESS,
    data: token,
  });
});

export const generateCheckOutToken = catchError(async (req, res) => {
  const token = await attendanceService.generateCheckOutToken(
    req.params.id,
    req.user.userId,
    req.body
  );

  res.status(201).json({
    status: statusText.SUCCESS,
    data: token,
  });
});

export const checkInAssignment = catchError(async (req, res) => {
  const assignment = await attendanceService.checkInAssignment(
    req.params.id,
    req.user.userId,
    req.body.qrToken,
    req.body.location
  );

  res.status(200).json({
    status: statusText.SUCCESS,
    data: assignment,
  });
});

export const checkOutAssignment = catchError(async (req, res) => {
  const assignment = await attendanceService.checkOutAssignment(
    req.params.id,
    req.user.userId,
    req.body.qrToken,
    req.body.location
  );

  res.status(200).json({
    status: statusText.SUCCESS,
    data: assignment,
  });
});
