import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_PROVIDERS, getProviderSetupStatus } from "../src/provider-setup.js";

test("reports ready provider status without exposing secret material", () => {
  const status = getProviderSetupStatus({
    provider: MODEL_PROVIDERS.OPENAI,
    validationStatus: "VALID",
    fingerprint: "fp_123",
    expiresAt: "2026-05-30T00:00:00.000Z"
  });

  assert.equal(status.state, "READY");
  assert.equal(status.fingerprint, "fp_123");
  assert.equal(Object.hasOwn(status, "secret"), false);
  assert.equal(Object.hasOwn(status, "apiKey"), false);
});

test("reports expired session credentials as recoverable", () => {
  const status = getProviderSetupStatus({
    provider: MODEL_PROVIDERS.ANTHROPIC,
    validationStatus: "EXPIRED"
  });

  assert.equal(status.state, "EXPIRED");
  assert.equal(status.canSubmitKey, true);
});

test("keeps Bedrock unavailable unless enabled", () => {
  const status = getProviderSetupStatus({ provider: MODEL_PROVIDERS.BEDROCK });

  assert.equal(status.state, "UNAVAILABLE");
  assert.equal(status.canSubmitKey, false);
});
