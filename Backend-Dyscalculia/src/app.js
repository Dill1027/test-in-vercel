import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import { env, isProduction } from './config/env.js';
import { ensureDatabaseConnection } from './config/database.js';
import { dyscalculiaRouter } from './routes/dyscalculiaRoutes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const proxyToModel = async (req, res, next) => {
  try {
    // All public aliases use the Flask service's canonical internal route.
    // ML_SERVICE_URL is injected by the Vercel service binding at runtime.
    const modelResponse = await fetch(new URL('/predict', env.mlServiceUrl), {
      method: req.method,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30_000),
    });

    const responseBody = await modelResponse.text();
    const contentType = modelResponse.headers.get('content-type');

    if (!modelResponse.ok) {
      console.error(
        `Dyscalculia model request failed: ${req.method} ${req.path} returned ${modelResponse.status}`,
      );
    }

    if (contentType) res.type(contentType);
    res.status(modelResponse.status).send(responseBody);
  } catch (error) {
    console.error(`Dyscalculia model connection failed for ${req.method} ${req.path}: ${error.message}`);
    error.statusCode = 502;
    error.message = `ML model service is unavailable: ${error.message}`;
    next(error);
  }
};

const requireDatabase = async (req, res, next) => {
  try {
    await ensureDatabaseConnection();
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
  }

  if (mongoose.connection.readyState === 1) {
    next();
    return;
  }

  res.status(503).json({
    success: false,
    message: 'Database is unavailable. Check MONGODB_URI or Atlas network/DNS settings.',
  });
};

export const createApp = () => {
  const app = express();

  // Vercel is the single immediate reverse-proxy hop. Vercel overwrites
  // X-Forwarded-For, so trusting exactly one hop makes req.ip available to
  // express-rate-limit without accepting an arbitrary client-supplied chain.
  // This must be set before registering the rate limiter below.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({
    origin: env.clientOrigins.length > 0 ? env.clientOrigins : true,
    credentials: true,
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(isProduction ? 'combined' : 'dev'));

  // Expose the separate Flask process through the Node API's public port.
  app.post('/predict', proxyToModel);
  app.post('/api/predict-number', proxyToModel);
  app.post('/api/dyscalculia/tracing/predict', proxyToModel);

  app.get('/health', (req, res) => {
    res.json({
      success: true,
      message: 'Dyscalculia backend is healthy',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'unavailable',
    });
  });

  app.use('/api/dyscalculia', rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.use('/api/dyscalculia', requireDatabase, dyscalculiaRouter);

  app.get('/', (req, res) => {
    res.json({
      success: true,
      service: 'dyscalculia-backend',
      version: '1.0.0',
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export const app = createApp();

// Vercel detects an Express service from this default export. The standalone
// server entry point continues to use the named export above for local use.
export default app;
