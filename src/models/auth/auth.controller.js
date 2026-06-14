import * as authService from "./auth.service.js";
import * as userService from "../users/user.service.js";
import  catchError  from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";

export const login = catchError(async (req, res, next) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});

export const refreshToken = catchError(async (req, res, next) => {
  const { refreshToken } = req.body;
  const result = await authService.refreshToken(refreshToken);

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});

export const logout = catchError(async (req, res, next) => {
  const userId = req.user.userId;
  const result = await authService.logout(userId);

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});

export const changePassword = catchError(async (req, res, next) => {
  const userId = req.user.userId;
  const { currentPassword, newPassword } = req.body;
  const result = await authService.changePassword(userId, currentPassword, newPassword);

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});

export const verifyEmail = catchError(async (req, res) => {
  const { email, otp } = req.body;
  const result = await userService.verifyEmail(email, otp);

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});

export const forgotPassword = catchError(async (req, res) => {
  const { email } = req.body;
  const result = await authService.forgotPassword(email);

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});

export const resetPassword = catchError(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const result = await authService.resetPassword(email, otp, newPassword);

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});
