const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const resolveEnvPath = (value) => {
  if (!value) {
    return "";
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(__dirname, "..", "..", value);
};

const parseBoolean = (value, fallback = false) => {
  if (value == null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseOrigins = (rawOrigins) => {
  if (!rawOrigins) {
    return ["http://localhost:5173", "http://localhost:3000"];
  }

  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  host: process.env.HOST || "0.0.0.0",
  port: parseNumber(process.env.PORT, 5000),
  logLevel: process.env.LOG_LEVEL || "info",
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  predictorProvider: process.env.PREDICTOR_PROVIDER || process.env.ML_PROVIDER || "mock",
  predictorUrl: process.env.PREDICTOR_URL || process.env.PYTHON_MODEL_URL || "",
  predictorHealthUrl: process.env.PREDICTOR_HEALTH_URL || "",
  predictorHealthTimeoutMs: parseNumber(process.env.PREDICTOR_HEALTH_TIMEOUT_MS, 2000),
  modelStartupTimeoutMs: parseNumber(process.env.MODEL_STARTUP_TIMEOUT_MS, 120000),
  modelStartupPollIntervalMs: parseNumber(process.env.MODEL_STARTUP_POLL_INTERVAL_MS, 500),
  confidenceThreshold: parseNumber(process.env.ML_CONFIDENCE_THRESHOLD, 0.75),
  maxImageSizeMb: parseNumber(process.env.MAX_IMAGE_SIZE_MB, 5),
  allowDevReset:
    process.env.NODE_ENV !== "production" && parseBoolean(process.env.ENABLE_DEV_RESET, false),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : "",
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  firebaseServiceAccountPath: resolveEnvPath(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || ""
  ),
};
