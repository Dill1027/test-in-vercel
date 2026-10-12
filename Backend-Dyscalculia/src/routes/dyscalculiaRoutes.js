import { Router } from 'express';

import {
  completeSession,
  getCatalog,
  getGameByKey,
  getOverview,
  getProgress,
  getSessionById,
  listSessions,
  recordAttempt,
  startSession,
} from '../controllers/dyscalculiaController.js';

import {
  saveAssessment,
  getAssessment,
  resetAssessment,
  getUnlockedSections,
} from '../controllers/assessmentController.js';

import {
  getUserDashboard,
  getAllUsersDashboard,
} from '../controllers/dashboardController.js';

export const dyscalculiaRouter = Router();

// ── Module overview ───────────────────────────────────────────────────────────
dyscalculiaRouter.get('/overview', getOverview);
dyscalculiaRouter.get('/catalog', getCatalog);
dyscalculiaRouter.get('/games/:gameKey', getGameByKey);

// ── Pre-assessment ────────────────────────────────────────────────────────────
dyscalculiaRouter.post('/assessment',                          saveAssessment);
dyscalculiaRouter.get('/assessment/:userId',                   getAssessment);
dyscalculiaRouter.delete('/assessment/:userId',                resetAssessment);
dyscalculiaRouter.get('/assessment/:userId/unlocked-sections', getUnlockedSections);

// ── Game sessions ─────────────────────────────────────────────────────────────
dyscalculiaRouter.post('/sessions',                       startSession);
dyscalculiaRouter.get('/sessions',                        listSessions);
dyscalculiaRouter.get('/sessions/:sessionId',             getSessionById);
dyscalculiaRouter.post('/sessions/:sessionId/attempts',   recordAttempt);
dyscalculiaRouter.post('/sessions/:sessionId/complete',   completeSession);

// ── User progress ─────────────────────────────────────────────────────────────
dyscalculiaRouter.get('/progress/:userId', getProgress);

// ── Dashboard ─────────────────────────────────────────────────────────────────
dyscalculiaRouter.get('/dashboard',           getAllUsersDashboard);
dyscalculiaRouter.get('/dashboard/:userId',   getUserDashboard);
