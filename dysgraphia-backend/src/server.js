const path = require("path");
const { spawn } = require("child_process");

const env = require("./config/env");
const { createApp } = require("./app");
const { createModelHealthChecker } = require("./services/modelHealthService");
const { waitForModelReady } = require("./services/modelStartupService");

// START PYTHON MODEL SERVER
const modelAppPath = path.join(
  __dirname,
  "models",
  "app.py"
);

const configuredPython = process.env.PYTHON_EXECUTABLE;
const pythonCommand = configuredPython
  ? path.isAbsolute(configuredPython)
    ? configuredPython
    : path.resolve(__dirname, "..", configuredPython)
  : process.platform === "win32"
    ? path.resolve(__dirname, "..", "..", "..", "venv", "Scripts", "python.exe")
    : "python3";

function startPythonModel() {
  console.log("Starting Sinhala handwriting model...");

  const pythonProcess = spawn(
    pythonCommand,
    ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8001"],
    {
      cwd: path.dirname(modelAppPath),
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  pythonProcess.startupError = null;
  pythonProcess.modelServerListening = false;
  pythonProcess.stdout.on("data", (data) => {
    console.log(`[PYTHON MODEL] ${data.toString().trim()}`);
  });
  pythonProcess.stderr.on("data", (data) => {
    const output = data.toString();
    if (output.includes("Uvicorn running on")) {
      pythonProcess.modelServerListening = true;
    }
    console.error(`[PYTHON MODEL] ${output.trim()}`);
  });
  pythonProcess.on("error", (error) => {
    pythonProcess.startupError = error;
    console.error("Failed to start Python model:", error.message);
  });
  pythonProcess.on("close", (code) => {
    console.log(`Python model process stopped with code ${code}`);
  });

  return pythonProcess;
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(env.port, env.host, () => resolve(server));
    server.once("error", reject);
  });
}

async function start() {
  let pythonProcess = null;
  let server = null;
  let shuttingDown = false;

  try {
    if (env.predictorProvider === "python") {
      pythonProcess = startPythonModel();
      pythonProcess.once("close", (code) => {
        if (server && !shuttingDown) {
          console.error(`Python predictor stopped unexpectedly with code ${code}.`);
          server.close(() => process.exit(1));
        }
      });
      console.log("Waiting for the Sinhala handwriting model to become ready...");

      await waitForModelReady({
        healthChecker: createModelHealthChecker(),
        processHandle: pythonProcess,
        timeoutMs: env.modelStartupTimeoutMs,
        pollIntervalMs: env.modelStartupPollIntervalMs,
      });

      console.log("Sinhala handwriting model is ready.");
    } else {
      console.log(`Skipping Python model startup for predictor provider: ${env.predictorProvider}`);
    }

    const app = createApp();
    server = await listen(app);
    console.log(`Dysgraphia backend listening on http://${env.host}:${env.port}`);

    const shutdown = () => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      console.log("Shutting down...");

      if (pythonProcess && pythonProcess.exitCode === null) {
        pythonProcess.kill();
      }

      server.close(() => process.exit(0));
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    return { app, server, pythonProcess };
  } catch (error) {
    if (pythonProcess && pythonProcess.exitCode === null) {
      pythonProcess.kill();
    }

    throw error;
  }
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Dysgraphia backend failed to start:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  start,
  startPythonModel,
};
