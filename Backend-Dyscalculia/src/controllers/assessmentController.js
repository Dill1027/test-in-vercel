import { PreAssessment } from '../models/PreAssessment.js';
import { UserProgress } from '../models/UserProgress.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const resolveUserId = (req) => {
  const userId = req.body?.userId || req.params?.userId || req.query?.userId || req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new HttpError(400, 'userId is required');
  }
  return userId.trim();
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Compute which section IDs are unlocked from assessment scores.
 * Must mirror the frontend computeUnlockedSections in useDyslexiaProgress.js
 *
 * Always unlocked:  1 (Garden Journey), 2 (Letters), 5 (Rhyme OOO), 6 (Word Builder)
 * Conditional:
 *   Section 3 — letters === 3 (perfect)
 *   Section 4 — twoLetter === 2 (perfect)
 */
const computeUnlockedSections = ({ letters = 0, twoLetter = 0 } = {}) => {
  const unlocked = [1, 2, 5, 6];
  if (letters === 3) unlocked.push(3);
  if (twoLetter === 2) unlocked.push(4);
  return unlocked.sort((a, b) => a - b);
};

const validateScores = (scores) => {
  const letters     = toNumber(scores?.letters,     0);
  const twoLetter   = toNumber(scores?.twoLetter,   0);
  const threeLetter = toNumber(scores?.threeLetter, 0);

  if (letters < 0 || letters > 3)       throw new HttpError(400, 'scores.letters must be 0-3');
  if (twoLetter < 0 || twoLetter > 2)   throw new HttpError(400, 'scores.twoLetter must be 0-2');
  if (threeLetter < 0 || threeLetter > 2) throw new HttpError(400, 'scores.threeLetter must be 0-2');

  return { letters, twoLetter, threeLetter };
};

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/dyslexia/assessment
 * Save or overwrite a child's pre-assessment result.
 * Body: { userId, scores: { letters, twoLetter, threeLetter } }
 */
export const saveAssessment = asyncHandler(async (req, res) => {
  const userId = resolveUserId(req);
  const scores = validateScores(req.body.scores);
  const unlockedSections = computeUnlockedSections(scores);

  // Upsert — retakes overwrite previous result, incrementing attemptCount
  const existing = await PreAssessment.findOne({ userId });
  const attemptCount = existing ? existing.attemptCount + 1 : 1;

  const assessment = await PreAssessment.findOneAndUpdate(
    { userId },
    {
      $set: {
        scores,
        unlockedSections,
        completedAt: new Date(),
        attemptCount,
      },
    },
    { new: true, upsert: true }
  );

  // Mirror unlocked sections into UserProgress for cross-module visibility
  await UserProgress.findOneAndUpdate(
    { userId, moduleId: 'dyscalculia' },
    {
      $set: {
        unlockedSections,
        assessmentDone: true,
        assessmentScores: scores,
      },
      $setOnInsert: { userId, moduleId: 'dyscalculia' },
    },
    { upsert: true }
  );

  res.status(201).json({
    success: true,
    data: {
      userId: assessment.userId,
      scores: assessment.scores,
      unlockedSections: assessment.unlockedSections,
      attemptCount: assessment.attemptCount,
      completedAt: assessment.completedAt,
    },
  });
});

/**
 * GET /api/dyslexia/assessment/:userId
 * Retrieve a child's most recent assessment result.
 */
export const getAssessment = asyncHandler(async (req, res) => {
  const userId = resolveUserId(req);
  const assessment = await PreAssessment.findOne({ userId }).lean();

  if (!assessment) {
    return res.json({
      success: true,
      data: null,
    });
  }

  res.json({
    success: true,
    data: {
      userId: assessment.userId,
      scores: assessment.scores,
      unlockedSections: assessment.unlockedSections,
      attemptCount: assessment.attemptCount,
      completedAt: assessment.completedAt,
    },
  });
});

/**
 * DELETE /api/dyslexia/assessment/:userId
 * Reset a child's assessment so they can retake it.
 */
export const resetAssessment = asyncHandler(async (req, res) => {
  const userId = resolveUserId(req);

  await PreAssessment.deleteOne({ userId });

  // Reset assessment fields in UserProgress but keep game progress
  await UserProgress.findOneAndUpdate(
    { userId, moduleId: 'dyscalculia' },
    {
      $unset: { assessmentDone: '', assessmentScores: '' },
      $set:   { unlockedSections: [1, 2, 5, 6] },
    }
  );

  res.json({
    success: true,
    message: 'Assessment reset. Child can retake the pre-assessment.',
  });
});

/**
 * GET /api/dyslexia/assessment/:userId/unlocked-sections
 * Lightweight endpoint — returns only the unlocked section IDs.
 */
export const getUnlockedSections = asyncHandler(async (req, res) => {
  const userId = resolveUserId(req);
  const assessment = await PreAssessment.findOne({ userId }, 'unlockedSections').lean();

  // Default — always-unlocked sections returned even before assessment
  const unlockedSections = assessment?.unlockedSections ?? [1, 2, 5, 6];

  res.json({
    success: true,
    data: { userId, unlockedSections },
  });
});
