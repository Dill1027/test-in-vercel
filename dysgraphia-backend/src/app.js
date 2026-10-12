
const express = require("express");
const cors = require("cors");
const pino = require("pino");
const pinoHttp = require("pino-http");

const env = require("./config/env");

const { createAuthMiddleware } = require("./middleware/auth");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const {
  createDysgraphiaController,
} = require("./modules/dysgraphia/controller");

const {
  createPredictor,
} = require("./modules/dysgraphia/predictor");

const {
  createFirestoreDysgraphiaRepository,
} = require("./modules/dysgraphia/repository");

const {
  createDysgraphiaRoutes,
  createUploadMiddleware,
  assertFilePresent,
} = require("./modules/dysgraphia/routes");

const {
  createDysgraphiaService,
} = require("./modules/dysgraphia/service");

const {
  createModelHealthChecker,
} = require("./services/modelHealthService");

const { AppError } = require("./utils/appError");

// ============================================
// LOGGER
// ============================================

function createLogger(loggerInstance, destination) {
  if (loggerInstance) {
    return loggerInstance;
  }

  return pino(
    {
      level: env.logLevel || "info",
      base: undefined,

      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-vercel-oidc-token']",
          "req.headers['x-vercel-proxy-signature']",
          "req.headers['x-vercel-proxy-signature-ts']",
          "req.headers.forwarded",
          "headers.authorization",
          "headers.cookie",
          "headers['x-vercel-oidc-token']",
          "headers['x-vercel-proxy-signature']",
          "request.headers.authorization",
          "request.headers.cookie",
          "request.headers['x-vercel-oidc-token']",
          "request.headers['x-vercel-proxy-signature']",
        ],
        censor: "[REDACTED]",
      },
    },
    destination
  );
}

// ============================================
// SAFE ERROR CLASSIFICATION
// ============================================

function classifyInitializationError(error) {
  const message = String(error?.message || "").toLowerCase();

  if (
    message.includes("service account") ||
    message.includes("firebase project id") ||
    message.includes("credential") ||
    message.includes("private key")
  ) {
    return "firebase_credentials_error";
  }

  if (
    message.includes("firestore") ||
    message.includes("@google-cloud/firestore")
  ) {
    return "firestore_initialization_error";
  }

  if (
    message.includes("predictor") ||
    message.includes("model") ||
    message.includes("onnx")
  ) {
    return "model_initialization_error";
  }

  if (
    message.includes("not a function") ||
    message.includes("undefined") ||
    message.includes("cannot read properties")
  ) {
    return "javascript_type_error";
  }

  return "unknown";
}

// ============================================
// SAFE INITIALIZATION DIAGNOSTICS
// ============================================

function safeErrorDetail(error) {
  const message = String(error?.message || "");

  // Avoid exposing arbitrary exception content.
  // The complete error remains available locally
  // when investigated with a debugger.

  if (error instanceof TypeError) {
    if (
      /^(?:\w+(?:\.\w+)* is not a function|Cannot read properties of (?:undefined|null) \(reading '[\w]+'\)|Cannot destructure property '[\w]+' of .* as it is (?:undefined|null))$/.test(
        message
      )
    ) {
      return message.slice(0, 250);
    }

    return "TypeError during backend initialization";
  }

  return "Initialization failed; inspect the recorded step and category";
}

function initializeStep(step, operation) {
  try {
    return operation();
  } catch (error) {
    if (error && typeof error === "object") {
      error.dysgraphiaInitializationStep = step;
    }

    throw error;
  }
}

// ============================================
// CREATE EXPRESS APP
// ============================================

function createApp(overrides = {}) {
  const logger = createLogger(
    overrides.logger,
    overrides.logDestination
  );

  const app = express();

  let protectedRoutes = null;

  const modelHealthChecker =
    overrides.modelHealthChecker ||
    createModelHealthChecker({ logger });

  // ============================================
  // LAZY PROTECTED ROUTE INITIALIZATION
  // ============================================

  function getProtectedRoutes() {
    if (protectedRoutes) {
      return protectedRoutes;
    }

    let currentStep = "start";

    try {
      // ----------------------------------------
      // 1. FIREBASE ADMIN
      // ----------------------------------------

      currentStep = "firebase_admin";

      const needsFirebaseAdmin =
        !overrides.firebaseAdmin &&
        (
          (!overrides.repository && !overrides.firestore) ||
          (!overrides.authMiddleware && !overrides.authClient)
        );

      const firebaseAdmin = needsFirebaseAdmin
        ? initializeStep("firebase_admin", () =>
            require("./config/firebaseAdmin")
              .getFirebaseAdminServices()
          )
        : overrides.firebaseAdmin;

      // ----------------------------------------
      // 2. FIRESTORE REPOSITORY
      // ----------------------------------------

      currentStep = "firestore_repository";

      const repository =
        overrides.repository ||
        initializeStep("firestore_repository", () =>
          createFirestoreDysgraphiaRepository({
            firestore:
              overrides.firestore ||
              firebaseAdmin?.firestore,
            logger,
          })
        );

      // ----------------------------------------
      // 3. PREDICTOR
      // ----------------------------------------

      currentStep = "predictor";

      const predictor =
        overrides.predictor ||
        initializeStep("predictor", () =>
          createPredictor({ logger })
        );

      // ----------------------------------------
      // 4. DYSGRAPHIA SERVICE
      // ----------------------------------------

      currentStep = "service";

      const service =
        overrides.service ||
        initializeStep("service", () =>
          createDysgraphiaService({
            repository,
            predictor,
            logger,
            now: overrides.now,
          })
        );

      // ----------------------------------------
      // 5. AUTH MIDDLEWARE
      // ----------------------------------------

      currentStep = "auth_middleware";

      const authMiddleware =
        overrides.authMiddleware ||
        initializeStep("auth_middleware", () =>
          createAuthMiddleware({
            authClient:
              overrides.authClient ||
              firebaseAdmin?.auth,
            repository,
            logger,
          })
        );

      // ----------------------------------------
      // 6. CONTROLLER
      // ----------------------------------------

      currentStep = "controller";

      const controller =
        overrides.controller ||
        initializeStep("controller", () =>
          createDysgraphiaController({
            service,
          })
        );

      // ----------------------------------------
      // 7. ROUTES
      // ----------------------------------------

      currentStep = "routes";

      const aliases = express.Router();

      const aliasUpload = initializeStep(
        "routes",
        () => createUploadMiddleware()
      );

      aliases.post(
        "/attempts/letter",
        authMiddleware,
        aliasUpload.single("image"),
        assertFilePresent,
        controller.submitLetterAttempt
      );

      protectedRoutes = {
        dysgraphia: initializeStep("routes", () =>
          createDysgraphiaRoutes({
            controller,
            authMiddleware,
          })
        ),
        aliases,
      };

      logger.info(
        {
          event: "dysgraphia_routes_initialized",
          status: "success",
        },
        "Dysgraphia protected routes initialized"
      );

      return protectedRoutes;

    } catch (error) {
      logger.error(
        {
          event:
            "dysgraphia_protected_route_initialization_failed",

          initializationStep:
            error?.dysgraphiaInitializationStep ||
            currentStep,

          errorType:
            error?.name || "Error",

          failureCategory:
            classifyInitializationError(error),

          errorDetail:
            safeErrorDetail(error),
        },
        "Dysgraphia protected route initialization failed"
      );

      throw new AppError(
        503,
        "SERVICE_UNAVAILABLE",
        "Dysgraphia service is unavailable."
      );
    }
  }

  // ============================================
  // PROTECTED ROUTE WRAPPER
  // ============================================

  const useProtectedRoute = (name) => {
    return (req, res, next) => {
      try {
        const routes = getProtectedRoutes();
        return routes[name](req, res, next);
      } catch (error) {
        return next(error);
      }
    };
  };

  // ============================================
  // EXPRESS SETTINGS
  // ============================================

  app.disable("x-powered-by");

  // ============================================
  // CORS
  // ============================================

  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,

      methods: [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS",
      ],

      allowedHeaders: [
        "Content-Type",
        "Authorization",
      ],

      exposedHeaders: [
        "Content-Type",
        "Authorization",
      ],

      optionsSuccessStatus: 200,
      maxAge: 86400,
    })
  );

  // ============================================
  // REQUEST LOGGING
  // ============================================

  app.use((req, res, next) => {
    logger.info(
      {
        event: "incoming_request",
        method: req.method,
        path: req.path,
      },
      "Dysgraphia request received"
    );

    next();
  });

  app.use(
    pinoHttp({
      logger,
      autoLogging: env.nodeEnv !== "test",
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    })
  );

  // ============================================
  // BODY PARSERS
  // ============================================

  app.use(
    express.json({
      limit: "2mb",
    })
  );

  app.use(
    express.urlencoded({
      limit: "2mb",
      extended: true,
    })
  );

  // ============================================
  // HEALTH CHECK
  // ============================================

  app.get("/health", async (req, res, next) => {
    try {
      const predictor =
        await modelHealthChecker.check();

      const ready =
        predictor.status === "ready";

      res.status(ready ? 200 : 503).json({
        status: ready ? "ok" : "unavailable",
        service: "dysgraphia-backend",
        environment: env.nodeEnv,

        checks: {
          api: {
            status: "ready",
          },
          predictor,
        },
      });

    } catch (error) {
      logger.error(
        {
          event: "dysgraphia_health_check_failed",
          errorType: error?.name || "Error",
        },
        "Dysgraphia health check failed"
      );

      next(error);
    }
  });

  // ============================================
  // DYSGRAPHIA PUBLIC API
  // ============================================

  app.use(
    "/api/dysgraphia",
    useProtectedRoute("dysgraphia")
  );

  // ============================================
  // ALIAS API ROUTES
  // ============================================

  app.use(
    useProtectedRoute("aliases")
  );

  // ============================================
  // ERROR HANDLERS
  // ============================================

  app.use(notFound);

  app.use(errorHandler);

  return app;
}

// ============================================
// VERCEL ENTRYPOINT
// ============================================

const app = createApp();

module.exports = app;

module.exports.createApp = createApp;
