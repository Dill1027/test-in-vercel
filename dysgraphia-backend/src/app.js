const express = require("express");
const cors = require("cors");
const pino = require("pino");
const pinoHttp = require("pino-http");
const env = require("./config/env");
const { createAuthMiddleware } = require("./middleware/auth");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { createDysgraphiaController } = require("./modules/dysgraphia/controller");
const { createPredictor } = require("./modules/dysgraphia/predictor");
const { createFirestoreDysgraphiaRepository } = require("./modules/dysgraphia/repository");
const { createDysgraphiaRoutes, createUploadMiddleware, assertFilePresent } = require("./modules/dysgraphia/routes");
const { createDysgraphiaService } = require("./modules/dysgraphia/service");
const { createModelHealthChecker } = require("./services/modelHealthService");
const { AppError } = require("./utils/appError");

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

function classifyProtectedRouteInitializationError(error) {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("service account") || message.includes("firebase project id")) {
    return "firebase_credentials_missing_or_invalid";
  }

  if (message.includes("@google-cloud/firestore")) {
    return "firestore_dependency_missing";
  }

  return "unknown";
}

function sanitizeInitializationDiagnostic(value) {
  return String(value || "")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s)]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(private[_-]?key|authorization|token)\s*[=:]\s*[^\s,}]+/gi, "$1=[REDACTED]");
}

function initializeProtectedRouteStep(step, operation) {
  try {
    return operation();
  } catch (error) {
    error.dysgraphiaInitializationStep = step;
    throw error;
  }
}

function createApp(overrides = {}) {
  const logger = createLogger(overrides.logger, overrides.logDestination);
  const modelHealthChecker =
    overrides.modelHealthChecker || createModelHealthChecker({ logger });
  const app = express();
  let protectedRoutes;

  // Firebase credentials are only needed by authenticated API requests. Do
  // not initialize Firebase while the module is imported: Vercel must be able
  // to construct the Express app and answer CORS preflight requests first.
  const getProtectedRoutes = () => {
    if (protectedRoutes) {
      return protectedRoutes;
    }

    try {
      const needsFirebaseAdmin =
        !overrides.firebaseAdmin &&
        ((!overrides.repository && !overrides.firestore) || (!overrides.authMiddleware && !overrides.authClient));
      const firebaseAdmin = needsFirebaseAdmin
        ? initializeProtectedRouteStep("firebase_admin", () =>
          require("./config/firebaseAdmin").getFirebaseAdminServices()
        )
        : overrides.firebaseAdmin;
      const repository =
        overrides.repository ||
        initializeProtectedRouteStep("firestore_repository", () =>
          createFirestoreDysgraphiaRepository({
            firestore: overrides.firestore || firebaseAdmin?.firestore,
            logger,
          })
        );
      const predictor = overrides.predictor || initializeProtectedRouteStep(
        "predictor",
        () => createPredictor({ logger })
      );
      const service =
        overrides.service ||
        initializeProtectedRouteStep("service", () =>
          createDysgraphiaService({
            repository,
            predictor,
            logger,
            now: overrides.now,
          })
        );
      const authMiddleware =
        overrides.authMiddleware ||
        initializeProtectedRouteStep("auth_middleware", () =>
          createAuthMiddleware({
            authClient: overrides.authClient || firebaseAdmin?.auth,
            repository,
            logger,
          })
        );
      const controller = overrides.controller || initializeProtectedRouteStep(
        "controller",
        () => createDysgraphiaController({ service })
      );
      const aliases = express.Router();
      const aliasUpload = initializeProtectedRouteStep("routes", () => createUploadMiddleware());

      aliases.post(
        "/attempts/letter",
        authMiddleware,
        aliasUpload.single("image"),
        assertFilePresent,
        controller.submitLetterAttempt
      );

      protectedRoutes = {
        dysgraphia: initializeProtectedRouteStep("routes", () =>
          createDysgraphiaRoutes({ controller, authMiddleware })
        ),
        aliases,
      };
      return protectedRoutes;
    } catch (error) {
      logger?.error?.(
        {
          event: "dysgraphia_protected_route_initialization_failed",
          errorType: error?.name || "Error",
          failureCategory: classifyProtectedRouteInitializationError(error),
          initializationStep: error?.dysgraphiaInitializationStep || "unknown",
          errorMessage: sanitizeInitializationDiagnostic(error?.message),
          errorStack: sanitizeInitializationDiagnostic(error?.stack),
        },
        "Dysgraphia protected route initialization failed"
      );
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Dysgraphia service is unavailable.");
    }
  };

  const useProtectedRoute = (name) => (req, res, next) => {
    try {
      getProtectedRoutes()[name](req, res, next);
    } catch (error) {
      next(error);
    }
  };

  app.disable("x-powered-by");

  app.use(cors({
    origin: env.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
    maxAge: 86400,
  }));

  app.use((req, res, next) => {
    logger.info({ method: req.method, url: req.originalUrl }, `[INCOMING] ${req.method} ${req.originalUrl}`);
    next();
  });

  app.use(pinoHttp({ logger, autoLogging: env.nodeEnv !== "test" }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));

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

  app.use("/api/dysgraphia", useProtectedRoute("dysgraphia"));
  app.use(useProtectedRoute("aliases"));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

const app = createApp();

// Vercel detects this CommonJS default export. The local server imports the
// createApp property and is still responsible for starting its HTTP listener.
module.exports = app;
module.exports.createApp = createApp;
