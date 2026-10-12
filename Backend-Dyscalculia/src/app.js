import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import { env, isProduction } from './config/env.js';
import { dyscalculiaRouter } from './routes/dyscalculiaRoutes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const proxyToModel = async (req, res, next) => {
  try {
    const modelResponse = await fetch(`${env.mlServiceUrl}${req.path}`, {
      method: req.method,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30_000),
    });

    const responseBody = await modelResponse.text();
    const contentType = modelResponse.headers.get('content-type');

    if (contentType) res.type(contentType);
    res.status(modelResponse.status).send(responseBody);
  } catch (error) {
    error.statusCode = 502;
    error.message = `ML model service is unavailable: ${error.message}`;
    next(error);
  }
};

const requireDatabase = (req, res, next) => {
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
