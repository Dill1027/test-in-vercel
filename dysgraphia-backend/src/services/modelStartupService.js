function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForModelReady(options) {
  const {
    healthChecker,
    processHandle,
    timeoutMs,
    pollIntervalMs,
    sleep = delay,
    now = Date.now,
  } = options;
  const startedAt = now();
  let lastDetail = "Python predictor is not ready.";

  while (now() - startedAt < timeoutMs) {
    if (processHandle?.startupError) {
      throw new Error(`Python predictor failed to start: ${processHandle.startupError.message}`);
    }

    if (processHandle && processHandle.exitCode !== null) {
      throw new Error(`Python predictor exited before becoming ready (code ${processHandle.exitCode}).`);
    }

    const result = await healthChecker.check();
    const spawnedServerIsListening =
      !processHandle || processHandle.modelServerListening !== false;

    if (result.status === "ready" && spawnedServerIsListening) {
      return result;
    }

    lastDetail = spawnedServerIsListening
      ? result.detail || lastDetail
      : "Waiting for the spawned Python process to bind its model port.";
    const elapsedMs = now() - startedAt;
    const remainingMs = timeoutMs - elapsedMs;

    if (remainingMs > 0) {
      await sleep(Math.min(pollIntervalMs, remainingMs));
    }
  }

  throw new Error(`Python predictor was not ready within ${timeoutMs}ms. ${lastDetail}`);
}

module.exports = {
  waitForModelReady,
};
