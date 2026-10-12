import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { createMemoryDysgraphiaRepository } from "../src/modules/dysgraphia/repository";
import { createAuthMiddleware } from "../src/middleware/auth";

function buildAuthClient() {
  return {
    verifyIdToken: vi.fn(async (token) => {
      if (token === "valid-token") {
        return { uid: "user-1", email: "student@example.com" };
      }

      throw new Error("invalid token");
    }),
  };
}

describe("auth middleware", () => {
  it("does not log bearer tokens or decoded claims", async () => {
    const logger = { debug: vi.fn(), warn: vi.fn() };
    const middleware = createAuthMiddleware({
      authClient: {
        verifyIdToken: vi.fn(async () => ({
          uid: "private-user-id",
          email: "private@example.com",
        })),
      },
      repository: { getUserRole: vi.fn(async () => "student") },
      logger,
    });
    const req = {
      method: "GET",
      originalUrl: "/private",
      headers: { authorization: "Bearer super-secret-token" },
    };
    const next = vi.fn();

    await middleware(req, {}, next);

    const loggedData = JSON.stringify([
      ...logger.debug.mock.calls,
      ...logger.warn.mock.calls,
    ]);
    expect(loggedData).not.toContain("super-secret-token");
    expect(loggedData).not.toContain("private-user-id");
    expect(loggedData).not.toContain("private@example.com");
    expect(next).toHaveBeenCalledWith();
  });

  it("logs only a safe error code when token verification fails", async () => {
    const logger = { debug: vi.fn(), warn: vi.fn() };
    const verificationError = Object.assign(
      new Error("secret token details must not be logged"),
      { code: "auth/id-token-expired" }
    );
    const middleware = createAuthMiddleware({
      authClient: { verifyIdToken: vi.fn(async () => { throw verificationError; }) },
      repository: {},
      logger,
    });
    const req = {
      method: "GET",
      originalUrl: "/private",
      headers: { authorization: "Bearer another-secret-token" },
    };
    const next = vi.fn();

    await middleware(req, {}, next);

    const loggedData = JSON.stringify(logger.warn.mock.calls);
    expect(loggedData).toContain("auth/id-token-expired");
    expect(loggedData).not.toContain("another-secret-token");
    expect(loggedData).not.toContain("secret token details");
    expect(next.mock.calls[0][0].message).toBe("Authentication failed.");
  });

  it("rejects requests without a bearer token", async () => {
    const repository = createMemoryDysgraphiaRepository();
    repository.seedUserProfile("user-1", { role: "student" });
    const app = createApp({
      authClient: buildAuthClient(),
      repository,
      predictor: {
        predictSingleCharacter: vi.fn(),
        predictWord: vi.fn(),
      },
    });

    const response = await request(app).get("/api/dysgraphia/overview");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("accepts valid tokens and loads the role from userProfiles", async () => {
    const repository = createMemoryDysgraphiaRepository();
    repository.seedUserProfile("user-1", { role: "student" });
    const app = createApp({
      authClient: buildAuthClient(),
      repository,
      predictor: {
        predictSingleCharacter: vi.fn(),
        predictWord: vi.fn(),
      },
    });

    const response = await request(app)
      .get("/api/dysgraphia/overview")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.stats.totalStars).toBe(0);
  });

  it("redacts authorization headers from HTTP error logs", async () => {
    const repository = createMemoryDysgraphiaRepository();
    let logOutput = "";
    const app = createApp({
      authClient: buildAuthClient(),
      repository,
      predictor: {
        predictSingleCharacter: vi.fn(),
        predictWord: vi.fn(),
      },
      logDestination: {
        write(chunk) {
          logOutput += chunk;
        },
      },
    });

    const response = await request(app)
      .get("/api/dysgraphia/overview")
      .set("Authorization", "Bearer sensitive-invalid-token");

    expect(response.status).toBe(401);
    expect(logOutput).not.toContain("sensitive-invalid-token");
    expect(logOutput).not.toContain("invalid token");
    expect(logOutput).toContain("[REDACTED]");
  });
});
