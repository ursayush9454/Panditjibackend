const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDir = path.join(
  process.cwd(),
  process.env.UPLOAD_DIR || "uploads"
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDir);
  },

  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();

    callback(
      null,
      `birth-photo-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`
    );
  },
});

module.exports = multer({
  storage,
  limits: {
    fileSize:
      Math.min(
        Number(process.env.MAX_FILE_SIZE_MB || 5),
        5
      ) * 1024 * 1024,
  },

  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (
      !allowedMimeTypes.has(file.mimetype) ||
      !allowedExtensions.has(ext)
    ) {
      return callback(
        new Error("Photo must be JPG, PNG, or WEBP")
      );
    }

    callback(null, true);
  },
});