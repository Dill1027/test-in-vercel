import { PreAssessment } from '../models/PreAssessment.js';
import { UserProgress } from '../models/UserProgress.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const ALL_SECTION_IDS = [1, 2, 3, 4, 5, 6];

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

const uniqueStrings = (values = []) => [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value.trim()))];

const deriveLegacyScores = (assessment = {}) => {
  const sections = assessment.sections ?? {};
  const letterRecognition = sections.letterRecognition?.score ?? assessment.scores?.letterRecognition ?? 0;
  const twoLetterReading = sections.twoLetterReading?.score ?? assessment.scores?.twoLetterReading ?? 0;
  const threeLetterReading = sections.threeLetterReading?.score ?? assessment.scores?.threeLetterReading ?? 0;

  return {
    letters: Math.round((Number(letterRecognition) / 100) * 3),
    twoLetter: Math.round((Number(twoLetterReading) / 100) * 2),
    threeLetter: Math.round((Number(threeLetterReading) / 100) * 2),
  };
};

const normalizeAssessment = (assessment = {}, userId) => {
  if (!assessment || typeof assessment !== 'object') return null;

  const sections = assessment.sections ?? {};
  const scores = assessment.scores ?? {};
  const legacyScores = assessment.legacyScores ?? deriveLegacyScores(assessment);
  const recommendedLevel = toNumber(assessment.recommendedLevel ?? scores.recommendedLevel, 1);
  const weakLetters = uniqueStrings(assessment.weakLetters ?? []);

  return {
    assessmentId: assessment.assessmentId ?? `assessment_${Date.now()}`,
    childId: assessment.childId ?? userId,
    startedAt: assessment.startedAt ?? new Date().toISOString(),
    completedAt: assessment.completedAt ?? new Date().toISOString(),
    completed: assessment.completed ?? true,
    scores: {
      letterRecognition: toNumber(scores.letterRecognition ?? sections.letterRecognition?.score, 0),
      letterSound: toNumber(scores.letterSound ?? sections.letterSound?.score, 0),
      twoLetterReading: toNumber(scores.twoLetterReading ?? sections.twoLetterReading?.score, 0),
      threeLetterReading: toNumber(scores.threeLetterReading ?? sections.threeLetterReading?.score, 0),
      pronunciation: toNumber(scores.pronunciation ?? 0, 0),
      overall: toNumber(scores.overall ?? assessment.overallScore ?? 0, 0),
    },
    sections,
    overallScore: toNumber(assessment.overallScore ?? scores.overall, 0),
    recommendedLevel,
    strengths: Array.isArray(assessment.strengths) ? assessment.strengths : [],
    weaknesses: Array.isArray(assessment.weaknesses) ? assessment.weaknesses : [],
    recommendedActivities: Array.isArray(assessment.recommendedActivities) ? assessment.recommendedActivities : [],
    weakLetters,
    responses: Array.isArray(assessment.responses) ? assessment.responses : [],
    legacyScores,
  };
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
 * Save or overwrite a child's placement assessment result.
 * Body: { userId, assessment } or legacy { userId, scores }
 */
export const saveAssessment = asyncHandler(async (req, res) => {
  const userId = resolveUserId(req);
  const assessmentInput = normalizeAssessment(req.body.assessment, userId);
  const legacyScores = assessmentInput ? assessmentInput.legacyScores : validateScores(req.body.scores);
  const unlockedSections = assessmentInput ? ALL_SECTION_IDS : computeUnlockedSections(legacyScores);

  // Upsert — retakes overwrite previous result, incrementing attemptCount
  const existing = await PreAssessment.findOne({ userId });
  const attemptCount = existing ? existing.attemptCount + 1 : 1;

  const savedAssessment = await PreAssessment.findOneAndUpdate(
    { userId },
    {
      $set: {
        scores: assessmentInput ? assessmentInput.legacyScores : legacyScores,
        assessment: assessmentInput,
        recommendedLevel: assessmentInput?.recommendedLevel ?? 1,
        weakLetters: assessmentInput?.weakLetters ?? [],
        startedAt: assessmentInput?.startedAt ? new Date(assessmentInput.startedAt) : new Date(),
        unlockedSections,
        completedAt: new Date(),
        completed: true,
        attemptCount,
      },
    },
    { new: true, upsert: true }
  );

  // Mirror unlocked sections into UserProgress for cross-module visibility
  await UserProgress.findOneAndUpdate(
    { userId, moduleId: 'dyslexia' },
    {
      $set: {
        unlockedSections,
        assessmentDone: true,
        assessmentScores: legacyScores,
        recommendedLevel: assessmentInput?.recommendedLevel ?? 1,
        weakLetters: assessmentInput?.weakLetters ?? [],
      },
      $setOnInsert: { userId, moduleId: 'dyslexia' },
    },
    { upsert: true }
  );

  res.status(201).json({
    success: true,
    data: {
        userId: savedAssessment.userId,
        scores: savedAssessment.scores,
        unlockedSections: savedAssessment.unlockedSections,
        attemptCount: savedAssessment.attemptCount,
        completedAt: savedAssessment.completedAt,
        assessment: savedAssessment.assessment,
        recommendedLevel: savedAssessment.recommendedLevel,
        weakLetters: savedAssessment.weakLetters,
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
      assessment: assessment.assessment,
      recommendedLevel: assessment.recommendedLevel,
      weakLetters: assessment.weakLetters,
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
    { userId, moduleId: 'dyslexia' },
    {
      $unset: { assessmentDone: '', assessmentScores: '', recommendedLevel: '', weakLetters: '' },
      $set:   { unlockedSections: [1, 2, 3, 4, 5, 6] },
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
  const unlockedSections = assessment?.unlockedSections ?? [1, 2, 3, 4, 5, 6];

  res.json({
    success: true,
    data: { userId, unlockedSections },
  });
});
