const {
  interventionAttemptSchema,
  letterAttemptSchema,
  letterPracticeAttemptSchema,
  mirrorLetterAttemptSchema,
  recentActivityQuerySchema,
  sessionSchema,
  shapeAttemptSchema,
  wordAttemptSchema,
  writingLineAttemptSchema,
} = require("./validators");
const { AppError } = require("../../utils/appError");

function createDysgraphiaController({ service }) {
  const withRequestTiming = async (name, req, operation) => {
    const label = `[dysgraphia:${name}:${req.user?.uid || "unknown"}:${Date.now()}] TOTAL_REQUEST_PROCESSING`;
    console.time(label);
    try {
      return await operation();
    } finally {
      console.timeEnd(label);
    }
  };

  return {
    getCatalog: async (req, res, next) => {
      try {
        res.status(200).json(await service.getCatalogResponse());
      } catch (error) {
        next(error);
      }
    },
    getOverview: async (req, res, next) => {
      try {
        res.status(200).json(await service.getOverview(req.user.uid));
      } catch (error) {
        next(error);
      }
    },
    submitShapeAttempt: async (req, res, next) => {
      try {
        const payload = shapeAttemptSchema.parse(req.body);
        res.status(200).json(await service.submitShapeAttempt(req.user.uid, payload));
      } catch (error) {
        next(error);
      }
    },
    submitLetterAttempt: async (req, res, next) => {
      try {
        const payload = letterAttemptSchema.parse(req.body);
        res.status(200).json(await withRequestTiming("letter", req, () =>
          service.submitLetterAttempt(req.user.uid, payload, req.file)
        ));
      } catch (error) {
        next(error);
      }
    },
    submitInterventionAttempt: async (req, res, next) => {
      try {
        const payload = interventionAttemptSchema.parse(req.body);
        res.status(200).json(await service.submitInterventionAttempt(req.user.uid, payload));
      } catch (error) {
        next(error);
      }
    },
    submitLetterPracticeAttempt: async (req, res, next) => {
      try {
        const payload = letterPracticeAttemptSchema.parse(req.body);
        res.status(200).json(await service.submitLetterPracticeAttempt(req.user.uid, payload));
      } catch (error) {
        next(error);
      }
    },
    submitMirrorLetterAttempt: async (req, res, next) => {
      try {
        const payload = mirrorLetterAttemptSchema.parse(req.body);
        res.status(200).json(await service.submitMirrorLetterAttempt(req.user.uid, payload, req.file));
      } catch (error) {
        next(error);
      }
    },
    submitWordAttempt: async (req, res, next) => {
      try {
        const payload = wordAttemptSchema.parse(req.body);
        console.log("WORD CONTROLLER DEBUG");
        console.log("body:", req.body);
        console.log("payload:", payload);
        console.log("file:", req.file);

        if (!req.file && !payload.predictedWord && !payload.predictedLetters) {
          throw new AppError(400, "VALIDATION_ERROR", "A word image or structured prediction is required.");
        }
        res.status(200).json(await withRequestTiming("word", req, () =>
          service.submitWordAttempt(req.user.uid, payload, req.file)
        ));
      } catch (error) {
        next(error);
      }
    },
    predictHandwritingLetter: async (req, res, next) => {
      try {
        res.status(200).json(await withRequestTiming("prediction-only-letter", req, () =>
          service.predictHandwritingLetter(req.file)
        ));
      } catch (error) {
        next(error);
      }
    },
    createSession: async (req, res, next) => {
      try {
        const payload = sessionSchema.parse(req.body);
        res.status(201).json(await service.createSession(req.user.uid, payload));
      } catch (error) {
        next(error);
      }
    },
    getRecentActivity: async (req, res, next) => {
      try {
        const query = recentActivityQuerySchema.parse(req.query);
        res.status(200).json({
          activities: await service.getRecentActivity(req.user.uid, query.limit),
        });
      } catch (error) {
        next(error);
      }
    },
    resetProgress: async (req, res, next) => {
      try {
        res.status(200).json(await service.resetProgress(req.user));
      } catch (error) {
        next(error);
      }
    },
    submitWritingLineAttempt: async (req, res, next) => {
      try {
        const payload = writingLineAttemptSchema.parse(req.body);
        res.status(200).json(await service.submitWritingLineAttempt(req.user.uid, payload, req.file));
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createDysgraphiaController,
};
