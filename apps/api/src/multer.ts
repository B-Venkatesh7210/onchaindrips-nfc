/**
 * Multer config for in-memory file uploads (e.g. Walrus image upload).
 */

import multer from "multer";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.memoryStorage();

export const uploadSingleImage = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
}).single("image");

/** For multiple images in one field name (e.g. "images"). */
export const uploadMultipleImages = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE * 4 }, // 20MB total for multiple
}).array("images", 10);
