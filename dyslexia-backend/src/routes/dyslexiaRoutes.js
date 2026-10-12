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
} from '../controllers/dyslexiaController.js';

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

export const dyslexiaRouter = Router();

// ── Module overview ───────────────────────────────────────────────────────────
dyslexiaRouter.get('/overview', getOverview);
dyslexiaRouter.get('/catalog', getCatalog);
dyslexiaRouter.get('/games/:gameKey', getGameByKey);

// ── Pre-assessment ────────────────────────────────────────────────────────────
dyslexiaRouter.post('/assessment',                          saveAssessment);
dyslexiaRouter.get('/assessment/:userId',                   getAssessment);
dyslexiaRouter.delete('/assessment/:userId',                resetAssessment);
dyslexiaRouter.get('/assessment/:userId/unlocked-sections', getUnlockedSections);

// ── Game sessions ─────────────────────────────────────────────────────────────
dyslexiaRouter.post('/sessions',                       startSession);
dyslexiaRouter.get('/sessions',                        listSessions);
dyslexiaRouter.get('/sessions/:sessionId',             getSessionById);
dyslexiaRouter.post('/sessions/:sessionId/attempts',   recordAttempt);
dyslexiaRouter.post('/sessions/:sessionId/complete',   completeSession);

// ── User progress ─────────────────────────────────────────────────────────────
dyslexiaRouter.get('/progress/:userId', getProgress);

// ── Dashboard ─────────────────────────────────────────────────────────────────
dyslexiaRouter.get('/dashboard',           getAllUsersDashboard);
dyslexiaRouter.get('/dashboard/:userId',   getUserDashboard);
