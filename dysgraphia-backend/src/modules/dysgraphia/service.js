const env = require("../../config/env");
const { AppError } = require("../../utils/appError");
const { findLetter, findShape, findWord, getCatalog } = require("./catalog");
const {
  applyInterventionProgress,
  applyLetterProgress,
  applyLetterPracticeProgress,
  applyMirrorLetterProgress,
  applySessionProgress,
  applyShapeProgress,
  applyWordProgress,
  applyWritingLineProgress,
  buildOverview,
  createEmptySummary,
  ensureSummary,
} = require("./progressMapper");

function scoreShapeAttempt(coverage) {
  if (coverage > 85) return 3;
  if (coverage > 60) return 2;
  if (coverage > 50) return 1;
  return 0;
}

function validateIsoDate(value, fieldName) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new AppError(400, "VALIDATION_ERROR", `${fieldName} must be a valid ISO date.`);
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFE0F]/g, "")
    .trim();
}


function evaluateLetterPrediction(
  prediction,
  expectedLetter,
  threshold = env.confidenceThreshold
) {

  const normalizedExpected = normalizeText(expectedLetter ?? "");

  const predictions = Array.isArray(prediction?.predictions)
    ? prediction.predictions
    : [];

  const matchedPrediction = predictions.find(
    (item) =>
      normalizeText(item.predicted ?? "") === normalizedExpected
  );


  const selectedPrediction = matchedPrediction || predictions[0];


  const normalizedPrediction = normalizeText(
    selectedPrediction?.predicted ?? prediction?.predicted ?? ""
  );


  const confidence = Number(
    selectedPrediction?.confidence ?? prediction?.confidence ?? 0
  );


  const isCharacterMatch =
    normalizedPrediction === normalizedExpected;


  const meetsThreshold =
    Number.isFinite(confidence) &&
    confidence >= Number(threshold || 0.3);


  return {
    predictedLetter: normalizedPrediction,
    confidence,
    expectedLetter: normalizedExpected,

    // true if expected letter was found and confidence is enough
    isCorrect: isCharacterMatch && meetsThreshold,

    // optional debugging information
    matchedFromCandidates: Boolean(matchedPrediction),
  };
}

function evaluateWordPrediction(
  prediction,
  expectedWord,
  expectedLength,
  threshold = env.confidenceThreshold
) {
  const normalizedExpected = normalizeText(expectedWord ?? "");
  const predictedWord = normalizeText(prediction?.predictedWord ?? "");
  const predictedLetters = Array.isArray(prediction?.predictedLetters)
    ? prediction.predictedLetters.map((value) => normalizeText(value)).filter(Boolean)
    : [];

  const normalizedPrediction = normalizeText(predictedWord || predictedLetters.join(""));
  const normalizedPredictedLetters = normalizedPrediction ? Array.from(normalizedPrediction) : [];

  const confidences = Array.isArray(prediction?.confidences)
    ? prediction.confidences
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
    : [];

  const confidence = confidences.length
    ? confidences.reduce((total, value) => total + value, 0) / confidences.length
    : Number(prediction?.confidence ?? 0);

  const isWordMatch = normalizedPrediction === normalizedExpected;
  const hasExpectedLength =
    Number.isFinite(Number(expectedLength))
      ? Array.from(normalizedPrediction).length === Number(expectedLength)
      : true;

  const meetsThreshold =
    Number.isFinite(confidence) &&
    confidence >= Number(threshold || 0.3);

  return {
    predictedWord: normalizedPrediction,
    predictedLetters: normalizedPredictedLetters,
    confidences: confidences.length ? confidences : normalizedPredictedLetters.map(() => confidence),
    confidence,
    expectedWord: normalizedExpected,
    isCorrect: isWordMatch && hasExpectedLength && meetsThreshold,
  };
}

function getLetterStarsForStrokeCount(strokeCount) {
  const count = Number(strokeCount);
  if (!Number.isFinite(count)) return 3;
  if (count <= 2) return 3;
  if (count <= 4) return 2;
  return 1;
}

const MAX_STRIKES_ALLOWED = 1;
const OUT_OF_LINES_STRIKE_PCT = 10;
const OUT_OF_LINES_HARD_FAIL_PCT = 25;
const LETTER_BIG_RATIO = 1.5;
const LETTER_SMALL_RATIO = 0.7;

function classifyLetterSizes(targetWord, sizes) {
  if (!Array.isArray(sizes) || sizes.length === 0) return [];

  const validSizes = sizes.filter(
    (size) => Number(size?.width) > 0 && Number(size?.height) > 0
  );
  if (validSizes.length === 0) return [];

  const averageWidth =
    validSizes.reduce((total, size) => total + Number(size.width), 0) / validSizes.length;
  const averageHeight =
    validSizes.reduce((total, size) => total + Number(size.height), 0) / validSizes.length;
  const letters = Array.from(normalizeText(targetWord));

  return sizes.map((size, index) => {
    const width = Number(size?.width);
    const height = Number(size?.height);
    const widthRatio = width > 0 ? width / averageWidth : 1;
    const heightRatio = height > 0 ? height / averageHeight : 1;
    const ratio =
      Math.abs(heightRatio - 1) >= Math.abs(widthRatio - 1) ? heightRatio : widthRatio;
    const status = ratio > LETTER_BIG_RATIO
      ? "big"
      : ratio < LETTER_SMALL_RATIO
        ? "small"
        : "ok";

    return {
      index,
      letter: letters[index] || null,
      width,
      height,
      widthRatio: Math.round(widthRatio * 100) / 100,
      heightRatio: Math.round(heightRatio * 100) / 100,
      ratio: Math.round(ratio * 100) / 100,
      status,
    };
  });
}

function createTimer(flow, uid) {
  const prefix = `[dysgraphia:${flow}:${uid}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}]`;
  return {
    async measure(name, operation) {
      const label = `${prefix} ${name}`;
      console.time(label);
      try {
        return await operation();
      } finally {
        console.timeEnd(label);
      }
    },
    measureSync(name, operation) {
      const label = `${prefix} ${name}`;
      console.time(label);
      try {
        return operation();
      } finally {
        console.timeEnd(label);
      }
    },
  };
}

function createDysgraphiaService({
  repository,
  predictor,
  now = () => new Date().toISOString(),
  allowDevReset = env.allowDevReset,
}) {
  async function predictHandwritingLetter(file) {
    const timer = createTimer("prediction-only-letter", "no-persistence");
    const prediction = await timer.measure("ML_PREDICTION", () =>
      predictor.predictSingleCharacter(file.buffer)
    );
    return {
      predicted: prediction.predicted,
      confidence: prediction.confidence,
      predictions: prediction.predictions || [],
      candidates: prediction.candidates || [],
    };
  }

  async function getOrCreateSummary(uid) {
    const current = await repository.getSummary(uid);
    if (current) {
      return ensureSummary(current);
    }

    const emptySummary = createEmptySummary(now());
    await repository.saveSummary(uid, emptySummary);
    return emptySummary;
  }

  async function getCatalogResponse() {
    return getCatalog();
  }

  async function getOverview(uid, recentLimit = 5) {
    const summary = await getOrCreateSummary(uid);
    const recentSessions = await repository.listRecentSessions(uid, recentLimit);
    const nextSummary = ensureSummary({
      ...summary,
      recentSessions,
    });
    return buildOverview(nextSummary, recentLimit);
  }

  async function submitShapeAttempt(uid, payload) {
    const shape = findShape(payload.shapeId);
    if (!shape) {
      throw new AppError(404, "ITEM_NOT_FOUND", "Unknown shapeId.");
    }

    const attemptedAt = now();
    const starsEarned = scoreShapeAttempt(payload.coverage);
    const currentSummary = await getOrCreateSummary(uid);
    const nextSummary = applyShapeProgress(currentSummary, {
      ...payload,
      attemptedAt,
      starsEarned,
    });
    nextSummary.updatedAt = attemptedAt;

    const attemptId = await repository.createAttempt(uid, {
      type: "shape",
      shapeId: payload.shapeId,
      coverage: payload.coverage,
      strayRatio: payload.strayRatio,
      starsEarned,
      durationSeconds: payload.durationSeconds,
      clientMetrics: payload.clientMetrics || null,
      createdAt: attemptedAt,
    });
    await repository.saveSummary(uid, nextSummary);

    return {
      attemptId,
      itemProgress: nextSummary.shapes.itemProgress[payload.shapeId],
      overviewSummary: buildOverview(nextSummary),
    };
  }

  async function submitLetterAttempt(uid, payload, file) {
    const timer = createTimer("letter", uid);
    const letter = findLetter(payload.letterId);
    if (!letter) {
      throw new AppError(404, "ITEM_NOT_FOUND", "Unknown letterId.");
    }

    if (payload.targetChar !== letter.targetChar) {
      throw new AppError(400, "VALIDATION_ERROR", "targetChar does not match the server catalog.");
    }

    const attemptedAt = now();
    const currentSummary = await timer.measure("FIRESTORE_SUMMARY_READ", () => getOrCreateSummary(uid));

    try {
      const prediction = await timer.measure("ML_PREDICTION", () =>
        predictor.predictSingleCharacter(file.buffer)
      );
      const evaluation = evaluateLetterPrediction(prediction, letter.targetChar);
      const isCorrect = evaluation.isCorrect;
      const starsEarned = isCorrect ? getLetterStarsForStrokeCount(payload.strokeCount) : 0;
      const nextSummary = timer.measureSync("APPLY_LETTER_PROGRESS", () => applyLetterProgress(currentSummary, {
        ...payload,
        attemptedAt,
        predicted: evaluation.predictedLetter,
        confidence: evaluation.confidence,
        expectedLetter: evaluation.expectedLetter,
        isCorrect,
        starsEarned,
        levelId: letter.levelId,
      }));
      nextSummary.updatedAt = attemptedAt;

      const attemptId = await timer.measure("FIRESTORE_ATTEMPT_WRITE", () => repository.createAttempt(uid, {
        type: "letter",
        letterId: letter.id,
        levelId: letter.levelId,
        targetChar: letter.targetChar,
        mode: payload.mode,
        predicted: evaluation.predictedLetter,
        confidence: evaluation.confidence,
        expectedLetter: evaluation.expectedLetter,
        rawPrediction: prediction.rawPrediction,
        isCorrect,
        starsEarned,
        durationSeconds: payload.durationSeconds,
        timerSeconds: payload.timerSeconds ?? payload.durationSeconds,
        eraseCount: payload.eraseCount || 0,
        attemptNumber: payload.attemptNumber || 1,
        wrongAttempt: !isCorrect,
        wrongAttempts: Number(payload.wrongAttempts || 0) + (!isCorrect ? 1 : 0),
        choiceWrongAttempts: Number(payload.choiceWrongAttempts || 0),
        createdAt: attemptedAt,
      }));
      await timer.measure("FIRESTORE_SUMMARY_WRITE", () => repository.saveSummary(uid, nextSummary));

      const overviewSummary = timer.measureSync("BUILD_OVERVIEW", () => buildOverview(nextSummary));

      return {
        attemptId,
        predicted: evaluation.predictedLetter,
        confidence: evaluation.confidence,
        expectedLetter: evaluation.expectedLetter,
        isCorrect,
        starsEarned,
        itemProgress: nextSummary.letters[letter.levelId].itemProgress[letter.id],
        overviewSummary,
      };
    } catch (error) {
      const nextSummary = timer.measureSync("APPLY_LETTER_PROGRESS_FAILED", () => applyLetterProgress(currentSummary, {
        ...payload,
        attemptedAt,
        predicted: null,
        confidence: 0,
        expectedLetter: letter.targetChar,
        isCorrect: false,
        starsEarned: 0,
        levelId: letter.levelId,
        failureReason: error.errorCode || "PREDICTION_FAILED",
      }));
      nextSummary.updatedAt = attemptedAt;
      const attemptId = await timer.measure("FIRESTORE_ATTEMPT_WRITE_FAILED", () => repository.createAttempt(uid, {
        type: "letter",
        letterId: letter.id,
        levelId: letter.levelId,
        targetChar: letter.targetChar,
        mode: payload.mode,
        predicted: null,
        confidence: 0,
        expectedLetter: letter.targetChar,
        rawPrediction: null,
        isCorrect: false,
        starsEarned: 0,
        failureReason: error.errorCode || "PREDICTION_FAILED",
        durationSeconds: payload.durationSeconds,
        timerSeconds: payload.timerSeconds ?? payload.durationSeconds,
        eraseCount: payload.eraseCount || 0,
        attemptNumber: payload.attemptNumber || 1,
        wrongAttempt: true,
        wrongAttempts: Number(payload.wrongAttempts || 0) + 1,
        choiceWrongAttempts: Number(payload.choiceWrongAttempts || 0),
        createdAt: attemptedAt,
      }));
      await timer.measure("FIRESTORE_SUMMARY_WRITE_FAILED", () => repository.saveSummary(uid, nextSummary));

      const overviewSummary = timer.measureSync("BUILD_OVERVIEW_FAILED", () => buildOverview(nextSummary));

      throw new AppError(422, "PREDICTION_FAILED", "Unable to evaluate handwriting for this image.", {
        meta: {
          attemptId,
          itemProgress: nextSummary.letters[letter.levelId].itemProgress[letter.id],
          overviewSummary,
        },
        cause: error,
      });
    }
  }

  async function submitInterventionAttempt(uid, payload) {
    const attemptedAt = now();
    const currentSummary = await getOrCreateSummary(uid);
    const previousTotalStars = Number(currentSummary.stats?.totalStars || 0);
    const alreadyProcessed = currentSummary.dysgraphia?.interventions?.processedCompletionIds
      ?.includes(payload.completionId);
    if (alreadyProcessed) {
      return {
        duplicate: true,
        overviewSummary: buildOverview(currentSummary),
      };
    }

    if (payload.targetLetterId) {
      const letter = findLetter(payload.targetLetterId);
      if (!letter || (payload.targetLetter && payload.targetLetter !== letter.targetChar)) {
        throw new AppError(400, "VALIDATION_ERROR", "Target letter does not match the server catalog.");
      }
    }

    const accuracy = payload.accuracy ?? (payload.score != null ? payload.score / 100 : payload.correct ? 1 : 0);
    const performanceScore = Math.max(0, Math.min(1, Number(accuracy || 0)));
    const result = {
      ...payload,
      accuracy: performanceScore,
      performanceScore,
      attemptedAt,
    };
    const nextSummary = applyInterventionProgress(currentSummary, result);
    nextSummary.updatedAt = attemptedAt;
    const attemptId = await repository.createAttempt(uid, {
      type: "intervention",
      ...result,
      createdAt: attemptedAt,
    });
    await repository.saveSummary(uid, nextSummary);

    return {
      attemptId,
      duplicate: false,
      starsEarned: payload.starsEarned,
      starsAdded: Math.max(0, Number(nextSummary.stats?.totalStars || 0) - previousTotalStars),
      result: {
        gameType: result.gameType,
        targetLetterId: result.targetLetterId || null,
        targetLetter: result.targetLetter || null,
        targetWord: result.targetWord || null,
        correct: result.correct,
        score: result.score ?? null,
        accuracy: result.accuracy,
        attempts: result.attempts,
        mistakes: result.mistakes,
        completed: result.completed,
        durationSeconds: result.durationSeconds,
        timestamp: attemptedAt,
      },
      overviewSummary: buildOverview(nextSummary),
    };
  }

  async function submitLetterPracticeAttempt(uid, payload) {
    const letter = findLetter(payload.letterId);
    if (!letter) {
      throw new AppError(404, "ITEM_NOT_FOUND", "Unknown letterId.");
    }

    const attemptedAt = now();
    const currentSummary = await getOrCreateSummary(uid);
    const previousTotalStars = Number(currentSummary.stats?.totalStars || 0);
    const practicePayload = {
      ...payload,
      targetChar: letter.targetChar,
      levelId: letter.levelId,
      attemptedAt,
    };
    const nextSummary = applyLetterPracticeProgress(currentSummary, practicePayload);
    nextSummary.updatedAt = attemptedAt;
    // Persist the authoritative total first. Attempt metadata is an audit
    // record and must never prevent an earned reward from being saved.
    await repository.saveSummary(uid, nextSummary);
    const attemptId = await repository.createAttempt(uid, {
      type: "letter-practice",
      ...practicePayload,
      breakCount: practicePayload.breakCount ?? null,
      attemptNumber: practicePayload.attemptNumber ?? 1,
      additionalNodesDisplayed: practicePayload.additionalNodesDisplayed ?? false,
      createdAt: attemptedAt,
    });
    return {
      attemptId,
      starsEarned: payload.starsEarned,
      starsAdded: Math.max(0, Number(nextSummary.stats?.totalStars || 0) - previousTotalStars),
      itemProgress: nextSummary.letters[letter.levelId].itemProgress[letter.id],
      overviewSummary: buildOverview(nextSummary),
    };
  }

  async function submitMirrorLetterAttempt(uid, payload, file) {
    const letter = findLetter(payload.letterId);
    if (!letter) {
      throw new AppError(404, "ITEM_NOT_FOUND", "Unknown letterId.");
    }
    if (payload.targetChar !== letter.targetChar) {
      throw new AppError(400, "VALIDATION_ERROR", "targetChar does not match the server catalog.");
    }

    const attemptedAt = now();
    let drawingPayload = payload;
    if (file?.buffer && typeof payload.drawingCorrect !== "boolean") {
      const prediction = await predictor.predictSingleCharacter(file.buffer);
      const evaluation = evaluateLetterPrediction(prediction, letter.targetChar);
      drawingPayload = {
        ...payload,
        drawingCorrect: evaluation.isCorrect,
        predictedLetter: evaluation.predictedLetter,
        confidence: evaluation.confidence,
      };
    }
    const currentSummary = await getOrCreateSummary(uid);
    const previousTotalStars = Number(currentSummary.stats?.totalStars || 0);
    const nextSummary = applyMirrorLetterProgress(currentSummary, {
      ...drawingPayload,
      attemptedAt,
      starsEarned: drawingPayload.drawingCorrect === true ? 3 : 0,
    });
    nextSummary.updatedAt = attemptedAt;

    const attemptId = await repository.createAttempt(uid, {
      type: "mirror-letter",
      letterId: letter.id,
      targetChar: letter.targetChar,
      wrongAttempts: payload.wrongAttempts,
      correctAttempts: payload.correctAttempts,
      totalAttempts: payload.totalAttempts,
      completed: payload.completed,
      drawingCorrect: drawingPayload.drawingCorrect,
      predictedLetter: drawingPayload.predictedLetter || null,
      confidence: drawingPayload.confidence,
      drawingDurationSeconds: drawingPayload.drawingDurationSeconds,
      drawingEraseCount: drawingPayload.drawingEraseCount,
      createdAt: attemptedAt,
    });
    await repository.saveSummary(uid, nextSummary);

    return {
      attemptId,
      drawingCorrect: drawingPayload.drawingCorrect,
      predictedLetter: drawingPayload.predictedLetter || null,
      confidence: drawingPayload.confidence ?? null,
      isCorrect: drawingPayload.drawingCorrect ?? null,
      starsEarned: drawingPayload.drawingCorrect === true ? 3 : 0,
      starsAdded: Math.max(0, Number(nextSummary.stats?.totalStars || 0) - previousTotalStars),
      mirrorProgress: nextSummary.dysgraphia.mirrorLetters[letter.id],
      overviewSummary: buildOverview(nextSummary),
    };
  }

  async function submitWordAttempt(uid, payload, file) {
    const timer = createTimer("word", uid);
    const word = findWord(payload.group, payload.wordId);
    if (!word) {
      throw new AppError(404, "ITEM_NOT_FOUND", "Unknown wordId.");
    }

    if (payload.targetWord !== word.targetWord) {
      throw new AppError(400, "VALIDATION_ERROR", "targetWord does not match the server catalog.");
    }

    if (payload.expectedLength !== word.expectedLength) {
      throw new AppError(400, "VALIDATION_ERROR", "expectedLength does not match the server catalog.");
    }

    const attemptedAt = now();
    const currentSummary = await timer.measure("FIRESTORE_SUMMARY_READ", () => getOrCreateSummary(uid));
    const prediction = payload.predictedWord || payload.predictedLetters
      ? {
          predictedWord: payload.predictedWord,
          predictedLetters: payload.predictedLetters,
          confidences: payload.confidences,
          segmentation: {
            spacing: payload.spacing || [],
            sizes: payload.sizes || [],
          },
          failureReason: null,
        }
      : await timer.measure("ML_PREDICTION", () =>
          predictor.predictWord(file.buffer, payload.expectedLength)
        );
    const evaluation = evaluateWordPrediction(prediction, word.targetWord, payload.expectedLength);
    const isCorrect = evaluation.isCorrect;
    const attemptNumber = Number(payload.attemptNumber || 1);
    const starsEarned = isCorrect
      ? attemptNumber <= 2
        ? 3
        : attemptNumber <= 4
          ? 2
          : 1
      : 0;
    const nextSummary = timer.measureSync("APPLY_WORD_PROGRESS", () => applyWordProgress(currentSummary, {
      ...payload,
      attemptedAt,
      predictedLetters: evaluation.predictedLetters,
      predictedWord: evaluation.predictedWord,
      confidences: evaluation.confidences,
      segmentation: prediction.segmentation,
      isCorrect,
      starsEarned,
      failureReason: prediction.failureReason,
    }));
    nextSummary.updatedAt = attemptedAt;

    const attemptId = await timer.measure("FIRESTORE_ATTEMPT_WRITE", () => repository.createAttempt(uid, {
      type: "word",
      group: payload.group,
      wordId: word.id,
      targetWord: word.targetWord,
      expectedLength: payload.expectedLength,
      attemptNumber,
      predictedLetters: evaluation.predictedLetters,
      predictedWord: evaluation.predictedWord,
      confidences: evaluation.confidences,
      segmentation: prediction.segmentation,
      isCorrect,
      starsEarned,
      failureReason: prediction.failureReason,
      durationSeconds: payload.durationSeconds,
      createdAt: attemptedAt,
    }));
    await timer.measure("FIRESTORE_SUMMARY_WRITE", () => repository.saveSummary(uid, nextSummary));

    const overviewSummary = timer.measureSync("BUILD_OVERVIEW", () => buildOverview(nextSummary));

    if (prediction.failureReason) {
      throw new AppError(422, prediction.failureReason, "Unable to evaluate handwriting for this image.", {
        meta: {
          attemptId,
          failureReason: prediction.failureReason,
          itemProgress: nextSummary.words[payload.group].itemProgress[word.id],
          overviewSummary,
        },
      });
    }

    return {
      attemptId,
      predictedLetters: evaluation.predictedLetters,
      predictedWord: evaluation.predictedWord,
      expectedWord: evaluation.expectedWord,
      confidence: evaluation.confidence,
      isCorrect,
      attemptNumber,
      starsEarned,
      failureReason: prediction.failureReason,
      itemProgress: nextSummary.words[payload.group].itemProgress[word.id],
      overviewSummary,
    };
  }

  async function createSession(uid, payload) {
    const timer = createTimer("session", uid);
    validateIsoDate(payload.startedAt, "startedAt");
    validateIsoDate(payload.endedAt, "endedAt");

    const session = {
      activityType: payload.activityType,
      startedAt: payload.startedAt,
      endedAt: payload.endedAt,
      durationMinutes: payload.durationMinutes,
      itemsCompleted: payload.itemsCompleted,
      starsEarned: payload.starsEarned,
      itemIds: payload.itemIds || [],
    };

    const currentSummary = await timer.measure("FIRESTORE_SUMMARY_READ", () => getOrCreateSummary(uid));
    const sessionId = await timer.measure("FIRESTORE_SESSION_WRITE", () => repository.createSession(uid, session));
    const nextSummary = timer.measureSync("APPLY_SESSION_PROGRESS", () => applySessionProgress(currentSummary, {
      ...session,
      sessionId,
    }));
    nextSummary.updatedAt = now();
    await timer.measure("FIRESTORE_SUMMARY_WRITE", () => repository.saveSummary(uid, nextSummary));

    return {
      sessionId,
      stats: nextSummary.stats,
      recentSessions: nextSummary.recentSessions.slice(0, 5),
    };
  }

  async function getRecentActivity(uid, limit = 5) {
    return repository.listRecentSessions(uid, limit);
  }

  async function resetProgress(requestUser) {
    const isAdmin = requestUser?.role === "admin";
    if (!isAdmin && !allowDevReset) {
      throw new AppError(403, "FORBIDDEN", "Only admins can reset dysgraphia progress.");
    }

    await repository.resetUserProgress(requestUser.uid);
    const summary = createEmptySummary(now());
    await repository.saveSummary(requestUser.uid, summary);
    return buildOverview(summary);
  }

  async function submitWritingLineAttempt(uid, payload, file) {
    const word = findWord(payload.group, payload.wordId);
    if (!word) {
      throw new AppError(404, "ITEM_NOT_FOUND", "Unknown wordId.");
    }
    if (payload.targetWord !== word.targetWord) {
      throw new AppError(400, "VALIDATION_ERROR", "targetWord does not match the server catalog.");
    }
    if (payload.expectedLength !== word.expectedLength) {
      throw new AppError(400, "VALIDATION_ERROR", "expectedLength does not match the server catalog.");
    }

    const attemptedAt = now();
    const currentSummary = await getOrCreateSummary(uid);

    // Use client-supplied prediction or run server-side ML
    const prediction =
      payload.predictedWord || payload.predictedLetters
        ? {
            predictedWord: payload.predictedWord,
            predictedLetters: payload.predictedLetters,
            confidences: payload.confidences,
            segmentation: payload.segmentation || null,
            failureReason: null,
          }
        : await predictor.predictWord(file.buffer, payload.expectedLength);

    const evaluation = evaluateWordPrediction(prediction, word.targetWord, payload.expectedLength);
    const isCorrect = evaluation.isCorrect;
    const outOfLinesPct = Number(payload.outOfLinesPct || 0);
    const hardLinesFail = outOfLinesPct > OUT_OF_LINES_HARD_FAIL_PCT;
    const linesFail = outOfLinesPct > OUT_OF_LINES_STRIKE_PCT;
    const letterSizeDetails = classifyLetterSizes(
      word.targetWord,
      prediction.segmentation?.sizes || payload.segmentation?.sizes
    );
    const bigLetters = letterSizeDetails
      .filter((detail) => detail.status === "big")
      .map((detail) => detail.letter);
    const smallLetters = letterSizeDetails
      .filter((detail) => detail.status === "small")
      .map((detail) => detail.letter);
    const sizeFail = letterSizeDetails.length > 0
      ? bigLetters.length > 0 || smallLetters.length > 0
      : Boolean(payload.sizeFail);
    const spacingFail = Boolean(payload.spacingFail);
    const strikeCount = [linesFail, sizeFail, spacingFail].filter(Boolean).length;
    const passed = isCorrect && !hardLinesFail && strikeCount <= MAX_STRIKES_ALLOWED;

    // Stars: word must be correct, then penalised by how far writing strayed
    let starsEarned = 0;
    if (isCorrect) {
      if (outOfLinesPct < 10) starsEarned = 3;
      else if (outOfLinesPct < 30) starsEarned = 2;
      else starsEarned = 1;
    }

    const nextSummary = applyWritingLineProgress(currentSummary, {
      ...payload,
      attemptedAt,
      predictedLetters: evaluation.predictedLetters,
      predictedWord: evaluation.predictedWord,
      confidences: evaluation.confidences,
      isCorrect,
      passed,
      strikeCount,
      hardLinesFail,
      linesFail,
      sizeFail,
      letterSizeDetails,
      bigLetters,
      smallLetters,
      spacingFail,
      starsEarned,
      failureReason: prediction.failureReason,
    });
    nextSummary.updatedAt = attemptedAt;

    const attemptId = await repository.createAttempt(uid, {
      type: "writing-lines",
      group: payload.group,
      wordId: word.id,
      targetWord: word.targetWord,
      expectedLength: payload.expectedLength,
      predictedLetters: evaluation.predictedLetters,
      predictedWord: evaluation.predictedWord,
      confidences: evaluation.confidences,
      segmentation: prediction.segmentation || null,
      outOfLinesPct,
      letterHeightRatio: payload.letterHeightRatio || null,
      isCorrect,
      passed,
      starsEarned,
      attemptNumber: payload.attemptNumber || 1,
      wrongAttempt: !isCorrect,
      wrongAttempts: Number(payload.wrongAttempts || 0) + (!isCorrect ? 1 : 0),
      strikeCount,
      hardLinesFail,
      linesFail,
      sizeFail,
      letterSizeDetails,
      bigLetters,
      smallLetters,
      spacingFail,
      failureReason: prediction.failureReason || null,
      durationSeconds: payload.durationSeconds,
      createdAt: attemptedAt,
    });
    await repository.saveSummary(uid, nextSummary);

    if (prediction.failureReason) {
      throw new AppError(422, prediction.failureReason, "Unable to evaluate handwriting for this image.", {
        meta: {
          attemptId,
          failureReason: prediction.failureReason,
          itemProgress: nextSummary.words.writingLines?.itemProgress[word.id],
          overviewSummary: buildOverview(nextSummary),
        },
      });
    }

    return {
      attemptId,
      predictedLetters: evaluation.predictedLetters,
      predictedWord: evaluation.predictedWord,
      expectedWord: evaluation.expectedWord,
      confidence: evaluation.confidence,
      isCorrect,
      passed,
      starsEarned,
      outOfLinesPct,
      letterHeightRatio: payload.letterHeightRatio || null,
      letterSizeDetails,
      bigLetters,
      smallLetters,
      itemProgress: nextSummary.words.writingLines?.itemProgress[word.id],
      overviewSummary: buildOverview(nextSummary),
    };
  }

  return {
    createSession,
    getCatalogResponse,
    getOverview,
    getRecentActivity,
    predictHandwritingLetter,
    resetProgress,
    submitMirrorLetterAttempt,
    submitLetterAttempt,
    submitLetterPracticeAttempt,
    submitShapeAttempt,
    submitInterventionAttempt,
    submitWordAttempt,
    submitWritingLineAttempt,
  };
}

module.exports = {
  classifyLetterSizes,
  createDysgraphiaService,
  scoreShapeAttempt,
};
