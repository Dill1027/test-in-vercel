import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

dotenv.config({ path: path.join(projectDirectory, '.env') });

const nodePort = process.env.PORT || '4001';
const modelPort = process.env.ML_PORT || '4002';

if (nodePort === modelPort) {
  console.error(
    `PORT and ML_PORT cannot both use ${nodePort}. ` +
      'Set different ports in .env (for example 4001 and 4002).',
  );
  process.exit(1);
}

const localPythonCandidates = [
  path.join(projectDirectory, '.venv', 'bin', 'python'),
  path.join(projectDirectory, 'venv', 'bin', 'python'),
];

const pythonCommand =
  process.env.PYTHON_BIN ||
  localPythonCandidates.find((candidate) => existsSync(candidate)) ||
  'python3.11';

const services = [
  {
    name: 'Node API',
    command: process.execPath,
    args: ['src/server.js'],
  },
  {
    name: 'ML model',
    command: pythonCommand,
    args: ['app.py'],
  },
];

const children = new Set();
let shuttingDown = false;

function stopAll(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const service of services) {
  const child = spawn(service.command, service.args, {
    cwd: projectDirectory,
    env: {
      ...process.env,
      PORT: nodePort,
      ML_PORT: modelPort,
    },
    stdio: 'inherit',
  });

  children.add(child);

  child.on('error', (error) => {
    console.error(`[${service.name}] failed to start: ${error.message}`);
    stopAll();
    process.exitCode = 1;
  });

  child.on('exit', (code, signal) => {
    children.delete(child);

    if (!shuttingDown) {
      const reason = signal ? `signal ${signal}` : `code ${code}`;
      console.error(`[${service.name}] stopped with ${reason}.`);
      stopAll();
      process.exitCode = code || 1;
    }

    if (children.size === 0) process.exit();
  });
}

console.log(`Starting Node API on port ${nodePort}.`);
console.log(`Starting ML model on port ${modelPort} with ${pythonCommand}.`);

process.on('SIGINT', () => stopAll('SIGINT'));
process.on('SIGTERM', () => stopAll('SIGTERM'));
