export const ONBOARDING_STEP_IDS = Object.freeze({
  SIGN_IN: "sign-in",
  CONNECT_GOOGLE: "connect-google",
  ADD_PROVIDER_KEY: "add-provider-key",
  SELECT_RESOURCE: "select-resource"
});

const STEP_DEFINITIONS = Object.freeze([
  { id: ONBOARDING_STEP_IDS.SIGN_IN, label: "Sign in" },
  { id: ONBOARDING_STEP_IDS.CONNECT_GOOGLE, label: "Connect Google" },
  { id: ONBOARDING_STEP_IDS.ADD_PROVIDER_KEY, label: "Add provider key" },
  { id: ONBOARDING_STEP_IDS.SELECT_RESOURCE, label: "Select resource" }
]);

function normalizeBoolean(value) {
  return value === true;
}

export function getOnboardingProgress(status = {}) {
  const completedByStep = {
    [ONBOARDING_STEP_IDS.SIGN_IN]: normalizeBoolean(status.isSignedIn),
    [ONBOARDING_STEP_IDS.CONNECT_GOOGLE]: normalizeBoolean(status.hasGoogleConnection),
    [ONBOARDING_STEP_IDS.ADD_PROVIDER_KEY]: status.providerStatus === "READY",
    [ONBOARDING_STEP_IDS.SELECT_RESOURCE]: normalizeBoolean(status.hasResourceSession)
  };

  const firstIncompleteIndex = STEP_DEFINITIONS.findIndex((step) => !completedByStep[step.id]);
  const currentIndex = firstIncompleteIndex === -1 ? STEP_DEFINITIONS.length - 1 : firstIncompleteIndex;

  const steps = STEP_DEFINITIONS.map((step, index) => ({
    ...step,
    state: completedByStep[step.id] ? "complete" : index === currentIndex ? "current" : "pending"
  }));

  return {
    steps,
    currentStepId: firstIncompleteIndex === -1 ? null : STEP_DEFINITIONS[currentIndex].id,
    readyToStartSession: firstIncompleteIndex === -1
  };
}
