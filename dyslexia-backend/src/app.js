import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { env, isProduction } from './config/env.js';
import { dyslexiaRouter } from './routes/dyslexiaRoutes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import mongoose from 'mongoose';
import { PreAssessment } from './models/PreAssessment.js';
import { UserProgress } from './models/UserProgress.js';
import { DyslexiaSession } from './models/DyslexiaSession.js';
import { GameAttempt } from './models/GameAttempt.js';

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

  app.get('/health', (req, res) => {
    res.json({ success: true, message: 'Dyslexia backend is healthy' });
  });

  app.get('/health/db', async (req, res) => {
    const connectionStateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    const counts = {};

    if (mongoose.connection.readyState === 1) {
      const [preAssessments, progress, sessions, attempts] = await Promise.all([
        PreAssessment.countDocuments(),
        UserProgress.countDocuments(),
        DyslexiaSession.countDocuments(),
        GameAttempt.countDocuments(),
      ]);

      counts.preAssessments = preAssessments;
      counts.userProgress = progress;
      counts.sessions = sessions;
      counts.attempts = attempts;
    }

    res.json({
      success: true,
      database: {
        state: connectionStateMap[mongoose.connection.readyState] || 'unknown',
        readyState: mongoose.connection.readyState,
        name: mongoose.connection.name || null,
        host: mongoose.connection.host || null,
        counts,
      },
    });
  });

  // Older frontend configurations point directly at http://localhost:5001
  // and therefore omit the canonical /api/dyslexia prefix. Normalize those
  // requests before routing so both URL formats reach the same handlers.
  app.use((req, res, next) => {
    if (/^\/(assessment|dashboard)(\/|$)/.test(req.url)) {
      req.url = `/api/dyslexia${req.url}`;
    }
    next();
  });

  app.use('/api/dyslexia', rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.use('/api/dyslexia', dyslexiaRouter);

  app.get('/', (req, res) => {
    res.json({
      success: true,
      service: 'dyslexia-backend',
      version: '1.0.0',
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export const app = createApp();
