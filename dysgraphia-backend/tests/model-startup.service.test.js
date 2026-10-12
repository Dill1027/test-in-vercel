import { describe, expect, it, vi } from "vitest";
import { waitForModelReady } from "../src/services/modelStartupService";

describe("model startup service", () => {
  it("waits until the model reports ready", async () => {
    const healthChecker = {
      check: vi
        .fn()
        .mockResolvedValueOnce({ status: "unavailable", detail: "Loading model." })
        .mockResolvedValueOnce({ status: "ready" }),
    };
    const sleep = vi.fn(async () => {});

    await expect(
      waitForModelReady({
        healthChecker,
        processHandle: { exitCode: null, startupError: null },
        timeoutMs: 1000,
        pollIntervalMs: 100,
        sleep,
        now: () => 0,
      })
    ).resolves.toMatchObject({ status: "ready" });

    expect(healthChecker.check).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it("fails when the Python process exits during startup", async () => {
    const healthChecker = { check: vi.fn() };

    await expect(
      waitForModelReady({
        healthChecker,
        processHandle: { exitCode: 1, startupError: null },
        timeoutMs: 1000,
        pollIntervalMs: 100,
      })
    ).rejects.toThrow("exited before becoming ready");

    expect(healthChecker.check).not.toHaveBeenCalled();
  });

  it("does not accept health from a different process on the model port", async () => {
    const processHandle = {
      exitCode: null,
      startupError: null,
      modelServerListening: false,
    };
    const healthChecker = {
      check: vi.fn(async () => ({ status: "ready" })),
    };

    await expect(
      waitForModelReady({
        healthChecker,
        processHandle,
        timeoutMs: 1000,
        pollIntervalMs: 100,
        sleep: vi.fn(async () => {
          processHandle.modelServerListening = true;
        }),
        now: () => 0,
      })
    ).resolves.toMatchObject({ status: "ready" });

    expect(healthChecker.check).toHaveBeenCalledTimes(2);
  });

  it("fails after the configured startup timeout", async () => {
    let currentTime = 0;
    const healthChecker = {
      check: vi.fn(async () => ({ status: "unavailable", detail: "Loading model." })),
    };

    await expect(
      waitForModelReady({
        healthChecker,
        processHandle: { exitCode: null, startupError: null },
        timeoutMs: 1000,
        pollIntervalMs: 250,
        sleep: vi.fn(async (milliseconds) => {
          currentTime += milliseconds;
        }),
        now: () => currentTime,
      })
    ).rejects.toThrow("not ready within 1000ms");

    expect(healthChecker.check).toHaveBeenCalledTimes(4);
  });
});
