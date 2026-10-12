import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDysgraphiaRepository } from "../src/modules/dysgraphia/repository";
import { createDysgraphiaService, scoreShapeAttempt } from "../src/modules/dysgraphia/service";

describe("dysgraphia service", () => {
  let repository;
  let predictor;
  let service;

  beforeEach(() => {
    repository = createMemoryDysgraphiaRepository();
    repository.seedUserProfile("user-1", { role: "student" });
    predictor = {
      predictSingleCharacter: vi.fn(async () => ({
        predicted: "ට",
        confidence: 0.92,
        rawPrediction: { label: "ට" },
      })),
      predictWord: vi.fn(async () => ({
        predictedLetters: ["බ", "ට"],
        predictedWord: "බට",
        confidences: [0.9, 0.88],
        segmentation: { ranges: [{}, {}] },
        failureReason: null,
      })),
    };
    service = createDysgraphiaService({
      repository,
      predictor,
      now: () => "2026-06-03T10:00:00.000Z",
    });
  });

  it("builds the overview from the canonical catalog", async () => {
    const overview = await service.getOverview("user-1");

    expect(overview.catalogTotals.shapes).toBe(9);
    expect(overview.catalogTotals.letters.total).toBe(16);
    expect(overview.catalogTotals.words.twoLetters).toBe(8);
    expect(overview.catalogTotals.words.threeLetters).toBe(7);
  });

  it("uses the backend shape scoring thresholds", () => {
    expect(scoreShapeAttempt(86)).toBe(3);
    expect(scoreShapeAttempt(61)).toBe(2);
    expect(scoreShapeAttempt(51)).toBe(1);
    expect(scoreShapeAttempt(50)).toBe(0);
  });

  it("does not double-award stars for the same shape", async () => {
    await service.submitShapeAttempt("user-1", {
      shapeId: "circle",
      coverage: 86,
      strayRatio: 0.2,
      starsEarned: 0,
      durationSeconds: 15,
    });
    const secondAttempt = await service.submitShapeAttempt("user-1", {
      shapeId: "circle",
      coverage: 65,
      strayRatio: 0.3,
      starsEarned: 0,
      durationSeconds: 20,
    });

    expect(secondAttempt.itemProgress.stars).toBe(3);
    expect(secondAttempt.overviewSummary.stats.totalStars).toBe(3);
    expect(secondAttempt.itemProgress.attemptsCount).toBe(2);
  });

  it("persists letter attempts and keeps the best result", async () => {
    const correctAttempt = await service.submitLetterAttempt(
      "user-1",
      {
        letterId: "ta",
        targetChar: "ට",
        mode: "guided",
        durationSeconds: 12,
        eraseCount: 2,
      },
      { buffer: Buffer.from("image") }
    );

    predictor.predictSingleCharacter.mockResolvedValueOnce({
      predicted: "ර",
      confidence: 0.4,
      rawPrediction: { label: "ර" },
    });

    const incorrectAttempt = await service.submitLetterAttempt(
      "user-1",
      {
        letterId: "ta",
        targetChar: "ට",
        mode: "guided",
        durationSeconds: 12,
      },
      { buffer: Buffer.from("image") }
    );

    expect(correctAttempt.starsEarned).toBe(3);
    expect(incorrectAttempt.itemProgress.stars).toBe(3);
    expect(incorrectAttempt.itemProgress.attemptsCount).toBe(2);
    const summary = await repository.getSummary("user-1");
    expect(summary.dysgraphia.letterTracing.ta).toMatchObject({
      targetChar: "ට",
      totalAttempts: 2,
      wrongAttempts: 1,
      correctAttempts: 1,
      eraseCount: 2,
      totalTimeSeconds: 24,
      lastAttemptTimeSeconds: 12,
      completed: true,
    });
  });

  it("awards letter stars from the number of drawing strokes", async () => {
    const basePayload = {
      letterId: "ta",
      targetChar: "ට",
      mode: "independent",
      durationSeconds: 12,
    };

    const uninterrupted = await service.submitLetterAttempt(
      "user-1",
      { ...basePayload, strokeCount: 2 },
      { buffer: Buffer.from("image") }
    );
    const twoBreaks = await service.submitLetterAttempt(
      "user-1",
      { ...basePayload, strokeCount: 3 },
      { buffer: Buffer.from("image") }
    );
    const manyBreaks = await service.submitLetterAttempt(
      "user-1",
      { ...basePayload, strokeCount: 5 },
      { buffer: Buffer.from("image") }
    );

    expect(uninterrupted.starsEarned).toBe(3);
    expect(twoBreaks.starsEarned).toBe(2);
    expect(manyBreaks.starsEarned).toBe(1);
  });

  it("recommends, resolves, and can reopen a letter intervention from recent performance", async () => {
    let tick = 0;
    predictor.predictSingleCharacter.mockResolvedValue({
      predicted: "ර",
      confidence: 0.9,
      rawPrediction: { label: "ර" },
    });
    const dynamicService = createDysgraphiaService({
      repository,
      predictor,
      now: () => new Date(Date.UTC(2026, 5, 3, 10, 0, tick++)).toISOString(),
    });
    const letterPayload = {
      letterId: "ta",
      targetChar: "ට",
      mode: "independent",
      durationSeconds: 10,
      strokeCount: 2,
    };

    await dynamicService.submitLetterAttempt("user-1", letterPayload, { buffer: Buffer.from("image") });
    let result = await dynamicService.submitLetterAttempt("user-1", letterPayload, { buffer: Buffer.from("image") });
    expect(result.overviewSummary.insights.currentWeaknesses).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "letter_writing", targetLetterId: "ta" }),
    ]));
    expect(result.overviewSummary.insights.recommendedInterventions).toEqual(expect.arrayContaining([
      expect.objectContaining({ gameType: "node-letter-challenge", route: "/dysgraphia/node-letter-challenge/ta" }),
    ]));
    expect(result.overviewSummary.dysgraphia.letterTracing.ta).toMatchObject({
      needsPractice: true,
      masteryStatus: "needs_practice",
    });

    for (let index = 0; index < 3; index += 1) {
      result = await dynamicService.submitInterventionAttempt("user-1", {
        completionId: `node-master-${index}`,
        gameType: "node-letter-challenge",
        targetLetterId: "ta",
        targetLetter: "ට",
        correct: true,
        score: 100,
        accuracy: 1,
        attempts: 1,
        mistakes: 0,
        completed: true,
        durationSeconds: 20,
      });
    }
    expect(result.overviewSummary.insights.currentWeaknesses).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "letter_writing", targetLetterId: "ta" }),
    ]));
    expect(result.overviewSummary.dysgraphia.letterTracing.ta).toMatchObject({
      needsPractice: false,
      masteryStatus: "mastered",
    });

    result = await dynamicService.submitLetterAttempt("user-1", letterPayload, { buffer: Buffer.from("image") });
    expect(result.overviewSummary.dysgraphia.letterTracing.ta.needsPractice).toBe(false);

    for (let index = 0; index < 2; index += 1) {
      result = await dynamicService.submitLetterAttempt("user-1", letterPayload, { buffer: Buffer.from("image") });
    }
    expect(result.overviewSummary.insights.currentWeaknesses).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "letter_writing", targetLetterId: "ta" }),
    ]));
  });

  it("uses accuracy for letter weakness and maps 12/3 to the exact NodeLetterChallenge route", async () => {
    await service.getOverview("user-1");
    const summary = await repository.getSummary("user-1");
    summary.dysgraphia.letterTracing = {
      ta: {
        targetChar: "ට",
        totalAttempts: 6,
        correctAttempts: 1,
        wrongAttempts: 5,
        averageConfidence: 0.55,
      },
      ra: {
        targetChar: "ර",
        totalAttempts: 3,
        correctAttempts: 0,
        wrongAttempts: 3,
        averageConfidence: 0.2,
      },
      ya: {
        targetChar: "ය",
        totalAttempts: 12,
        correctAttempts: 3,
        wrongAttempts: 9,
        averageConfidence: 0.29,
      },
      u: {
        targetChar: "උ",
        totalAttempts: 1,
        correctAttempts: 0,
        wrongAttempts: 1,
        averageConfidence: 0.1,
      },
      ma: {
        targetChar: "ම",
        totalAttempts: 7,
        correctAttempts: 2,
        wrongAttempts: 5,
        averageConfidence: 0.29,
      },
    };
    await repository.saveSummary("user-1", summary);

    const overview = await service.getOverview("user-1");
    expect(overview.insights.currentWeaknesses).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetLetterId: "ta", totalAttempts: 6, correctAttempts: 1 }),
      expect.objectContaining({ targetLetterId: "ra", totalAttempts: 3, correctAttempts: 0 }),
      expect.objectContaining({ targetLetterId: "ya", totalAttempts: 12, correctAttempts: 3, accuracy: 0.25 }),
      expect.objectContaining({ targetLetterId: "u", totalAttempts: 1, correctAttempts: 0 }),
      expect.objectContaining({ targetLetterId: "ma", totalAttempts: 7, correctAttempts: 2, averageConfidence: 0.29 }),
    ]));
    expect(overview.insights.recommendedInterventions).toEqual(expect.arrayContaining([
      expect.objectContaining({ route: "/dysgraphia/node-letter-challenge/ta", targetLetter: "ට" }),
      expect.objectContaining({ route: "/dysgraphia/node-letter-challenge/ra", targetLetter: "ර" }),
      expect.objectContaining({ route: "/dysgraphia/node-letter-challenge/ya", targetLetter: "ය" }),
      expect.objectContaining({ route: "/dysgraphia/node-letter-challenge/u", targetLetter: "උ" }),
      expect.objectContaining({ route: "/dysgraphia/node-letter-challenge/ma", targetLetter: "ම" }),
    ]));
    expect(overview.dysgraphia.letterTracing.ya).toMatchObject({
      accuracy: 0.25,
      needsPractice: true,
      masteryStatus: "needs_practice",
    });
    expect(overview.dysgraphia.letterTracing.u).toMatchObject({
      needsPractice: true,
      masteryStatus: "needs_practice",
    });
    expect(overview.dysgraphia.letterTracing.ma.mastery.matchedWeaknessRules).toMatchObject({
      lowCorrectAndConfidenceInFiveToTen: true,
    });
  });

  it("does not persist the same intervention completion twice", async () => {
    const payload = {
      completionId: "dotted-session-word-1",
      gameType: "dotted-word-tracing",
      targetWord: "බට",
      correct: true,
      score: 100,
      accuracy: 1,
      attempts: 1,
      mistakes: 0,
      completed: true,
      durationSeconds: 12,
    };
    await service.submitInterventionAttempt("user-1", payload);
    const duplicate = await service.submitInterventionAttempt("user-1", payload);

    expect(duplicate.duplicate).toBe(true);
    expect(repository.debugGetAttempts("user-1").filter((attempt) => attempt.type === "intervention")).toHaveLength(1);
  });

  it("allows a non-admin reset only when development reset is explicitly enabled", async () => {
    const devResetService = createDysgraphiaService({
      repository,
      predictor,
      allowDevReset: true,
      now: () => "2026-06-03T10:00:00.000Z",
    });

    await expect(
      devResetService.resetProgress({ uid: "user-1", role: "student" })
    ).resolves.toMatchObject({
      stats: { totalStars: 0 },
    });
  });

  it("stores mirror-drag stars once per word and only adds a better replay score", async () => {
    const attempt = (completionId, targetWord, starsEarned) => service.submitInterventionAttempt("user-1", {
      completionId,
      gameType: "mirror-letter-drag",
      targetLetterId: "ta",
      targetWord,
      correct: true,
      score: 100,
      accuracy: 1,
      attempts: 3,
      mistakes: 0,
      completed: true,
      starsEarned,
      durationSeconds: 12,
    });

    const first = await attempt("mirror-round-first", "word-one", 2);
    const repeated = await attempt("mirror-round-repeat", "word-one", 2);
    const improved = await attempt("mirror-round-improved", "word-one", 3);
    const otherWord = await attempt("mirror-round-other", "word-two", 2);

    expect(first.starsAdded).toBe(2);
    expect(repeated.starsAdded).toBe(0);
    expect(improved.starsAdded).toBe(1);
    expect(otherWord.starsAdded).toBe(2);
    expect(otherWord.overviewSummary.stats.totalStars).toBe(5);
    expect((await service.getOverview("user-1")).stats.totalStars).toBe(5);
  });

  it("uses one saved total for all letter tasks and reports only newly added stars", async () => {
    const freeTrace = await service.submitLetterPracticeAttempt("user-1", {
      letterId: "ta",
      task: "free-trace",
      starsEarned: 3,
      breakCount: 0,
    });
    const guided = await service.submitLetterPracticeAttempt("user-1", {
      letterId: "ta",
      task: "guided",
      starsEarned: 2,
      attemptNumber: 2,
      additionalNodesDisplayed: true,
    });
    const repeatedGuided = await service.submitLetterPracticeAttempt("user-1", {
      letterId: "ta",
      task: "guided",
      starsEarned: 1,
      attemptNumber: 3,
      additionalNodesDisplayed: true,
    });

    expect(freeTrace.starsAdded).toBe(3);
    expect(guided.starsAdded).toBe(2);
    expect(guided.overviewSummary.stats.totalStars).toBe(5);
    expect(repeatedGuided.starsAdded).toBe(0);
    expect(repeatedGuided.overviewSummary.stats.totalStars).toBe(5);
    expect((await service.getOverview("user-1")).stats.totalStars).toBe(5);
    expect(repository.debugGetAttempts("user-1")[1]).toMatchObject({
      type: "letter-practice",
      task: "guided",
      breakCount: null,
      starsEarned: 2,
    });
  });

  it("marks low-confidence letter attempts as incorrect", async () => {
    predictor.predictSingleCharacter.mockResolvedValueOnce({
      predicted: "ට",
      confidence: -0.01,
      rawPrediction: { label: "ට" },
    });

    const result = await service.submitLetterAttempt(
      "user-1",
      {
        letterId: "ta",
        targetChar: "ට",
        mode: "guided",
        durationSeconds: 12,
      },
      { buffer: Buffer.from("image") }
    );

    expect(result.isCorrect).toBe(false);
    expect(result.expectedLetter).toBe("ට");
    expect(result.confidence).toBe(-0.01);
    expect(repository.debugGetAttempts("user-1")[0]).toMatchObject({
      wrongAttempt: true,
      wrongAttempts: 1,
      attemptNumber: 1,
    });
  });

  it("persists word attempts and updates progress", async () => {
    const result = await service.submitWordAttempt(
      "user-1",
      {
        group: "twoLetters",
        wordId: "bata",
        targetWord: "බට",
        expectedLength: 2,
        durationSeconds: 25,
      },
      { buffer: Buffer.from("word-image") }
    );

    expect(result.isCorrect).toBe(true);
    expect(result.starsEarned).toBe(3);
    expect(result.itemProgress.completed).toBe(true);
    expect(repository.debugGetAttempts("user-1")).toHaveLength(1);
    const summary = await repository.getSummary("user-1");
    expect(summary.dysgraphia.twoLetterWords.bata).toMatchObject({
      targetWord: "බට",
      totalAttempts: 1,
      correctAttempts: 1,
      wrongAttempts: 0,
      lastPredictedWord: "බට",
      lastConfidences: [0.9, 0.88],
      totalTimeSeconds: 25,
      completed: true,
    });
  });

  it("marks low-confidence word attempts as incorrect", async () => {
    predictor.predictWord.mockResolvedValueOnce({
      predictedLetters: ["බ", "ට"],
      predictedWord: "බට",
      confidences: [-0.01, -0.01],
      segmentation: { ranges: [{}, {}] },
      failureReason: null,
    });

    const result = await service.submitWordAttempt(
      "user-1",
      {
        group: "twoLetters",
        wordId: "bata",
        targetWord: "බට",
        expectedLength: 2,
        durationSeconds: 25,
      },
      { buffer: Buffer.from("word-image") }
    );

    expect(result.isCorrect).toBe(false);
    expect(result.starsEarned).toBe(0);
    expect(result.expectedWord).toBe("බට");
    expect(result.confidence).toBe(-0.01);
  });

  it("stores three-letter word progress under its own aggregate map", async () => {
    predictor.predictWord.mockResolvedValueOnce({
      predictedLetters: ["බ", "ස", "ය"],
      predictedWord: "බසය",
      confidences: [0.8, 0.85, 0.9],
      segmentation: { spacing: [10, 12], sizes: [] },
      failureReason: null,
    });

    await service.submitWordAttempt("user-1", {
      group: "threeLetters",
      wordId: "basaya",
      targetWord: "බසය",
      expectedLength: 3,
      durationSeconds: 20,
    }, { buffer: Buffer.from("word-image") });

    const summary = await repository.getSummary("user-1");
    expect(summary.dysgraphia.threeLetterWords.basaya).toMatchObject({
      targetWord: "බසය",
      totalAttempts: 1,
      correctAttempts: 1,
      completed: true,
      spacing: [10, 12],
    });
  });

  it("calculates writing-line passed status on the backend", async () => {
    const result = await service.submitWritingLineAttempt("user-1", {
      group: "writingLines",
      wordId: "bata",
      targetWord: "බට",
      expectedLength: 2,
      durationSeconds: 18,
      outOfLinesPct: 12,
      letterHeightRatio: 0.9,
      sizeFail: false,
      spacingFail: false,
      passed: true,
      predictedWord: "බට",
      predictedLetters: ["බ", "ට"],
      confidences: [0.9, 0.9],
      segmentation: {
        spacing: [14],
        sizes: [{ width: 40, height: 56 }, { width: 38, height: 58 }],
      },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.passed).toBe(true);
    expect(repository.debugGetAttempts("user-1")[0]).toMatchObject({
      isCorrect: true,
      passed: true,
      strikeCount: 1,
      hardLinesFail: false,
      durationSeconds: 18,
      segmentation: {
        spacing: [14],
      },
    });
    expect(repository.debugGetAttempts("user-1")[0].timerSeconds).toBeUndefined();
  });

  it("awards word stars by attempt number and persists the best total", async () => {
    const catalog = await service.getCatalogResponse();
    const word = catalog.words.twoLetters.items.find((item) => item.id === "bata");
    const payload = {
      group: "twoLetters",
      wordId: "bata",
      expectedLength: 2,
      durationSeconds: 10,
      confidences: [0.9, 0.88],
      targetWord: word.targetWord,
      predictedWord: word.targetWord,
      predictedLetters: Array.from(word.targetWord),
    };

    const firstTry = await service.submitWordAttempt("user-1", {
      ...payload,
      attemptNumber: 1,
    });
    const thirdTry = await service.submitWordAttempt("user-1", {
      ...payload,
      attemptNumber: 3,
    });
    const fifthTry = await service.submitWordAttempt("user-1", {
      ...payload,
      attemptNumber: 5,
    });

    expect(firstTry.starsEarned).toBe(3);
    expect(thirdTry.starsEarned).toBe(2);
    expect(fifthTry.starsEarned).toBe(1);
    expect(fifthTry.itemProgress.stars).toBe(3);
    expect(fifthTry.overviewSummary.stats.totalStars).toBe(3);
    expect(repository.debugGetAttempts("user-1").map((attempt) => attempt.attemptNumber)).toEqual([1, 3, 5]);
  });

  it("stores which writing-line letters are big or small", async () => {
    const result = await service.submitWritingLineAttempt("user-1", {
      group: "writingLines",
      wordId: "bata",
      targetWord: "බට",
      expectedLength: 2,
      outOfLinesPct: 0,
      sizeFail: false,
      spacingFail: false,
      predictedWord: "බට",
      predictedLetters: ["බ", "ට"],
      confidences: [0.9, 0.9],
      segmentation: {
        spacing: [14],
        sizes: [{ width: 40, height: 100 }, { width: 40, height: 30 }],
      },
    });

    expect(result.bigLetters).toEqual(["බ"]);
    expect(result.smallLetters).toEqual(["ට"]);
    expect(result.letterSizeDetails).toMatchObject([
      { index: 0, letter: "බ", status: "big" },
      { index: 1, letter: "ට", status: "small" },
    ]);

    const attempt = repository.debugGetAttempts("user-1")[0];
    expect(attempt).toMatchObject({
      sizeFail: true,
      bigLetters: ["බ"],
      smallLetters: ["ට"],
    });

    const summary = await repository.getSummary("user-1");
    expect(summary.dysgraphia.writingLines.bata).toMatchObject({
      bigLetters: ["බ"],
      smallLetters: ["ට"],
    });
  });

  it("does not trust a frontend passed value when hard line failure applies", async () => {
    const result = await service.submitWritingLineAttempt("user-1", {
      group: "writingLines",
      wordId: "bata",
      targetWord: "බට",
      expectedLength: 2,
      durationSeconds: 18,
      outOfLinesPct: 30,
      sizeFail: false,
      spacingFail: false,
      passed: true,
      predictedWord: "බට",
      predictedLetters: ["බ", "ට"],
      confidences: [0.9, 0.9],
      segmentation: { spacing: [14], sizes: [] },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.passed).toBe(false);
    expect(repository.debugGetAttempts("user-1")[0].passed).toBe(false);
    const summary = await repository.getSummary("user-1");
    expect(summary.dysgraphia.writingLines.bata).toMatchObject({
      targetWord: "බට",
      totalAttempts: 1,
      correctAttempts: 1,
      passedAttempts: 0,
      outOfLinesPct: 30,
      hardLinesFail: true,
      completed: false,
    });
  });

  it("stores a mirror round separately when correct on the first selection", async () => {
    const result = await service.submitMirrorLetterAttempt("user-1", {
      letterId: "a",
      targetChar: "අ",
      wrongAttempts: 0,
      totalAttempts: 1,
      correctAttempts: 1,
      completed: true,
    });

    expect(result.mirrorProgress).toMatchObject({
      targetChar: "අ",
      totalRounds: 1,
      totalAttempts: 1,
      correctAttempts: 1,
      wrongAttempts: 0,
      lastRoundAttempts: 1,
      lastRoundWrongAttempts: 0,
      completed: true,
    });
    expect((await repository.getSummary("user-1")).dysgraphia.letterTracing.a).toBeUndefined();
    expect(repository.debugGetAttempts("user-1")[0]).toMatchObject({ type: "mirror-letter" });
  });

  it("accumulates three wrong mirror selections and the correct selection", async () => {
    const result = await service.submitMirrorLetterAttempt("user-1", {
      letterId: "ta",
      targetChar: "ට",
      wrongAttempts: 3,
      totalAttempts: 4,
      correctAttempts: 1,
      completed: true,
    });

    expect(result.mirrorProgress).toMatchObject({
      totalRounds: 1,
      totalAttempts: 4,
      correctAttempts: 1,
      wrongAttempts: 3,
      lastRoundAttempts: 4,
      lastRoundWrongAttempts: 3,
    });
  });

  it("stores mirror drawing performance without changing letter tracing", async () => {
    const result = await service.submitMirrorLetterAttempt("user-1", {
      letterId: "a",
      targetChar: "අ",
      wrongAttempts: 1,
      totalAttempts: 2,
      correctAttempts: 1,
      completed: true,
      drawingCorrect: true,
      predictedLetter: "අ",
      confidence: 0.94,
      drawingDurationSeconds: 9,
      drawingEraseCount: 1,
    });

    expect(result.mirrorProgress).toMatchObject({
      drawingAttempts: 1,
      drawingCorrectAttempts: 1,
      drawingWrongAttempts: 0,
      lastDrawingCorrect: true,
      lastPredictedLetter: "අ",
      lastConfidence: 0.94,
      bestDrawingConfidence: 0.94,
      averageDrawingConfidence: 0.94,
      drawingEraseCount: 1,
      drawingTotalTimeSeconds: 9,
      lastDrawingTimeSeconds: 9,
    });
    expect((await repository.getSummary("user-1")).dysgraphia.letterTracing.a).toBeUndefined();
    expect(result.starsEarned).toBe(3);
    expect(result.starsAdded).toBe(3);
    expect(result.overviewSummary.stats.totalStars).toBe(3);
    expect(repository.debugGetAttempts("user-1")[0]).toMatchObject({
      type: "mirror-letter",
      drawingCorrect: true,
      predictedLetter: "අ",
      confidence: 0.94,
      drawingDurationSeconds: 9,
      drawingEraseCount: 1,
    });
  });

  it("does not add mirror-letter stars twice for the same letter", async () => {
    const payload = {
      letterId: "a",
      targetChar: "අ",
      wrongAttempts: 0,
      totalAttempts: 1,
      correctAttempts: 1,
      completed: true,
      drawingCorrect: true,
      predictedLetter: "අ",
      confidence: 0.94,
      drawingDurationSeconds: 9,
      drawingEraseCount: 0,
    };

    const first = await service.submitMirrorLetterAttempt("user-1", payload);
    const replay = await service.submitMirrorLetterAttempt("user-1", payload);

    expect(first.starsAdded).toBe(3);
    expect(replay.starsAdded).toBe(0);
    expect(replay.overviewSummary.stats.totalStars).toBe(3);
  });
});
