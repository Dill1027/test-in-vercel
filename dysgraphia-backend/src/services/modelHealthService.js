const axios = require("axios");
const env = require("../config/env");

function deriveHealthUrl(predictorUrl) {
  if (!predictorUrl) {
    return "";
  }

  try {
    const url = new URL(predictorUrl);
    url.pathname = url.pathname.replace(/\/predict\/?$/, "/health");
    return url.toString();
  } catch {
    return "";
  }
}

function createModelHealthChecker(options = {}) {
  const provider = options.provider || env.predictorProvider;
  const healthUrl =
    options.healthUrl || env.predictorHealthUrl || deriveHealthUrl(env.predictorUrl);
  const timeoutMs = options.timeoutMs || env.predictorHealthTimeoutMs;
  const httpClient = options.httpClient || axios;
  const logger = options.logger;

  async function check() {
    if (provider !== "python") {
      return {
        status: "ready",
        provider,
        detail: "External Python predictor is not enabled.",
      };
    }

    if (!healthUrl) {
      return {
        status: "unavailable",
        provider,
        detail: "Python predictor health URL is not configured.",
      };
    }

    try {
      const response = await httpClient.get(healthUrl, { timeout: timeoutMs });
      const ready = response.status === 200 && response.data?.success === true;

      return {
        status: ready ? "ready" : "unavailable",
        provider,
        detail: ready
          ? "Python predictor is ready."
          : "Python predictor returned an unexpected health response.",
      };
    } catch (error) {
      logger?.warn(
        { error: error.message, predictorHealthUrl: healthUrl },
        "Python predictor health check failed"
      );

      return {
        status: "unavailable",
        provider,
        detail: "Python predictor did not respond to its health check.",
      };
    }
  }

  return { check };
}

module.exports = {
  createModelHealthChecker,
  deriveHealthUrl,
};
