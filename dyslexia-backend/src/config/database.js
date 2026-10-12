import mongoose from 'mongoose';

import { env } from './env.js';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const connectDatabase = async ({ maxAttempts = 6 } = {}) => {
  if (!env.mongodbUri) {
    return null;
  }

  mongoose.set('strictQuery', true);

  const options = {};

  if (env.mongodbDbName) {
    options.dbName = env.mongodbDbName;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(env.mongodbUri, {
        ...options,
        serverSelectionTimeoutMS: 10000,
      });
      return mongoose.connection;
    } catch (error) {
      if (attempt === maxAttempts) throw error;

      const delayMs = Math.min(1000 * (2 ** (attempt - 1)), 10000);
      console.warn(
        `MongoDB connection attempt ${attempt}/${maxAttempts} failed (${error.code || error.message}). Retrying in ${delayMs / 1000}s...`
      );
      await wait(delayMs);
    }
  }

  return null;
};

export const disconnectDatabase = async () => {
  await mongoose.disconnect();
};
