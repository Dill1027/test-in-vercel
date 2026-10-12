const express = require("express");
const multer = require("multer");
const env = require("../../config/env");
const { AppError } = require("../../utils/appError");

function createUploadMiddleware() {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: env.maxImageSizeMb * 1024 * 1024,
    },
    fileFilter: (req, file, callback) => {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(file.mimetype)) {
        callback(new AppError(400, "VALIDATION_ERROR", "Only JPEG, PNG, and WEBP images are supported."));
        return;
      }

      callback(null, true);
    },
  });
}

function assertFilePresent(req, res, next) {
  if (!req.file || !req.file.buffer) {
    next(new AppError(400, "VALIDATION_ERROR", "Image file is required in field 'image'."));
    return;
  }

  next();
}
function createDysgraphiaRoutes({ controller, authMiddleware }) {
  const router = express.Router();
  const upload = createUploadMiddleware();

  router.use(authMiddleware);
  router.get("/catalog", controller.getCatalog);
  router.get("/overview", controller.getOverview);
  router.post("/attempts/shape", controller.submitShapeAttempt);
  router.post("/attempts/intervention", controller.submitInterventionAttempt);
  router.post("/attempts/letter", upload.single("image"), assertFilePresent, controller.submitLetterAttempt);
  router.post("/attempts/letter-practice", controller.submitLetterPracticeAttempt);
  router.post("/attempts/mirror-letter", upload.single("image"), controller.submitMirrorLetterAttempt);
  router.post("/attempts/word", upload.single("image"), controller.submitWordAttempt);
  router.post("/predictions/letter", upload.single("image"), assertFilePresent, controller.predictHandwritingLetter);
  router.post("/attempts/writing-lines", upload.single("image"), controller.submitWritingLineAttempt);
  router.post("/sessions", controller.createSession);
  router.get("/activity/recent", controller.getRecentActivity);
  router.post("/reset", controller.resetProgress);

  return router;
}

// Export helpers so the app can reuse upload/assert middleware for alias routes
module.exports = {
  createDysgraphiaRoutes,
  createUploadMiddleware,
  assertFilePresent,
};
