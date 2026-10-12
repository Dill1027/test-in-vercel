const express = require("express");
const multer = require("multer");
const env = require("../config/env");
const predictionController = require("../controllers/predictionController");

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: env.maxImageSizeMb * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error("Only jpeg, png, and webp image files are allowed"));
  },
});

router.post("/letter", upload.single("image"), predictionController.predictLetter);

module.exports = router;
