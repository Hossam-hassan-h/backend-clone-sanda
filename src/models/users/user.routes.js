import express from "express";
import { validate } from "../../middlewares/validate.js";
import userValidationSchema, { updateProfileSchema } from "./user.validation.js";
import  verifyAccess  from "../../middlewares/verifyAccess.js";
import {
  register,
  getMyProfile,
  getUserProfile,
  updateProfile,
  getAllUsers,
  createUser,
  uploadDocuments
} from "./user.controller.js";
import allowTo from "../../middlewares/allowTo.js";
import { uploadUserDocuments } from "../../uploads/fileUpload.js";


const userRoutes = express.Router();

userRoutes.post("/register", validate(userValidationSchema), register);

userRoutes.get("/profile", verifyAccess, getMyProfile);

userRoutes.get("/profile/:id", verifyAccess, getUserProfile);

userRoutes.put(
  "/profile/:id",
  verifyAccess,
  validate(updateProfileSchema),
  updateProfile
);

userRoutes
  .route("/")
  .get(verifyAccess, allowTo("admin"), getAllUsers)
  .post(verifyAccess, allowTo("admin"), createUser);
userRoutes.patch(
  "/documents/:id",
  verifyAccess,
  uploadUserDocuments,
  uploadDocuments
);
export default userRoutes;
