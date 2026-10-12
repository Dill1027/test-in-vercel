const express = require("express");
const cors = require("cors");
const pino = require("pino");
const pinoHttp = require("pino-http");
const env = require("./config/env");
const { getFirebaseAdminServices } = require("./config/firebaseAdmin");
const { createAuthMiddleware } = require("./middleware/auth");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { createDysgraphiaController } = require("./modules/dysgraphia/controller");
const { createPredictor } = require("./modules/dysgraphia/predictor");
const { createFirestoreDysgraphiaRepository } = require("./modules/dysgraphia/repository");
const { createDysgraphiaRoutes, createUploadMiddleware, assertFilePresent } = require("./modules/dysgraphia/routes");
const { createDysgraphiaService } = require("./modules/dysgraphia/service");
const { createModelHealthChecker } = require("./services/modelHealthService");

function createLogger(loggerInstance, destination) {
  if (loggerInstance) {
    return loggerInstance;
  }

  return pino({
    level: env.logLevel,
    base: undefined,
    redact: {
      paths: [
        "req.headers.authorization",
        "headers.authorization",
        "request.headers.authorization",
      ],
      censor: "[REDACTED]",
    },
  }, destination);
}

function createApp(overrides = {}) {
  const logger = createLogger(overrides.logger, overrides.logDestination);
  const firebaseAdmin = overrides.firebaseAdmin || getFirebaseAdminServices();
  const repository =
    overrides.repository ||
    createFirestoreDysgraphiaRepository({
      firestore: overrides.firestore || firebaseAdmin.firestore,
      logger,
    });
  const predictor = overrides.predictor || createPredictor({ logger });
  const service =
    overrides.service ||
    createDysgraphiaService({
      repository,
      predictor,
      logger,
      now: overrides.now,
    });
  const authMiddleware =
    overrides.authMiddleware ||
    createAuthMiddleware({
      authClient: overrides.authClient || firebaseAdmin.auth,
      repository,
      logger,
    });
  const controller = overrides.controller || createDysgraphiaController({ service });
  const modelHealthChecker =
    overrides.modelHealthChecker || createModelHealthChecker({ logger });
  const app = express();

  app.disable("x-powered-by");

  // ==================== CORS CONFIGURATION ====================
  // MUST be applied BEFORE routes to handle preflight requests
  const corsOptions = {
    origin: env.corsOrigins, // Array of allowed origins
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
    maxAge: 86400, // 24 hours
  };

  logger.info({ corsOrigins: env.corsOrigins }, "CORS configured for origins");

  // Apply CORS to all routes
  // This middleware handles both regular requests and preflight OPTIONS requests
  app.use(cors(corsOptions));

  // ==================== REQUEST LOGGING ====================
  app.use((req, res, next) => {
    logger.info({ method: req.method, url: req.originalUrl }, `[INCOMING] ${req.method} ${req.originalUrl}`);
    if (req.method === "OPTIONS") {
      logger.info({ method: req.method, url: req.originalUrl }, "[PREFLIGHT] OPTIONS request received");
    }
    next();
  });

  app.use(
    pinoHttp({
      logger,
      autoLogging: env.nodeEnv !== "test",
    })
  );

  // ==================== BODY PARSING ====================
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));

  // ==================== HEALTH CHECK ====================
  app.get("/health", async (req, res) => {
    const predictor = await modelHealthChecker.check();
    const ready = predictor.status === "ready";

    res.status(ready ? 200 : 503).json({
      status: ready ? "ok" : "unavailable",
      service: "dysgraphia-backend",
      environment: env.nodeEnv,
      checks: {
        api: { status: "ready" },
        predictor,
      },
    });
  });

  // ==================== API ROUTES ====================
  app.use("/api/dysgraphia", createDysgraphiaRoutes({ controller, authMiddleware }));

  // ==================== ALIAS ROUTE (after CORS) ====================
  // Convenience alias: accept frontend requests that target /attempts/letter
  // (some frontends may call absolute paths without the /api/dysgraphia prefix).
  // Reuse same auth and upload middleware and controller handler.
  const aliasUpload = createUploadMiddleware();
  app.post(
    "/attempts/letter",
    authMiddleware,
    aliasUpload.single("image"),
    assertFilePresent,
    controller.submitLetterAttempt
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
};
