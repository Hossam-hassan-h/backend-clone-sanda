import * as userService from "./user.service.js";
import {AppError }from "../../middlewares/appError.js";
import  catchError  from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";

export const register = catchError(async (req, res, next) => {
  const result = await userService.register(req.body);

  res.status(201).json({
    status: statusText.SUCCESS,
    data: result,
  });
});

export const getMyProfile = catchError(async (req, res, next) => {
  const user = await userService.getProfile(req.user.userId);

  res.json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const getUserProfile = catchError(async (req, res, next) => {
  const user = await userService.getProfile(req.params.id);

  res.json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const updateProfile = catchError(async (req, res, next) => {
  const user = await userService.updateProfile(
    req.user.userId,
    req.body
  );

  res.json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const getAllUsers = catchError(async (req, res, next) => {
  const users = await userService.getAllUsers(req.query);

  res.json({
      status: statusText.SUCCESS,
    data: users,
  });
});
export const createUser = catchError(async (req, res, next) => {
  const user = await userService.createUser(req.body);

  res.status(201).json({
    status: statusText.SUCCESS,
    data: user,
  });
});

export const uploadDocuments = catchError(
  async (req, res) => {
    const user = await userService.uploadDocuments(
      req.user.userId,
      req.files
    );

    res.status(200).json({
      success: true,
      data: user,
    });
  }
);
