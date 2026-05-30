import test from "node:test";
import assert from "node:assert/strict";
import { getOnboardingProgress, ONBOARDING_STEP_IDS } from "../src/onboarding-state.js";

test("marks sign-in as the first current step by default", () => {
  const progress = getOnboardingProgress();

  assert.equal(progress.currentStepId, ONBOARDING_STEP_IDS.SIGN_IN);
  assert.equal(progress.readyToStartSession, false);
  assert.equal(progress.steps[0].state, "current");
});

test("advances through completed onboarding prerequisites", () => {
  const progress = getOnboardingProgress({
    isSignedIn: true,
    hasGoogleConnection: true,
    providerStatus: "READY",
    hasResourceSession: false
  });

  assert.equal(progress.currentStepId, ONBOARDING_STEP_IDS.SELECT_RESOURCE);
  assert.deepEqual(progress.steps.map((step) => step.state), ["complete", "complete", "complete", "current"]);
});

test("returns ready when every onboarding prerequisite is complete", () => {
  const progress = getOnboardingProgress({
    isSignedIn: true,
    hasGoogleConnection: true,
    providerStatus: "READY",
    hasResourceSession: true
  });

  assert.equal(progress.currentStepId, null);
  assert.equal(progress.readyToStartSession, true);
});
