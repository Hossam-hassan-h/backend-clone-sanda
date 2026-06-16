import cloudinary from "./cloudinaryConfig.js";
import streamifier from "streamifier";

const CLOUDINARY_UPLOAD_TIMEOUT_MS = Number(
  process.env.CLOUDINARY_UPLOAD_TIMEOUT_MS || 30000
);

const assertCloudinaryConfigured = () => {
  const missingKeys = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ].filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    throw new Error(`Cloudinary is not configured: missing ${missingKeys.join(", ")}`);
  }
};

export const uploadToCloudinary = (
  buffer,
  folder
) => {
  return new Promise((resolve, reject) => {
    if (!buffer) {
      reject(new Error("Missing upload file buffer"));
      return;
    }

    try {
      assertCloudinaryConfigured();
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (error) {
        reject(error);
        return;
      }

      if (!result?.secure_url || !result?.public_id) {
        reject(new Error("Cloudinary upload returned an invalid response"));
        return;
      }

      resolve(result);
    };

    const timer = setTimeout(
      () => finish(new Error(`Cloudinary upload timed out after ${CLOUDINARY_UPLOAD_TIMEOUT_MS}ms`)),
      CLOUDINARY_UPLOAD_TIMEOUT_MS
    );

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        finish(error, result);
      }
    );

    streamifier
      .createReadStream(buffer)
      .on("error", finish)
      .pipe(stream);
  });
};
