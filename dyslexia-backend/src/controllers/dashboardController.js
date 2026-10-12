import { PreAssessment } from '../models/PreAssessment.js';
import { UserProgress } from '../models/UserProgress.js';
import { DyslexiaSession } from '../models/DyslexiaSession.js';
import { GameAttempt } from '../models/GameAttempt.js';
import { dyslexiaOverview } from '../config/overviewData.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const resolveUserId = (req) => {
  const userId = req.params?.userId || req.query?.userId || req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new HttpError(400, 'userId is required');
  }
  return userId.trim();
};

/** Build a human-readable section title map from overviewData. */
const buildSectionMeta = () => {
  const map = {};
  for (const section of dyslexiaOverview.sections) {
    map[section.id] = {
      title: section.title,
      unlockRule: section.unlockRule,
      gameCount: section.gameCount,
    };
  }
  return map;
};

/** Build a game key → title map from overviewData. */
const buildGameMeta = () => {
  const map = {};
  for (const section of dyslexiaOverview.sections) {
    for (const game of section.games) {
      map[game.key] = { title: game.title, sectionId: game.sectionId, route: game.route };
    }
  }
  return map;
};

const SECTION_META = buildSectionMeta();
const GAME_META    = buildGameMeta();

// ── Per-game aggregation ──────────────────────────────────────────────────────

/**
 * Aggregate per-game stats from completed sessions.
 * Returns a map: gameKey → { title, sectionId, sessionsPlayed, bestScore, avgScore,
 *                             totalCorrect, totalQuestions, accuracy, lastPlayedAt }
 */
const aggregateGameStats = (sessions) => {
  const stats = {};

  for (const session of sessions) {
    if (session.status !== 'completed') continue;
    const key = session.gameKey;

    if (!stats[key]) {
      stats[key] = {
        gameKey:        key,
        title:          GAME_META[key]?.title ?? key,
        sectionId:      session.sectionId ?? GAME_META[key]?.sectionId ?? null,
        route:          GAME_META[key]?.route ?? null,
        sessionsPlayed: 0,
        bestScore:      0,
        totalScoreSum:  0,
        totalCorrect:   0,
        totalQuestions: 0,
        lastPlayedAt:   null,
      };
    }

    const s = stats[key];
    s.sessionsPlayed  += 1;
    s.bestScore        = Math.max(s.bestScore, session.score ?? 0);
    s.totalScoreSum   += session.score ?? 0;
    s.totalCorrect    += session.correctAnswers ?? 0;
    s.totalQuestions  += session.totalQuestions ?? 0;

    const playedAt = session.completedAt || session.startedAt;
    if (!s.lastPlayedAt || (playedAt && playedAt > s.lastPlayedAt)) {
      s.lastPlayedAt = playedAt;
    }
  }

  // Compute derived fields and clean up internal sums
  return Object.values(stats).map((s) => {
    const avgScore   = s.sessionsPlayed > 0 ? +(s.totalScoreSum / s.sessionsPlayed).toFixed(1) : 0;
    const accuracy   = s.totalQuestions > 0
      ? +(s.totalCorrect / s.totalQuestions * 100).toFixed(1)
      : null;

    const { totalScoreSum, ...rest } = s;
    return { ...rest, avgScore, accuracy };
  });
};

// ── Per-section aggregation ───────────────────────────────────────────────────

const aggregateSectionStats = (gameStats) => {
  const map = {};

  for (const game of gameStats) {
    const sid = game.sectionId;
    if (sid === null) continue;

    if (!map[sid]) {
      map[sid] = {
        sectionId:      sid,
        title:          SECTION_META[sid]?.title ?? `Section ${sid}`,
        unlockRule:     SECTION_META[sid]?.unlockRule ?? { type: 'always' },
        totalGames:     SECTION_META[sid]?.gameCount ?? 0,
        gamesPlayed:    0,
        sessionsPlayed: 0,
        bestScore:      0,
        totalScoreSum:  0,
        totalCorrect:   0,
        totalQuestions: 0,
        lastPlayedAt:   null,
      };
    }

    const sec = map[sid];
    sec.gamesPlayed    += 1;
    sec.sessionsPlayed += game.sessionsPlayed;
    sec.bestScore       = Math.max(sec.bestScore, game.bestScore);
    sec.totalScoreSum  += game.avgScore * game.sessionsPlayed;
    sec.totalCorrect   += game.totalCorrect;
    sec.totalQuestions += game.totalQuestions;

    if (!sec.lastPlayedAt || (game.lastPlayedAt && game.lastPlayedAt > sec.lastPlayedAt)) {
      sec.lastPlayedAt = game.lastPlayedAt;
    }
  }

  return Object.values(map)
    .map((sec) => {
      const avgScore = sec.sessionsPlayed > 0 ? +(sec.totalScoreSum / sec.sessionsPlayed).toFixed(1) : 0;
      const accuracy = sec.totalQuestions > 0
        ? +(sec.totalCorrect / sec.totalQuestions * 100).toFixed(1)
        : null;
      const { totalScoreSum, ...rest } = sec;
      return { ...rest, avgScore, accuracy };
    })
    .sort((a, b) => a.sectionId - b.sectionId);
};

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * GET /api/dyslexia/dashboard/:userId
 *
 * Returns full performance dashboard for one child:
 *   - assessment result + unlock status
 *   - overall progress stats
 *   - per-section stats
 *   - per-game stats
 *   - 10 most recent sessions
 *   - accuracy trend (last 20 completed sessions, chronological)
 */
export const getUserDashboard = asyncHandler(async (req, res) => {
  const userId = resolveUserId(req);

  // Parallel fetch of all needed data
  const [assessment, progress, sessions] = await Promise.all([
    PreAssessment.findOne({ userId }).lean(),
    UserProgress.findOne({ userId, moduleId: 'dyslexia' }).lean(),
    DyslexiaSession.find({ userId, moduleId: 'dyslexia' })
      .sort({ startedAt: -1 })
      .limit(200)
      .lean(),
  ]);

  const completedSessions = sessions.filter((s) => s.status === 'completed');

  const gameStats    = aggregateGameStats(sessions);
  const sectionStats = aggregateSectionStats(gameStats);

  // Accuracy trend — last 20 completed sessions oldest→newest
  const trendSessions = completedSessions.slice(0, 20).reverse();
  const accuracyTrend = trendSessions.map((s) => ({
    gameKey:    s.gameKey,
    gameTitle:  GAME_META[s.gameKey]?.title ?? s.gameKey,
    score:      s.score ?? 0,
    accuracy:   s.totalQuestions > 0
      ? +(s.correctAnswers / s.totalQuestions * 100).toFixed(1)
      : null,
    playedAt:   s.completedAt || s.startedAt,
  }));

  // Overall summary
  const overallAccuracy = completedSessions.reduce((acc, s) => acc + (s.totalQuestions ?? 0), 0) > 0
    ? +(
        completedSessions.reduce((acc, s) => acc + (s.correctAnswers ?? 0), 0) /
        completedSessions.reduce((acc, s) => acc + (s.totalQuestions ?? 0), 0) * 100
      ).toFixed(1)
    : null;

  res.json({
    success: true,
    data: {
      userId,
      // Pre-assessment
      assessment: assessment
        ? {
            scores:           assessment.scores,
            unlockedSections: assessment.unlockedSections,
            attemptCount:     assessment.attemptCount,
            completedAt:      assessment.completedAt,
            recommendedLevel: assessment.recommendedLevel ?? 1,
            weakLetters:      assessment.weakLetters ?? [],
            assessment:       assessment.assessment ?? null,
          }
        : null,
      // Overall progress
      overall: {
        totalSessions:      progress?.totalSessions      ?? sessions.length,
        completedSessions:  progress?.completedSessions  ?? completedSessions.length,
        bestScore:          progress?.bestScore          ?? 0,
        averageScore:       progress?.averageScore       ?? 0,
        overallAccuracy,
        lastPlayedAt:       progress?.lastPlayedAt       ?? null,
      },
      // Section breakdown
      sections: sectionStats,
      // Per-game breakdown
      games: gameStats.sort((a, b) => (a.sectionId ?? 99) - (b.sectionId ?? 99)),
      // Recent 10 sessions (newest first)
      recentSessions: sessions.slice(0, 10).map((s) => ({
        sessionId:      s._id,
        gameKey:        s.gameKey,
        gameTitle:      GAME_META[s.gameKey]?.title ?? s.gameKey,
        sectionId:      s.sectionId,
        level:          s.level,
        status:         s.status,
        score:          s.score,
        totalQuestions: s.totalQuestions,
        correctAnswers: s.correctAnswers,
        wrongAnswers:   s.wrongAnswers,
        durationSeconds: s.durationSeconds,
        startedAt:      s.startedAt,
        completedAt:    s.completedAt,
      })),
      // Score trend over time
      accuracyTrend,
    },
  });
});

/**
 * GET /api/dyslexia/dashboard
 * Returns a lightweight performance summary for ALL users (admin view).
 * Only returns users who have at least one session.
 */
export const getAllUsersDashboard = asyncHandler(async (req, res) => {
  const [allProgress, allAssessments] = await Promise.all([
    UserProgress.find({ moduleId: 'dyslexia' })
      .select('userId totalSessions completedSessions bestScore averageScore lastPlayedAt unlockedSections assessmentDone recommendedLevel weakLetters')
      .lean(),
    PreAssessment.find({})
      .select('userId scores unlockedSections attemptCount completedAt recommendedLevel weakLetters assessment')
      .lean(),
  ]);

  const assessmentByUser = {};
  for (const a of allAssessments) assessmentByUser[a.userId] = a;

  const userIds = new Set([
    ...allProgress.map((progress) => progress.userId),
    ...allAssessments.map((assessment) => assessment.userId),
  ]);

  const progressByUser = {};
  for (const progress of allProgress) progressByUser[progress.userId] = progress;

  const summary = Array.from(userIds).map((userId) => {
    const p = progressByUser[userId] || {};
    const a = assessmentByUser[userId];
    return {
      userId,
      totalSessions:      p.totalSessions ?? 0,
      completedSessions:  p.completedSessions ?? 0,
      bestScore:          p.bestScore ?? 0,
      averageScore:       p.averageScore ?? 0,
      lastPlayedAt:       p.lastPlayedAt ?? a?.completedAt ?? null,
      assessmentDone:     p.assessmentDone ?? !!a,
      unlockedSections:   p.unlockedSections ?? (a?.unlockedSections ?? [1, 2, 5, 6]),
      assessmentScores:   a?.scores ?? null,
      assessmentAttempts: a?.attemptCount ?? 0,
      recommendedLevel:   a?.recommendedLevel ?? p.recommendedLevel ?? 1,
      weakLetters:        a?.weakLetters ?? p.weakLetters ?? [],
    };
  });

  res.json({
    success: true,
    data: summary,
  });
});
