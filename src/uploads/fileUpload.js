import multer from "multer";
import { AppError } from "../middlewares/appError.js";
import statusText from "../utils/statusText.js";

const storage = multer.memoryStorage();
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    return cb(null, true);
  }

  cb(new AppError("Only image files are allowed!", 400, statusText.FAIL));
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
  },
});

const userDocumentFields = upload.fields([
  { name: "profileImage", maxCount: 1 },
  { name: "nationalIdFront", maxCount: 1 },
  { name: "nationalIdBack", maxCount: 1 },
  { name: "verificationSelfie", maxCount: 1 },
]);

export const uploadUserDocuments = (req, res, next) => {
  userDocumentFields(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Each image must be 5MB or less"
          : error.code === "LIMIT_UNEXPECTED_FILE"
          ? "Unexpected upload field"
          : error.message;
      return next(new AppError(message, 400, statusText.FAIL));
    }

    return next(error);
  });
};
