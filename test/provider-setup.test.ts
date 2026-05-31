import { describe, expect, it } from "vitest";
import { MODEL_PROVIDERS, getProviderLabel, getProviderSetupStatus } from "../src/provider-setup";

describe("provider setup status", () => {
  it("reports ready provider status without exposing secret material", () => {
    const status = getProviderSetupStatus({
      provider: MODEL_PROVIDERS.OPENAI,
      validationStatus: "VALID",
      fingerprint: "fp_123",
      expiresAt: "2026-05-30T00:00:00.000Z"
    });

    expect(status.state).toBe("READY");
    expect(status.fingerprint).toBe("fp_123");
    expect(Object.hasOwn(status, "secret")).toBe(false);
    expect(Object.hasOwn(status, "apiKey")).toBe(false);
  });

  it("reports expired session credentials as recoverable", () => {
    const status = getProviderSetupStatus({
      provider: MODEL_PROVIDERS.ANTHROPIC,
      validationStatus: "EXPIRED"
    });

    expect(status.state).toBe("EXPIRED");
    expect(status.canSubmitKey).toBe(true);
  });

  it("keeps Bedrock unavailable unless enabled", () => {
    const status = getProviderSetupStatus({ provider: MODEL_PROVIDERS.BEDROCK });

    expect(status.state).toBe("UNAVAILABLE");
    expect(status.canSubmitKey).toBe(false);
  });

  it("labels unknown providers safely", () => {
    const status = getProviderSetupStatus({ provider: "LOCAL_MODEL" });

    expect(getProviderLabel("LOCAL_MODEL")).toBe("Unknown provider");
    expect(status.label).toBe("Unknown provider");
    expect(status.state).toBe("UNAVAILABLE");
  });

  it("reports validating, invalid, and missing provider states", () => {
    expect(getProviderSetupStatus({
      provider: MODEL_PROVIDERS.OPENAI,
      isValidating: true
    }).state).toBe("VALIDATING");

    expect(getProviderSetupStatus({
      provider: MODEL_PROVIDERS.OPENAI,
      validationStatus: "INVALID"
    }).state).toBe("INVALID");

    expect(getProviderSetupStatus({
      provider: MODEL_PROVIDERS.OPENAI
    }).state).toBe("MISSING");
  });
});
