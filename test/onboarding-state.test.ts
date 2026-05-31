import { describe, expect, it } from "vitest";
import { getOnboardingProgress, ONBOARDING_STEP_IDS } from "../src/onboarding-state";

describe("onboarding progress", () => {
  it("marks sign-in as the first current step by default", () => {
    const progress = getOnboardingProgress();

    expect(progress.currentStepId).toBe(ONBOARDING_STEP_IDS.SIGN_IN);
    expect(progress.readyToStartSession).toBe(false);
    expect(progress.steps[0].state).toBe("current");
  });

  it("advances through completed onboarding prerequisites", () => {
    const progress = getOnboardingProgress({
      isSignedIn: true,
      hasGoogleConnection: true,
      providerStatus: "READY",
      hasResourceSession: false
    });

    expect(progress.currentStepId).toBe(ONBOARDING_STEP_IDS.SELECT_RESOURCE);
    expect(progress.steps.map((step) => step.state)).toEqual(["complete", "complete", "complete", "current"]);
  });

  it("returns ready when every onboarding prerequisite is complete", () => {
    const progress = getOnboardingProgress({
      isSignedIn: true,
      hasGoogleConnection: true,
      providerStatus: "READY",
      hasResourceSession: true
    });

    expect(progress.currentStepId).toBeNull();
    expect(progress.readyToStartSession).toBe(true);
  });
});
