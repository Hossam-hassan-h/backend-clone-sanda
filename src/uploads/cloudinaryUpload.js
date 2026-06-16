import cloudinary from "./cloudinaryConfig.js";
import streamifier from "streamifier";

export const uploadToCloudinary = (
  buffer,
  folder
) => {
  return new Promise((resolve, reject) => {
    if (!buffer) {
      reject(new Error("Missing upload file buffer"));
      return;
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve(result);
      }
    );

    streamifier
      .createReadStream(buffer)
      .on("error", reject)
      .pipe(stream);
  });
};
