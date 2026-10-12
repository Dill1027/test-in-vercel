import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { createMemoryDysgraphiaRepository } from "../src/modules/dysgraphia/repository";

function buildApp({ role = "student", modelHealthChecker } = {}) {
  const repository = createMemoryDysgraphiaRepository();
  repository.seedUserProfile("user-1", { role });

  const authClient = {
    verifyIdToken: vi.fn(async (token) => {
      if (token !== "valid-token") {
        throw new Error("invalid");
      }

      return {
        uid: "user-1",
        email: "student@example.com",
      };
    }),
  };

  const predictor = {
    predictSingleCharacter: vi.fn(async () => ({
      predicted: "ට",
      confidence: 0.95,
      rawPrediction: { label: "ට" },
    })),
    predictWord: vi.fn(async () => ({
      predictedLetters: ["බ", "ට"],
      predictedWord: "බට",
      confidences: [0.9, 0.91],
      segmentation: { ranges: [{}, {}] },
      failureReason: null,
    })),
  };

  return {
    app: createApp({ authClient, repository, predictor, modelHealthChecker }),
    repository,
  };
}

describe("dysgraphia routes", () => {
  it("reports ready when the Python predictor is ready", async () => {
    const modelHealthChecker = {
      check: vi.fn(async () => ({
        status: "ready",
        provider: "python",
        detail: "Python predictor is ready.",
      })),
    };
    const { app } = buildApp({ modelHealthChecker });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.checks.predictor.status).toBe("ready");
  });

  it("reports unavailable when the Python predictor is not ready", async () => {
    const modelHealthChecker = {
      check: vi.fn(async () => ({
        status: "unavailable",
        provider: "python",
        detail: "Python predictor did not respond to its health check.",
      })),
    };
    const { app } = buildApp({ modelHealthChecker });

    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("unavailable");
    expect(response.body.checks.api.status).toBe("ready");
    expect(response.body.checks.predictor.status).toBe("unavailable");
  });

  it("returns overview for authenticated users", async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get("/api/dysgraphia/overview")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.catalogTotals.letters.total).toBe(16);
  });

  it("records a shape attempt and returns the updated overview", async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post("/api/dysgraphia/attempts/shape")
      .set("Authorization", "Bearer valid-token")
      .send({
        shapeId: "triangle",
        coverage: 88,
        strayRatio: 0.11,
        starsEarned: 0,
        durationSeconds: 18,
      });

    expect(response.status).toBe(200);
    expect(response.body.itemProgress.stars).toBe(3);
    expect(response.body.overviewSummary.stats.totalStars).toBe(3);
  });

  it("records a structured word prediction without an image", async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post("/api/dysgraphia/attempts/word")
      .set("Authorization", "Bearer valid-token")
      .field("group", "twoLetters")
      .field("wordId", "bata")
      .field("targetWord", "බට")
      .field("expectedLength", "2")
      .field("durationSeconds", "12")
      .field("predictedWord", "බට")
      .field("predictedLetters", JSON.stringify(["බ", "ට"]))
      .field("confidences", JSON.stringify([0.91, 0.92]))
      .field("spacing", JSON.stringify([14]))
      .field("sizes", JSON.stringify([{ width: 40, height: 56 }, { width: 38, height: 58 }]));

    expect(response.status).toBe(200);
    expect(response.body.predictedWord).toBe("බට");
    expect(response.body.isCorrect).toBe(true);
  });

  it("records an authenticated intervention result in the existing attempt collection", async () => {
    const { app, repository } = buildApp();
    const response = await request(app)
      .post("/api/dysgraphia/attempts/intervention")
      .set("Authorization", "Bearer valid-token")
      .send({
        completionId: "mirror-session-round-1",
        gameType: "mirror-letter-drag",
        targetLetterId: "ta",
        targetLetter: "ට",
        targetWord: "ගමන",
        correct: true,
        score: 100,
        accuracy: 1,
        attempts: 3,
        mistakes: 0,
        completed: true,
        durationSeconds: 18,
      });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({ gameType: "mirror-letter-drag", accuracy: 1 });
    expect(repository.debugGetAttempts("user-1")[0]).toMatchObject({
      type: "intervention",
      gameType: "mirror-letter-drag",
      completionId: "mirror-session-round-1",
    });
  });

  it("predicts a letter without creating an activity attempt", async () => {
    const { app, repository } = buildApp();
    const response = await request(app)
      .post("/api/dysgraphia/predictions/letter")
      .set("Authorization", "Bearer valid-token")
      .attach("image", Buffer.from("letter-image"), {
        filename: "letter.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(200);
    expect(response.body.predicted).toBeTruthy();
    expect(response.body.confidence).toBe(0.95);
    expect(repository.debugGetAttempts("user-1")).toHaveLength(0);
  });

  it("records mirror-letter selections separately from handwriting attempts", async () => {
    const { app, repository } = buildApp();
    const response = await request(app)
      .post("/api/dysgraphia/attempts/mirror-letter")
      .set("Authorization", "Bearer valid-token")
      .send({
        letterId: "ta",
        targetChar: "ට",
        wrongAttempts: 3,
        totalAttempts: 4,
        correctAttempts: 1,
        completed: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.mirrorProgress.totalRounds).toBe(1);
    expect(response.body.mirrorProgress.wrongAttempts).toBe(3);
    expect(repository.debugGetAttempts("user-1")[0].type).toBe("mirror-letter");
  });

  it("rejects reset for non-admin users", async () => {
    const { app } = buildApp({ role: "student" });
    const response = await request(app)
      .post("/api/dysgraphia/reset")
      .set("Authorization", "Bearer valid-token")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("allows reset for admins", async () => {
    const { app } = buildApp({ role: "admin" });
    await request(app)
      .post("/api/dysgraphia/attempts/shape")
      .set("Authorization", "Bearer valid-token")
      .send({
        shapeId: "triangle",
        coverage: 88,
        strayRatio: 0.11,
        starsEarned: 0,
        durationSeconds: 18,
      });

    const response = await request(app)
      .post("/api/dysgraphia/reset")
      .set("Authorization", "Bearer valid-token")
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.stats.totalStars).toBe(0);
  });
});
