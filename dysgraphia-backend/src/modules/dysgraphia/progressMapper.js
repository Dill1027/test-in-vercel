const {
  CATALOG_VERSION,
  LETTER_LEVELS,
  SHAPES,
  WORD_GROUPS,
  getCatalog,
} = require("./catalog");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptySummary(now = new Date().toISOString()) {
  return {
    module: "dysgraphia",
    catalogVersion: CATALOG_VERSION,
    letters: Object.fromEntries(
      Object.entries(LETTER_LEVELS).map(([levelId, level]) => [
        levelId,
        {
          name: level.name,
          completed: 0,
          total: level.items.length,
          stars: 0,
          itemProgress: {},
        },
      ])
    ),
    words: Object.fromEntries(
      Object.entries(WORD_GROUPS).map(([groupId, group]) => [
        groupId,
        {
          name: group.name,
          completed: 0,
          total: group.items.length,
          stars: 0,
          itemProgress: {},
        },
      ])
    ),
    dysgraphia: {
      letterTracing: {},
      mirrorLetters: {},
      twoLetterWords: {},
      threeLetterWords: {},
      writingLines: {},
      interventions: {
        processedCompletionIds: [],
        mirrorReversal: { totalAttempts: 0, correctAttempts: 0, recentResults: [], rewardStarsByWord: {} },
        wordWriting: { totalAttempts: 0, correctAttempts: 0, recentResults: [] },
        letterWriting: { totalAttempts: 0, correctAttempts: 0, recentResults: [], byLetter: {} },
      },
    },
    shapes: {
      name: "හැඩතල",
      completed: 0,
      total: SHAPES.length,
      stars: 0,
      itemProgress: {},
    },
    stats: {
      totalStars: 0,
      totalMinutesSpent: 0,
      sessionsCompleted: 0,
      lastSessionDate: null,
      totalItemsCompleted: 0,
    },
    achievements: [],
    recentSessions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function ensureSummary(summary) {
  const fallback = createEmptySummary();
  if (!summary) {
    return fallback;
  }

  const merged = {
    ...fallback,
    ...clone(summary),
    letters: {
      ...fallback.letters,
      ...(summary.letters || {}),
    },
    words: {
      ...fallback.words,
      ...(summary.words || {}),
    },
    dysgraphia: {
      ...fallback.dysgraphia,
      ...(summary.dysgraphia || {}),
    },
    shapes: {
      ...fallback.shapes,
      ...(summary.shapes || {}),
    },
    stats: {
      ...fallback.stats,
      ...(summary.stats || {}),
    },
  };

  Object.keys(fallback.letters).forEach((levelId) => {
    merged.letters[levelId] = {
      ...fallback.letters[levelId],
      ...(merged.letters[levelId] || {}),
      itemProgress: { ...((merged.letters[levelId] || {}).itemProgress || {}) },
    };
  });

  Object.keys(fallback.words).forEach((groupId) => {
    merged.words[groupId] = {
      ...fallback.words[groupId],
      ...(merged.words[groupId] || {}),
      itemProgress: { ...((merged.words[groupId] || {}).itemProgress || {}) },
    };
  });

  merged.shapes.itemProgress = { ...(merged.shapes.itemProgress || {}) };
  Object.keys(fallback.dysgraphia).forEach((activityType) => {
    merged.dysgraphia[activityType] = {
      ...(merged.dysgraphia[activityType] || {}),
    };
  });
  merged.dysgraphia.interventions = {
    ...fallback.dysgraphia.interventions,
    ...(merged.dysgraphia.interventions || {}),
  };
  ["mirrorReversal", "wordWriting", "letterWriting"].forEach((area) => {
    merged.dysgraphia.interventions[area] = {
      ...fallback.dysgraphia.interventions[area],
      ...(merged.dysgraphia.interventions[area] || {}),
    };
  });
  merged.dysgraphia.interventions.mirrorReversal.rewardStarsByWord = {
    ...(merged.dysgraphia.interventions.mirrorReversal.rewardStarsByWord || {}),
  };
  merged.dysgraphia.interventions.letterWriting.byLetter = {
    ...(merged.dysgraphia.interventions.letterWriting.byLetter || {}),
  };
  merged.dysgraphia.interventions.processedCompletionIds = [
    ...(summary.dysgraphia?.interventions?.processedCompletionIds || []),
  ];
  merged.catalogVersion = CATALOG_VERSION;
  return recalculateSummary(merged);
}

function buildAchievements(summary) {
  const achievements = [];
  const add = (id, label) => achievements.push({ id, label });

  if (summary.stats.totalStars >= 10) add("stars-10", "10 තරු");
  if (summary.stats.totalStars >= 25) add("stars-25", "25 තරු");
  if (summary.stats.totalStars >= 50) add("stars-50", "50 තරු");
  if (summary.stats.sessionsCompleted >= 5) add("sessions-5", "5 සැසි");
  if (summary.stats.sessionsCompleted >= 10) add("sessions-10", "10 සැසි");
  if (summary.letters.level1.completed === summary.letters.level1.total) add("level1-complete", "අදියර 1 සම්පූර්ණ");
  if (summary.letters.level2.completed === summary.letters.level2.total) add("level2-complete", "අදියර 2 සම්පූර්ණ");
  if (summary.letters.level3.completed === summary.letters.level3.total) add("level3-complete", "අදියර 3 සම්පූර්ණ");

  return achievements;
}

function recalculateGroup(group) {
  const progressEntries = Object.values(group.itemProgress || {});
  group.completed = progressEntries.filter((item) => item.completed).length;
  group.stars = progressEntries.reduce((total, item) => total + Number(item.stars || 0), 0);
}

function recalculateSummary(summary) {
  Object.values(summary.letters).forEach(recalculateGroup);
  Object.values(summary.words).forEach(recalculateGroup);
  recalculateGroup(summary.shapes);

  summary.stats.totalItemsCompleted =
    summary.shapes.completed +
    Object.values(summary.letters).reduce((total, level) => total + level.completed, 0) +
    Object.values(summary.words).reduce((total, group) => total + group.completed, 0);

  summary.stats.totalStars =
    summary.shapes.stars +
    Object.values(summary.letters).reduce((total, level) => total + level.stars, 0) +
    Object.values(summary.words).reduce((total, group) => total + group.stars, 0) +
    Object.values(summary.dysgraphia?.mirrorLetters || {}).reduce(
      (total, letter) => total + Number(letter.starsEarned || 0),
      0
    ) +
    Object.values(summary.dysgraphia?.interventions?.mirrorReversal?.rewardStarsByWord || {}).reduce(
      (total, stars) => total + Number(stars || 0),
      0
    );

  summary.achievements = buildAchievements(summary);
  summary.recentSessions = [...(summary.recentSessions || [])]
    .sort((left, right) => String(right.endedAt || right.startedAt || "").localeCompare(String(left.endedAt || left.startedAt || "")))
    .slice(0, 30);

  return summary;
}

function chooseBestValue(previous, candidate, fallbackField) {
  const previousScore = Number(previous.stars || 0);
  const candidateScore = Number(candidate.stars || 0);
  if (candidateScore > previousScore) {
    return candidate[fallbackField];
  }

  if (candidateScore === previousScore && Number(candidate.bestConfidence || 0) >= Number(previous.bestConfidence || 0)) {
    return candidate[fallbackField];
  }

  return previous[fallbackField];
}

function mergeItemProgress(previousItem, incomingItem) {
  const previous = previousItem || {
    stars: 0,
    completed: false,
    attemptsCount: 0,
    lastAttemptAt: null,
    bestConfidence: 0,
    bestPrediction: null,
    lastPrediction: null,
    lastResult: null,
    metadata: {},
  };

  const merged = {
    ...previous,
    attemptsCount: Number(previous.attemptsCount || 0) + 1,
    lastAttemptAt: incomingItem.lastAttemptAt,
    lastPrediction: incomingItem.lastPrediction,
    lastResult: incomingItem.lastResult,
    metadata: {
      ...(previous.metadata || {}),
      ...(incomingItem.metadata || {}),
    },
  };

  merged.stars = Math.max(Number(previous.stars || 0), Number(incomingItem.stars || 0));
  merged.completed = Boolean(previous.completed || incomingItem.completed);
  merged.bestConfidence = Math.max(Number(previous.bestConfidence || 0), Number(incomingItem.bestConfidence || 0));
  merged.bestPrediction = chooseBestValue(previous, incomingItem, "bestPrediction");

  return merged;
}

function applyShapeProgress(summary, payload) {
  const nextSummary = ensureSummary(summary);
  const group = nextSummary.shapes;
  const existing = group.itemProgress[payload.shapeId];
  group.itemProgress[payload.shapeId] = mergeItemProgress(existing, {
    stars: payload.starsEarned,
    completed: payload.starsEarned > 0,
    lastAttemptAt: payload.attemptedAt,
    bestConfidence: Number(payload.coverage || 0) / 100,
    bestPrediction: payload.shapeId,
    lastPrediction: payload.shapeId,
    lastResult: payload.starsEarned > 0 ? "correct" : "incorrect",
    metadata: {
      coverage: payload.coverage,
      strayRatio: payload.strayRatio,
      durationSeconds: payload.durationSeconds,
      clientMetrics: payload.clientMetrics || null,
    },
  });
  return recalculateSummary(nextSummary);
}

function applyLetterProgress(summary, payload) {
  const nextSummary = ensureSummary(summary);
  const group = nextSummary.letters[payload.levelId];
  const existing = group.itemProgress[payload.letterId];
  const previousTaskStars = existing?.metadata?.taskStars || {};
  const taskStars = {
    freeTrace: Number(previousTaskStars.freeTrace || 0),
    guided: Number(previousTaskStars.guided || 0),
    independent: Math.max(
      Number(previousTaskStars.independent ?? existing?.stars ?? 0),
      Number(payload.starsEarned || 0)
    ),
  };
  const combinedStars = Object.values(taskStars).reduce((total, stars) => total + stars, 0);
  group.itemProgress[payload.letterId] = mergeItemProgress(existing, {
    stars: combinedStars,
    completed: payload.starsEarned > 0,
    lastAttemptAt: payload.attemptedAt,
    bestConfidence: payload.confidence || 0,
    bestPrediction: payload.predicted,
    lastPrediction: payload.predicted,
    lastResult: payload.isCorrect ? "correct" : payload.failureReason ? "failed" : "incorrect",
    metadata: {
      targetChar: payload.targetChar,
      mode: payload.mode,
      durationSeconds: payload.durationSeconds,
      failureReason: payload.failureReason || null,
      taskStars,
    },
  });
  applyLetterAggregate(nextSummary, payload);
  return recalculateSummary(nextSummary);
}

function applyLetterPracticeProgress(summary, payload) {
  const nextSummary = ensureSummary(summary);
  const group = nextSummary.letters[payload.levelId];
  const existing = group.itemProgress[payload.letterId];
  const previousTaskStars = existing?.metadata?.taskStars || {};
  const taskKey = payload.task === "free-trace" ? "freeTrace" : "guided";
  const taskStars = {
    freeTrace: Number(previousTaskStars.freeTrace || 0),
    guided: Number(previousTaskStars.guided || 0),
    independent: Number(previousTaskStars.independent ?? existing?.stars ?? 0),
  };
  taskStars[taskKey] = Math.max(taskStars[taskKey], Number(payload.starsEarned || 0));
  const combinedStars = Object.values(taskStars).reduce((total, stars) => total + stars, 0);

  group.itemProgress[payload.letterId] = mergeItemProgress(existing, {
    stars: combinedStars,
    completed: true,
    lastAttemptAt: payload.attemptedAt,
    lastPrediction: payload.targetChar,
    lastResult: "correct",
    metadata: {
      targetChar: payload.targetChar,
      taskStars,
      breakCount: payload.breakCount ?? null,
      attemptNumber: payload.attemptNumber,
      additionalNodesDisplayed: payload.additionalNodesDisplayed,
    },
  });
  return recalculateSummary(nextSummary);
}

function average(numbers) {
  if (!numbers || numbers.length === 0) {
    return 0;
  }
  return numbers.reduce((total, value) => total + Number(value || 0), 0) / numbers.length;
}

const RECENT_RESULT_LIMIT = 5;
const MASTERY_SAMPLE_SIZE = 3;
const MASTERY_THRESHOLD = 0.8;
const WEAKNESS_THRESHOLD = 0.7;
const MIN_LETTER_ATTEMPTS = 2;
const RELAPSE_SAMPLE_SIZE = 2;

function appendRecentResult(results, result) {
  return [...(Array.isArray(results) ? results : []), result]
    .sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")))
    .slice(-RECENT_RESULT_LIMIT);
}

function resultScore(result) {
  const score = Number(result?.score);
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
}

function hasRecentMastery(results) {
  const recent = [...(Array.isArray(results) ? results : [])]
    .sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")))
    .slice(-MASTERY_SAMPLE_SIZE);
  return recent.length >= MASTERY_SAMPLE_SIZE && average(recent.map(resultScore)) >= MASTERY_THRESHOLD;
}

function mergeRelevantResults(normalResults, interventionResults) {
  return [...(Array.isArray(normalResults) ? normalResults : []), ...(Array.isArray(interventionResults) ? interventionResults : [])]
    .sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")))
    .slice(-RECENT_RESULT_LIMIT);
}

function getLatestMasteryIndex(results) {
  let latestIndex = -1;
  for (let index = MASTERY_SAMPLE_SIZE - 1; index < results.length; index += 1) {
    const window = results.slice(index - MASTERY_SAMPLE_SIZE + 1, index + 1);
    if (average(window.map(resultScore)) >= MASTERY_THRESHOLD) {
      latestIndex = index;
    }
  }
  return latestIndex;
}

function evaluateLetterMastery(item, intervention) {
  const totalAttempts = Number(item?.totalAttempts || 0);
  const correctAttempts = Number(item?.correctAttempts || 0);
  const averageConfidence = Number(item?.averageConfidence || 0);
  const overallAccuracy = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;
  const recentResults = mergeRelevantResults(item?.recentResults, intervention?.recentResults);
  const recentWindow = recentResults.slice(-MASTERY_SAMPLE_SIZE);
  const recentAccuracy = recentWindow.length ? average(recentWindow.map(resultScore)) : null;
  const latestMasteryIndex = getLatestMasteryIndex(recentResults);
  const resultsAfterMastery = latestMasteryIndex >= 0
    ? recentResults.slice(latestMasteryIndex + 1)
    : [];
  const relapseDetected = resultsAfterMastery.length >= RELAPSE_SAMPLE_SIZE
    && average(resultsAfterMastery.map(resultScore)) < WEAKNESS_THRESHOLD;
  const sustainedRecentMastery = latestMasteryIndex >= 0 && !relapseDetected;
  const enoughOverallEvidence = totalAttempts >= MIN_LETTER_ATTEMPTS;
  const hasAttemptsWithNoCorrect = totalAttempts > 0 && correctAttempts === 0;
  const isFiveToTenAttempts = totalAttempts >= 5 && totalAttempts <= 10;
  const lowCorrectInFiveToTen = isFiveToTenAttempts && correctAttempts <= 1;
  const lowCorrectAndConfidenceInFiveToTen = isFiveToTenAttempts
    && correctAttempts <= 2
    && averageConfidence < 0.3;
  const weakOverallPerformance = (enoughOverallEvidence && overallAccuracy < WEAKNESS_THRESHOLD)
    || hasAttemptsWithNoCorrect
    || lowCorrectInFiveToTen
    || lowCorrectAndConfidenceInFiveToTen;
  const weakRecentPerformance = recentWindow.length >= MASTERY_SAMPLE_SIZE
    && recentAccuracy < WEAKNESS_THRESHOLD;
  const needsPractice = (weakOverallPerformance || weakRecentPerformance) && !sustainedRecentMastery;
  const masteryScore = recentAccuracy ?? overallAccuracy;

  return {
    totalAttempts,
    correctAttempts,
    overallAccuracy,
    recentAccuracy,
    recentSampleSize: recentWindow.length,
    masteryScore,
    needsPractice,
    status: needsPractice
      ? "needs_practice"
      : sustainedRecentMastery
        ? "mastered"
        : enoughOverallEvidence
          ? "developing"
          : "insufficient_evidence",
    evidence: {
      minimumAttempts: MIN_LETTER_ATTEMPTS,
      recentSampleSize: MASTERY_SAMPLE_SIZE,
      masteryThreshold: MASTERY_THRESHOLD,
      weaknessThreshold: WEAKNESS_THRESHOLD,
      relapseSampleSize: RELAPSE_SAMPLE_SIZE,
      sustainedRecentMastery,
      relapseDetected,
      matchedWeaknessRules: {
        hasAttemptsWithNoCorrect,
        lowCorrectInFiveToTen,
        lowCorrectAndConfidenceInFiveToTen,
        belowOverallAccuracyThreshold: enoughOverallEvidence && overallAccuracy < WEAKNESS_THRESHOLD,
      },
    },
  };
}

function mergeAggregate(previous, incoming) {
  const existing = previous || {};
  const previousAttempts = Number(existing.totalAttempts || 0);
  const totalAttempts = previousAttempts + 1;
  const confidence = Number(incoming.lastConfidence || 0);

  return {
    ...existing,
    ...incoming,
    totalAttempts,
    wrongAttempts: Number(existing.wrongAttempts || 0) + (incoming.isCorrect ? 0 : 1),
    correctAttempts: Number(existing.correctAttempts || 0) + (incoming.isCorrect ? 1 : 0),
    eraseCount: Number(existing.eraseCount || 0) + Number(incoming.eraseCount || 0),
    bestConfidence: Math.max(Number(existing.bestConfidence || 0), confidence),
    averageConfidence:
      ((Number(existing.averageConfidence || 0) * previousAttempts) + confidence) / totalAttempts,
    lastConfidence: confidence,
    totalTimeSeconds: Number(existing.totalTimeSeconds || 0) + Number(incoming.durationSeconds || 0),
    lastAttemptTimeSeconds: Number(incoming.durationSeconds || 0),
    starsEarned: Math.max(Number(existing.starsEarned || 0), Number(incoming.starsEarned || 0)),
    completed: Boolean(existing.completed || incoming.completed),
    recentResults: incoming.recentResult
      ? appendRecentResult(existing.recentResults, incoming.recentResult)
      : [...(existing.recentResults || [])],
  };
}

function applyLetterAggregate(summary, payload) {
  summary.dysgraphia.letterTracing[payload.letterId] = mergeAggregate(
    summary.dysgraphia.letterTracing[payload.letterId],
    {
      targetChar: payload.targetChar,
      lastConfidence: payload.confidence,
      eraseCount: payload.eraseCount,
      durationSeconds: payload.durationSeconds,
      starsEarned: payload.starsEarned,
      completed: payload.isCorrect,
      isCorrect: payload.isCorrect,
      recentResult: {
        score: payload.isCorrect ? 1 : 0,
        correct: Boolean(payload.isCorrect),
        at: payload.attemptedAt,
      },
    }
  );
}

function applyMirrorLetterProgress(summary, payload) {
  const previous = summary.dysgraphia.mirrorLetters[payload.letterId] || {
    targetChar: payload.targetChar,
    totalRounds: 0,
    totalAttempts: 0,
    correctAttempts: 0,
    wrongAttempts: 0,
    lastRoundAttempts: 0,
    lastRoundWrongAttempts: 0,
    drawingAttempts: 0,
    drawingCorrectAttempts: 0,
    drawingWrongAttempts: 0,
    lastDrawingCorrect: null,
    lastPredictedLetter: null,
    lastConfidence: null,
    bestDrawingConfidence: 0,
    averageDrawingConfidence: 0,
    drawingConfidenceSamples: 0,
    drawingEraseCount: 0,
    drawingTotalTimeSeconds: 0,
    lastDrawingTimeSeconds: 0,
    starsEarned: 0,
    completed: false,
    lastAttemptAt: null,
  };

  const drawingExists = typeof payload.drawingCorrect === "boolean";
  const previousDrawingAttempts = Number(previous.drawingAttempts || 0);
  const drawingConfidence = Number(payload.confidence);
  const hasConfidence = drawingExists && Number.isFinite(drawingConfidence);
  const nextDrawingAttempts = previousDrawingAttempts + (drawingExists ? 1 : 0);
  const previousConfidenceSamples = Number(previous.drawingConfidenceSamples || 0);
  const nextConfidenceSamples = previousConfidenceSamples + (hasConfidence ? 1 : 0);

  summary.dysgraphia.mirrorLetters[payload.letterId] = {
    ...previous,
    targetChar: payload.targetChar,
    totalRounds: Number(previous.totalRounds || 0) + 1,
    totalAttempts: Number(previous.totalAttempts || 0) + payload.totalAttempts,
    correctAttempts: Number(previous.correctAttempts || 0) + payload.correctAttempts,
    wrongAttempts: Number(previous.wrongAttempts || 0) + payload.wrongAttempts,
    lastRoundAttempts: payload.totalAttempts,
    lastRoundWrongAttempts: payload.wrongAttempts,
    drawingAttempts: nextDrawingAttempts,
    drawingCorrectAttempts: Number(previous.drawingCorrectAttempts || 0) + (payload.drawingCorrect === true ? 1 : 0),
    drawingWrongAttempts: Number(previous.drawingWrongAttempts || 0) + (payload.drawingCorrect === false ? 1 : 0),
    lastDrawingCorrect: drawingExists ? payload.drawingCorrect : previous.lastDrawingCorrect,
    lastPredictedLetter: drawingExists ? payload.predictedLetter || null : previous.lastPredictedLetter,
    lastConfidence: hasConfidence ? drawingConfidence : drawingExists ? null : previous.lastConfidence,
    bestDrawingConfidence: hasConfidence
      ? Math.max(Number(previous.bestDrawingConfidence || 0), drawingConfidence)
      : Number(previous.bestDrawingConfidence || 0),
    averageDrawingConfidence: hasConfidence
      ? ((Number(previous.averageDrawingConfidence || 0) * previousConfidenceSamples) + drawingConfidence) / nextConfidenceSamples
      : Number(previous.averageDrawingConfidence || 0),
    drawingConfidenceSamples: nextConfidenceSamples,
    drawingEraseCount: Number(previous.drawingEraseCount || 0) + Number(payload.drawingEraseCount || 0),
    drawingTotalTimeSeconds: Number(previous.drawingTotalTimeSeconds || 0) + Number(payload.drawingDurationSeconds || 0),
    lastDrawingTimeSeconds: drawingExists
      ? Number(payload.drawingDurationSeconds || 0)
      : Number(previous.lastDrawingTimeSeconds || 0),
    starsEarned: Math.max(Number(previous.starsEarned || 0), Number(payload.starsEarned || 0)),
    completed: Boolean(previous.completed || payload.completed),
    lastAttemptAt: payload.attemptedAt,
    recentResults: appendRecentResult(previous.recentResults, {
      score: payload.totalAttempts > 0 ? payload.correctAttempts / payload.totalAttempts : 0,
      correct: payload.wrongAttempts === 0 && payload.completed,
      at: payload.attemptedAt,
    }),
  };
  return recalculateSummary(summary);
}

function applyWordAggregate(summary, payload, activityType, completed) {
  const segmentation = payload.segmentation || {
    spacing: payload.spacing || [],
    sizes: payload.sizes || [],
  };
  const confidences = payload.confidences || [];
  const confidence = average(confidences);
  const item = mergeAggregate(summary.dysgraphia[activityType][payload.wordId], {
    targetWord: payload.targetWord,
    lastPredictedWord: payload.predictedWord || null,
    lastConfidences: confidences,
    lastConfidence: confidence,
    averageConfidence: confidence,
    bestConfidence: confidence,
    spacing: segmentation.spacing || [],
    sizes: segmentation.sizes || [],
    durationSeconds: payload.durationSeconds,
    starsEarned: payload.starsEarned,
    completed,
    isCorrect: payload.isCorrect,
    recentResult: {
      score: payload.isCorrect ? 1 : 0,
      correct: Boolean(payload.isCorrect),
      at: payload.attemptedAt,
    },
  });
  item.averageConfidence =
    ((Number(summary.dysgraphia[activityType][payload.wordId]?.averageConfidence || 0) *
      Number(summary.dysgraphia[activityType][payload.wordId]?.totalAttempts || 0)) + confidence) /
    item.totalAttempts;
  summary.dysgraphia[activityType][payload.wordId] = item;
}

function applyWordProgress(summary, payload) {
  const nextSummary = ensureSummary(summary);
  const group = nextSummary.words[payload.group];
  const existing = group.itemProgress[payload.wordId];
  group.itemProgress[payload.wordId] = mergeItemProgress(existing, {
    stars: payload.starsEarned,
    completed: payload.starsEarned > 0,
    lastAttemptAt: payload.attemptedAt,
    bestConfidence: average(payload.confidences),
    bestPrediction: payload.predictedWord || null,
    lastPrediction: payload.predictedWord || null,
    lastResult: payload.isCorrect ? "correct" : payload.failureReason ? "failed" : "incorrect",
    metadata: {
      targetWord: payload.targetWord,
      expectedLength: payload.expectedLength,
      predictedLetters: payload.predictedLetters || [],
      failureReason: payload.failureReason || null,
      durationSeconds: payload.durationSeconds,
    },
  });
  applyWordAggregate(
    nextSummary,
    payload,
    payload.group === "twoLetters" ? "twoLetterWords" : "threeLetterWords",
    Boolean(payload.isCorrect)
  );
  return recalculateSummary(nextSummary);
}

function applyWritingLineProgress(summary, payload) {
  const nextSummary = ensureSummary(summary);
  const group =
  nextSummary.words[payload.group] ||
  nextSummary.words["writingLines"];

// Update legacy word progress only if that group exists
if (group) {
  const existing = group.itemProgress[payload.wordId];

  group.itemProgress[payload.wordId] =
    mergeItemProgress(existing, {
      stars: payload.starsEarned,
      completed: Boolean(payload.passed),
      lastAttemptAt: payload.attemptedAt,
      bestConfidence: average(payload.confidences),
      bestPrediction: payload.predictedWord || null,
      lastPrediction: payload.predictedWord || null,
      lastResult: payload.passed
        ? "correct"
        : payload.failureReason
          ? "failed"
          : "incorrect",

      metadata: {
        targetWord: payload.targetWord,
        expectedLength: payload.expectedLength,
        predictedLetters: payload.predictedLetters || [],
        outOfLinesPct: payload.outOfLinesPct || 0,
        letterHeightRatio:
          payload.letterHeightRatio || null,
        letterSizeDetails: payload.letterSizeDetails || [],
        bigLetters: payload.bigLetters || [],
        smallLetters: payload.smallLetters || [],
        failureReason:
          payload.failureReason || null,
        durationSeconds:
          payload.durationSeconds,
      },
    });
}

  const activity = nextSummary.dysgraphia.writingLines;
  const existingAggregate = activity[payload.wordId];
  const passed = Boolean(payload.passed);
  const aggregate = mergeAggregate(existingAggregate, {
    targetWord: payload.targetWord,
    lastPredictedWord: payload.predictedWord || null,
    lastConfidences: payload.confidences || [],
    lastConfidence: average(payload.confidences),
    averageConfidence: average(payload.confidences),
    spacing: payload.segmentation?.spacing || payload.spacing || [],
    sizes: payload.segmentation?.sizes || payload.sizes || [],
    outOfLinesPct: payload.outOfLinesPct,
    letterHeightRatio: payload.letterHeightRatio,
    strikeCount: payload.strikeCount,
    hardLinesFail: payload.hardLinesFail,
    linesFail: payload.linesFail,
    sizeFail: payload.sizeFail,
    letterSizeDetails: payload.letterSizeDetails || [],
    bigLetters: payload.bigLetters || [],
    smallLetters: payload.smallLetters || [],
    spacingFail: payload.spacingFail,
    durationSeconds: payload.durationSeconds,
    starsEarned: payload.starsEarned,
    completed: passed,
    isCorrect: payload.isCorrect,
  });
  aggregate.passedAttempts = Number(existingAggregate?.passedAttempts || 0) + (passed ? 1 : 0);
  activity[payload.wordId] = aggregate;
  return recalculateSummary(nextSummary);
}

function updateInterventionAggregate(previous, payload) {
  const current = previous || { totalAttempts: 0, correctAttempts: 0, recentResults: [] };
  const recentResult = {
    score: payload.performanceScore,
    correct: payload.correct,
    completed: payload.completed,
    attempts: payload.attempts,
    mistakes: payload.mistakes,
    targetLetterId: payload.targetLetterId || null,
    targetLetter: payload.targetLetter || null,
    targetWord: payload.targetWord || null,
    durationSeconds: payload.durationSeconds,
    completionId: payload.completionId,
    at: payload.attemptedAt,
  };
  return {
    ...current,
    totalAttempts: Number(current.totalAttempts || 0) + 1,
    correctAttempts: Number(current.correctAttempts || 0) + (payload.correct ? 1 : 0),
    completedAttempts: Number(current.completedAttempts || 0) + (payload.completed ? 1 : 0),
    totalMistakes: Number(current.totalMistakes || 0) + Number(payload.mistakes || 0),
    totalDurationSeconds: Number(current.totalDurationSeconds || 0) + Number(payload.durationSeconds || 0),
    bestScore: Math.max(Number(current.bestScore || 0), Number(payload.performanceScore || 0)),
    lastAttemptAt: payload.attemptedAt,
    recentResults: appendRecentResult(current.recentResults, recentResult),
  };
}

function applyInterventionProgress(summary, payload) {
  const nextSummary = ensureSummary(summary);
  const interventions = nextSummary.dysgraphia.interventions;
  const area = payload.gameType === "mirror-letter-drag"
    ? "mirrorReversal"
    : payload.gameType === "dotted-word-tracing"
      ? "wordWriting"
      : "letterWriting";

  interventions[area] = updateInterventionAggregate(interventions[area], payload);
  if (area === "mirrorReversal" && payload.targetWord && payload.completed) {
    const rewardStarsByWord = interventions.mirrorReversal.rewardStarsByWord || {};
    interventions.mirrorReversal.rewardStarsByWord = {
      ...rewardStarsByWord,
      [payload.targetWord]: Math.max(
        Number(rewardStarsByWord[payload.targetWord] || 0),
        Number(payload.starsEarned || 0)
      ),
    };
  }
  if (area === "letterWriting" && payload.targetLetterId) {
    interventions.letterWriting.byLetter[payload.targetLetterId] = updateInterventionAggregate(
      interventions.letterWriting.byLetter[payload.targetLetterId],
      payload
    );
  }
  interventions.processedCompletionIds = [
    ...(interventions.processedCompletionIds || []),
    payload.completionId,
  ].slice(-50);
  return recalculateSummary(nextSummary);
}

function buildLetterMastery(summary) {
  const letterInterventions = summary.dysgraphia.interventions.letterWriting.byLetter;
  return Object.fromEntries(
    Object.entries(summary.dysgraphia.letterTracing || {}).map(([letterId, item]) => [
      letterId,
      evaluateLetterMastery(item, letterInterventions[letterId]),
    ])
  );
}

function buildLearningInsights(summary, letterMastery = buildLetterMastery(summary)) {
  const dysgraphia = summary.dysgraphia;
  const interventions = dysgraphia.interventions;
  const weaknesses = [];

  const mirrorItems = Object.entries(dysgraphia.mirrorLetters || {}).map(([id, item]) => ({ id, ...item }));
  const difficultMirror = mirrorItems
    .filter((item) => {
      const total = Number(item.totalAttempts || 0);
      const drawingAttempts = Number(item.drawingAttempts || 0);
      return (total >= 3 && (Number(item.wrongAttempts || 0) >= 3 || Number(item.wrongAttempts || 0) / total > 0.4))
        || (drawingAttempts >= 2 && Number(item.drawingCorrectAttempts || 0) / drawingAttempts < 0.7);
    })
    .sort((left, right) => Number(right.wrongAttempts || 0) - Number(left.wrongAttempts || 0));
  const mirrorNormalResults = mirrorItems.flatMap((item) => item.recentResults || []);
  const mirrorRecent = mergeRelevantResults(mirrorNormalResults, interventions.mirrorReversal.recentResults);
  const mirrorRecentWeak = mirrorRecent.slice(-MASTERY_SAMPLE_SIZE).length >= MASTERY_SAMPLE_SIZE
    && average(mirrorRecent.slice(-MASTERY_SAMPLE_SIZE).map(resultScore)) < 0.7;
  if ((difficultMirror.length > 0 && !hasRecentMastery(mirrorRecent)) || mirrorRecentWeak) {
    const target = difficultMirror[0] || mirrorItems[0];
    weaknesses.push({
      id: "mirror-reversal",
      type: "mirror_reversal",
      label: "කැඩපත් හෝ ආපසු හැරුණු අකුරු හඳුනා ගැනීම",
      targetLetterId: target?.id || null,
      targetLetter: target?.targetChar || null,
      recentAverage: average(mirrorRecent.slice(-MASTERY_SAMPLE_SIZE).map(resultScore)),
    });
  }

  const wordItems = [
    ...Object.entries(dysgraphia.twoLetterWords || {}),
    ...Object.entries(dysgraphia.threeLetterWords || {}),
  ].map(([id, item]) => ({ id, ...item }));
  const difficultWords = wordItems
    .filter((item) => {
      const total = Number(item.totalAttempts || 0);
      return total >= 2 && (Number(item.wrongAttempts || 0) >= 2
        || Number(item.correctAttempts || 0) / total < 0.7
        || Number(item.averageConfidence || 0) < 0.7);
    })
    .sort((left, right) => Number(left.averageConfidence || 0) - Number(right.averageConfidence || 0));
  const wordNormalResults = wordItems.flatMap((item) => item.recentResults || []);
  const wordRecent = mergeRelevantResults(wordNormalResults, interventions.wordWriting.recentResults);
  const wordRecentWeak = wordRecent.slice(-MASTERY_SAMPLE_SIZE).length >= MASTERY_SAMPLE_SIZE
    && average(wordRecent.slice(-MASTERY_SAMPLE_SIZE).map(resultScore)) < 0.7;
  if ((difficultWords.length > 0 && !hasRecentMastery(wordRecent)) || wordRecentWeak) {
    weaknesses.push({
      id: "word-writing",
      type: "word_writing",
      label: "වචන නිවැරදිව ලිවීම",
      targetWord: difficultWords[0]?.targetWord || null,
      recentAverage: average(wordRecent.slice(-MASTERY_SAMPLE_SIZE).map(resultScore)),
    });
  }

  Object.entries(dysgraphia.letterTracing || {}).forEach(([letterId, item]) => {
    const mastery = letterMastery[letterId];
    if (mastery?.needsPractice) {
      weaknesses.push({
        id: `letter-writing:${letterId}`,
        type: "letter_writing",
        label: `“${item.targetChar || letterId}” අකුර නිවැරදිව ලිවීම`,
        targetLetterId: letterId,
        targetLetter: item.targetChar || null,
        totalAttempts: mastery.totalAttempts,
        correctAttempts: mastery.correctAttempts,
        accuracy: mastery.overallAccuracy,
        averageConfidence: Number(item.averageConfidence || 0),
        recentAverage: mastery.recentAccuracy,
        masteryScore: mastery.masteryScore,
        status: mastery.status,
      });
    }
  });

  const recommendedInterventions = weaknesses.map((weakness) => {
    if (weakness.type === "mirror_reversal") {
      return {
        id: "mirror-letter-drag",
        weaknessId: weakness.id,
        gameType: "mirror-letter-drag",
        title: "කැඩපත් අකුරු ක්‍රීඩාව",
        description: "හරි අකුරු හඳුනාගෙන ඇදගෙන යමු",
        route: `/dysgraphia/mirror-letter-drag/${weakness.targetLetterId || "ta"}`,
        targetLetterId: weakness.targetLetterId,
        targetLetter: weakness.targetLetter,
      };
    }
    if (weakness.type === "word_writing") {
      return {
        id: "dotted-word-tracing",
        weaknessId: weakness.id,
        gameType: "dotted-word-tracing",
        title: "තිත් උඩින් වචන ලියමු",
        description: weakness.targetWord ? `“${weakness.targetWord}” වචනයෙන් පුහුණු වෙමු` : "තිත් වචන හඹාගෙන ලියමු",
        route: weakness.targetWord
          ? `/dysgraphia/word-game/dotted-tracing?word=${encodeURIComponent(weakness.targetWord)}`
          : "/dysgraphia/word-game/dotted-tracing",
        targetWord: weakness.targetWord,
      };
    }
    return {
      id: `node-letter-challenge:${weakness.targetLetterId}`,
      weaknessId: weakness.id,
      gameType: "node-letter-challenge",
      title: "තිත් අකුරු ක්‍රීඩාව",
      description: `“${weakness.targetLetter || ""}” අකුර පුහුණු කරමු`,
      route: `/dysgraphia/node-letter-challenge/${weakness.targetLetterId}`,
      targetLetterId: weakness.targetLetterId,
      targetLetter: weakness.targetLetter,
    };
  });

  return {
    currentWeaknesses: weaknesses,
    recommendedInterventions,
    masteryRule: {
      minimumLetterAttempts: MIN_LETTER_ATTEMPTS,
      sampleSize: MASTERY_SAMPLE_SIZE,
      masteryThreshold: MASTERY_THRESHOLD,
      weaknessThreshold: WEAKNESS_THRESHOLD,
      relapseSampleSize: RELAPSE_SAMPLE_SIZE,
    },
  };
}

function applySessionProgress(summary, session) {
  const nextSummary = ensureSummary(summary);
  nextSummary.stats.totalMinutesSpent += Number(session.durationMinutes || 0);
  nextSummary.stats.sessionsCompleted += 1;
  nextSummary.stats.lastSessionDate = session.endedAt;
  nextSummary.recentSessions = [session, ...(nextSummary.recentSessions || [])].slice(0, 30);
  return recalculateSummary(nextSummary);
}

function buildOverview(summary, recentLimit = 5) {
  const currentSummary = ensureSummary(summary);
  const catalog = getCatalog();
  const letterMastery = buildLetterMastery(currentSummary);
  const dysgraphia = clone(currentSummary.dysgraphia);
  Object.entries(dysgraphia.letterTracing).forEach(([letterId, item]) => {
    const mastery = letterMastery[letterId];
    dysgraphia.letterTracing[letterId] = {
      ...item,
      accuracy: mastery.overallAccuracy,
      recentAccuracy: mastery.recentAccuracy,
      masteryScore: mastery.masteryScore,
      masteryStatus: mastery.status,
      needsPractice: mastery.needsPractice,
      mastery: mastery.evidence,
    };
  });
  return {
    module: "dysgraphia",
    catalogVersion: currentSummary.catalogVersion,
    catalogTotals: catalog.counts,
    progress: {
      letters: currentSummary.letters,
      words: currentSummary.words,
      shapes: currentSummary.shapes,
    },
    dysgraphia,
    stats: currentSummary.stats,
    achievements: currentSummary.achievements,
    insights: buildLearningInsights(currentSummary, letterMastery),
    recentSessions: currentSummary.recentSessions.slice(0, recentLimit),
    createdAt: currentSummary.createdAt,
    updatedAt: currentSummary.updatedAt,
  };
}

module.exports = {
  applyInterventionProgress,
  applyLetterProgress,
  applyLetterPracticeProgress,
  applyMirrorLetterProgress,
  applySessionProgress,
  applyShapeProgress,
  applyWordProgress,
  applyWritingLineProgress,
  buildOverview,
  buildLearningInsights,
  createEmptySummary,
  ensureSummary,
  recalculateSummary,
};
