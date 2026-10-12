import mongoose from 'mongoose';

import { env, isProduction } from './env.js';

let pendingConnection = null;

export const connectDatabase = async () => {
  mongoose.set('bufferCommands', false);

  if (!env.mongodbUri) {
    const message = 'MONGODB_URI is required';
    if (isProduction || env.requireMongodb) {
      throw new Error(message);
    }

    console.warn(`${message}. Continuing without database in development mode.`);
    return null;
  }

  mongoose.set('strictQuery', true);

  const options = {};

  if (env.mongodbDbName) {
    options.dbName = env.mongodbDbName;
  }

  try {
    await mongoose.connect(env.mongodbUri, options);
    return mongoose.connection;
  } catch (error) {
    if (isProduction || env.requireMongodb) {
      throw error;
    }

    console.warn(
      `MongoDB unavailable (${error.message}). Continuing without database in development mode.`,
    );
    return null;
  }
};

// Vercel imports the Express app directly, bypassing src/server.js where the
// standalone process normally opens MongoDB. Reuse one in-flight connection
// attempt per function instance and let later requests retry after a failure.
export const ensureDatabaseConnection = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!pendingConnection) {
    pendingConnection = connectDatabase().finally(() => {
      pendingConnection = null;
    });
  }

  return pendingConnection;
};

export const disconnectDatabase = async () => {
  await mongoose.disconnect();
};
