const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(
  process.cwd(),
  process.env.UPLOAD_DIR || "uploads"
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension =
      path.extname(file.originalname);

    const filename =
      `${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}${extension}`;

    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];

  if (!allowed.includes(file.mimetype)) {
    return cb(
      new Error(
        "Only JPG, PNG, WEBP and PDF files are allowed"
      )
    );
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize:
      Number(
        process.env.MAX_FILE_SIZE_MB || 5
      ) *
      1024 *
      1024,
  },
});

module.exports = upload;