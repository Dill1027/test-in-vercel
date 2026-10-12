import mongoose from 'mongoose';

import { env, isProduction } from './env.js';

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

export const disconnectDatabase = async () => {
  await mongoose.disconnect();
};
