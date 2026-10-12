import { describe, expect, it, vi } from "vitest";
import {
  createModelHealthChecker,
  deriveHealthUrl,
} from "../src/services/modelHealthService";

describe("model health service", () => {
  it("derives the health endpoint from the prediction endpoint", () => {
    expect(deriveHealthUrl("http://127.0.0.1:8001/predict")).toBe(
      "http://127.0.0.1:8001/health"
    );
  });

  it("reports ready after a successful Python health response", async () => {
    const httpClient = {
      get: vi.fn(async () => ({ status: 200, data: { success: true } })),
    };
    const checker = createModelHealthChecker({
      provider: "python",
      healthUrl: "http://model/health",
      timeoutMs: 1500,
      httpClient,
    });

    await expect(checker.check()).resolves.toMatchObject({
      status: "ready",
      provider: "python",
    });
    expect(httpClient.get).toHaveBeenCalledWith("http://model/health", {
      timeout: 1500,
    });
  });

  it("reports unavailable when Python cannot be reached", async () => {
    const httpClient = {
      get: vi.fn(async () => {
        throw new Error("connection refused");
      }),
    };
    const checker = createModelHealthChecker({
      provider: "python",
      healthUrl: "http://model/health",
      httpClient,
    });

    await expect(checker.check()).resolves.toMatchObject({
      status: "unavailable",
      provider: "python",
    });
  });

  it("does not call Python when the mock provider is selected", async () => {
    const httpClient = { get: vi.fn() };
    const checker = createModelHealthChecker({ provider: "mock", httpClient });

    await expect(checker.check()).resolves.toMatchObject({
      status: "ready",
      provider: "mock",
    });
    expect(httpClient.get).not.toHaveBeenCalled();
  });
});
