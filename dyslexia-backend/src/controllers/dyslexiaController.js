import mongoose from 'mongoose';

import { dyslexiaOverview } from '../config/overviewData.js';
import { DyslexiaSession } from '../models/DyslexiaSession.js';
import { GameAttempt } from '../models/GameAttempt.js';
import { UserProgress } from '../models/UserProgress.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const resolveUserId = (req) => {
  const userId = req.body?.userId || req.query?.userId || req.headers['x-user-id'];

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new HttpError(400, 'userId is required');
  }

  return userId.trim();
};

const toNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return ['true', '1', 'yes'].includes(value.toLowerCase());
  }

  return Boolean(value);
};

const findGameByKey = (gameKey) => {
  for (const section of dyslexiaOverview.sections) {
    const game = section.games.find((item) => item.key === gameKey);

    if (game) {
      return { section, game };
    }
  }

  return null;
};

const buildSessionSummary = async (session) => {
  const attemptsCount = await GameAttempt.countDocuments({ sessionId: session._id });

  return {
    id: session._id,
    userId: session.userId,
    moduleId: session.moduleId,
    sectionId: session.sectionId,
    gameKey: session.gameKey,
    level: session.level,
    status: session.status,
    score: session.score,
    totalQuestions: session.totalQuestions,
    correctAnswers: session.correctAnswers,
    wrongAnswers: session.wrongAnswers,
    attemptsCount: session.attemptsCount || attemptsCount,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    durationSeconds: session.durationSeconds,
    lastAttemptAt: session.lastAttemptAt,
    metadata: session.metadata,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
};

const updateProgressFromSession = async ({ session }) => {
  const lookup = session.gameKey ? findGameByKey(session.gameKey) : null;
  const sectionId = session.sectionId ?? lookup?.section?.id ?? null;
  const sectionTitle = lookup?.section?.title ?? '';

  const progress = await UserProgress.findOneAndUpdate(
    { userId: session.userId, moduleId: session.moduleId },
    {
      $setOnInsert: {
        userId: session.userId,
        moduleId: session.moduleId,
      },
    },
    { new: true, upsert: true }
  );

  progress.totalSessions += 1;

  if (session.status === 'completed') {
    progress.completedSessions += 1;
  }

  progress.bestScore = Math.max(progress.bestScore || 0, session.score || 0);
  progress.totalScore = (progress.totalScore || 0) + (session.score || 0);
  progress.averageScore = progress.completedSessions > 0
    ? Number((progress.totalScore / progress.completedSessions).toFixed(2))
    : 0;
  progress.lastPlayedAt = session.completedAt || new Date();
  progress.lastSessionId = session._id;
  progress.currentSectionId = sectionId;
  progress.currentGameKey = session.gameKey;

  if (sectionId !== null) {
    const existingSection = progress.sections.find((item) => item.sectionId === sectionId);

    if (existingSection) {
      existingSection.sessionsPlayed += 1;
      if (session.status === 'completed') {
        existingSection.completedSessions += 1;
      }
      existingSection.bestScore = Math.max(existingSection.bestScore || 0, session.score || 0);
      existingSection.lastScore = session.score || 0;
      existingSection.lastPlayedAt = session.completedAt || new Date();
      if (sectionTitle) {
        existingSection.sectionTitle = sectionTitle;
      }
    } else {
      progress.sections.push({
        sectionId,
        sectionTitle,
        sessionsPlayed: 1,
        completedSessions: session.status === 'completed' ? 1 : 0,
        bestScore: session.score || 0,
        lastScore: session.score || 0,
        lastPlayedAt: session.completedAt || new Date(),
      });
    }
  }

  progress.recentSessions.unshift({
    sessionId: session._id,
    gameKey: session.gameKey,
    score: session.score || 0,
    totalQuestions: session.totalQuestions || 0,
    status: session.status,
    playedAt: session.completedAt || new Date(),
  });

  progress.recentSessions = progress.recentSessions.slice(0, 10);

  await progress.save();
  return progress;
};

export const getOverview = asyncHandler((req, res) => {
  res.json({
    success: true,
    data: dyslexiaOverview,
  });
});

export const getCatalog = asyncHandler((req, res) => {
  res.json({
    success: true,
    data: dyslexiaOverview,
  });
});

export const getGameByKey = asyncHandler((req, res) => {
  const { gameKey } = req.params;
  const lookup = findGameByKey(gameKey);

  if (!lookup) {
    throw new HttpError(404, `Unknown game key: ${gameKey}`);
  }

  res.json({
    success: true,
    data: {
      section: lookup.section,
      game: lookup.game,
    },
  });
});

export const startSession = asyncHandler(async (req, res) => {
  const userId = resolveUserId(req);
  const { gameKey, metadata = {} } = req.body;
  const lookup = findGameByKey(gameKey);

  if (!lookup) {
    throw new HttpError(400, 'A valid gameKey is required');
  }

  const session = await DyslexiaSession.create({
    userId,
    moduleId: 'dyslexia',
    sectionId: toNumber(req.body.sectionId, lookup.section.id),
    gameKey: lookup.game.key,
    level: toNumber(req.body.level, 1),
    totalQuestions: toNumber(req.body.totalQuestions, 0),
    metadata,
  });

  res.status(201).json({
    success: true,
    data: await buildSessionSummary(session),
  });
});

export const listSessions = asyncHandler(async (req, res) => {
  const userId = resolveUserId(req);
  const status = req.query.status;
  const limit = Math.min(Math.max(toNumber(req.query.limit, 20), 1), 100);

  const filter = {
    userId,
    moduleId: 'dyslexia',
  };

  if (status) {
    filter.status = status;
  }

  const sessions = await DyslexiaSession.find(filter)
    .sort({ startedAt: -1 })
    .limit(limit)
    .lean();

  res.json({
    success: true,
    data: sessions,
  });
});

export const getSessionById = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  if (!mongoose.isValidObjectId(sessionId)) {
    throw new HttpError(400, 'Invalid sessionId');
  }

  const session = await DyslexiaSession.findById(sessionId);

  if (!session) {
    throw new HttpError(404, 'Session not found');
  }

  const attempts = await GameAttempt.find({ sessionId: session._id }).sort({ createdAt: 1 }).lean();

  res.json({
    success: true,
    data: {
      session: await buildSessionSummary(session),
      attempts,
    },
  });
});

export const recordAttempt = asyncHandler(async (req, res) => {
  const userId = resolveUserId(req);
  const { sessionId } = req.params;

  if (!mongoose.isValidObjectId(sessionId)) {
    throw new HttpError(400, 'Invalid sessionId');
  }

  const session = await DyslexiaSession.findById(sessionId);

  if (!session) {
    throw new HttpError(404, 'Session not found');
  }

  if (session.userId !== userId) {
    throw new HttpError(403, 'Session does not belong to this user');
  }

  if (session.status !== 'active') {
    throw new HttpError(409, 'Cannot add attempts to a closed session');
  }

  const attemptNumber = session.attemptsCount + 1;
  const isCorrect = toBoolean(req.body.isCorrect);

  const attempt = await GameAttempt.create({
    sessionId: session._id,
    userId,
    moduleId: session.moduleId,
    sectionId: session.sectionId,
    gameKey: session.gameKey,
    questionId: req.body.questionId || '',
    prompt: req.body.prompt || '',
    expectedAnswer: req.body.expectedAnswer || '',
    userAnswer: req.body.userAnswer || '',
    isCorrect,
    attemptNumber,
    responseTimeMs: toNumber(req.body.responseTimeMs, null),
    metadata: req.body.metadata || {},
  });

  session.attemptsCount = attemptNumber;
  session.lastAttemptAt = attempt.createdAt;
  session.correctAnswers += isCorrect ? 1 : 0;
  session.wrongAnswers += isCorrect ? 0 : 1;

  if (req.body.totalQuestions !== undefined) {
    session.totalQuestions = toNumber(req.body.totalQuestions, session.totalQuestions);
  }

  if (req.body.score !== undefined) {
    session.score = toNumber(req.body.score, session.score);
  }

  await session.save();

  res.status(201).json({
    success: true,
    data: {
      attempt,
      session: await buildSessionSummary(session),
    },
  });
});

export const completeSession = asyncHandler(async (req, res) => {
  const userId = resolveUserId(req);
  const { sessionId } = req.params;

  if (!mongoose.isValidObjectId(sessionId)) {
    throw new HttpError(400, 'Invalid sessionId');
  }

  const session = await DyslexiaSession.findById(sessionId);

  if (!session) {
    throw new HttpError(404, 'Session not found');
  }

  if (session.userId !== userId) {
    throw new HttpError(403, 'Session does not belong to this user');
  }

  if (session.completedAt && session.status === 'completed') {
    const progress = await UserProgress.findOne({ userId, moduleId: 'dyslexia' }).lean();

    res.json({
      success: true,
      data: {
        session: await buildSessionSummary(session),
        progress: progress || null,
      },
    });

    return;
  }

  const now = new Date();
  const startedAt = session.startedAt instanceof Date ? session.startedAt : new Date(session.startedAt);
  const durationSeconds = toNumber(
    req.body.durationSeconds,
    startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0
  );

  session.status = req.body.status || 'completed';
  session.score = toNumber(req.body.score, session.score);
  session.totalQuestions = toNumber(req.body.totalQuestions, session.totalQuestions);
  session.correctAnswers = toNumber(req.body.correctAnswers, session.correctAnswers);
  session.wrongAnswers = toNumber(req.body.wrongAnswers, session.wrongAnswers);
  session.durationSeconds = durationSeconds;
  session.completedAt = now;
  session.metadata = {
    ...(session.metadata || {}),
    ...(req.body.metadata || {}),
  };

  await session.save();
  const progress = await updateProgressFromSession({ session });

  res.json({
    success: true,
    data: {
      session: await buildSessionSummary(session),
      progress,
    },
  });
});

export const getProgress = asyncHandler(async (req, res) => {
  const userId = req.params.userId || resolveUserId(req);

  const progress = await UserProgress.findOne({ userId, moduleId: 'dyslexia' }).lean();
  const recentSessions = await DyslexiaSession.find({ userId, moduleId: 'dyslexia' })
    .sort({ startedAt: -1 })
    .limit(10)
    .lean();

  res.json({
    success: true,
    data: {
      progress: progress || {
        userId,
        moduleId: 'dyslexia',
        totalSessions: 0,
        completedSessions: 0,
        bestScore: 0,
        averageScore: 0,
        totalScore: 0,
        lastPlayedAt: null,
        currentSectionId: null,
        currentGameKey: '',
        sections: [],
        recentSessions: [],
      },
      recentSessions,
    },
  });
});
