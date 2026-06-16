import multer from "multer";
import { AppError } from "../middlewares/appError.js";
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    return cb(null, true);
  }

  cb(new AppError("Only image files are allowed!", 400));
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1 * 1024 * 1024,
  },
});

export const uploadUserDocuments = upload.fields([
  { name: "profileImage", maxCount: 1 },
  { name: "nationalIdFront", maxCount: 1 },
  { name: "nationalIdBack", maxCount: 1 },
  { name: "verificationSelfie", maxCount: 1 },
]);