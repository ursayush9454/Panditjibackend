const r = require("express").Router();

const auth = require("../middleware/auth");
const upload = require("../utils/upload");

r.post(
  "/single",
  auth,
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File is required",
      });
    }

    const fileUrl =
      `/uploads/${req.file.filename}`;

    return res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      file: {
        filename: req.file.filename,
        originalName:
          req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: fileUrl,
      },
    });
  }
);

module.exports = r;