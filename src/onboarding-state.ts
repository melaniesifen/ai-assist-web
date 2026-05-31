export const ONBOARDING_STEP_IDS = Object.freeze({
  SIGN_IN: "sign-in",
  CONNECT_GOOGLE: "connect-google",
  ADD_PROVIDER_KEY: "add-provider-key",
  SELECT_RESOURCE: "select-resource"
});

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[keyof typeof ONBOARDING_STEP_IDS];
export type OnboardingStepState = "complete" | "current" | "pending";

export type OnboardingStatus = {
  isSignedIn?: boolean;
  hasGoogleConnection?: boolean;
  providerStatus?: string;
  hasResourceSession?: boolean;
};

export type OnboardingStep = {
  id: OnboardingStepId;
  label: string;
  state: OnboardingStepState;
};

export type OnboardingProgress = {
  steps: OnboardingStep[];
  currentStepId: OnboardingStepId | null;
  readyToStartSession: boolean;
};

const STEP_DEFINITIONS: readonly Omit<OnboardingStep, "state">[] = Object.freeze([
  { id: ONBOARDING_STEP_IDS.SIGN_IN, label: "Sign in" },
  { id: ONBOARDING_STEP_IDS.CONNECT_GOOGLE, label: "Connect Google" },
  { id: ONBOARDING_STEP_IDS.ADD_PROVIDER_KEY, label: "Add provider key" },
  { id: ONBOARDING_STEP_IDS.SELECT_RESOURCE, label: "Select resource" }
]);

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

export function getOnboardingProgress(status: OnboardingStatus = {}): OnboardingProgress {
  const completedByStep: Record<OnboardingStepId, boolean> = {
    [ONBOARDING_STEP_IDS.SIGN_IN]: normalizeBoolean(status.isSignedIn),
    [ONBOARDING_STEP_IDS.CONNECT_GOOGLE]: normalizeBoolean(status.hasGoogleConnection),
    [ONBOARDING_STEP_IDS.ADD_PROVIDER_KEY]: status.providerStatus === "READY",
    [ONBOARDING_STEP_IDS.SELECT_RESOURCE]: normalizeBoolean(status.hasResourceSession)
  };

  const firstIncompleteIndex = STEP_DEFINITIONS.findIndex((step) => !completedByStep[step.id]);
  const currentIndex = firstIncompleteIndex === -1 ? STEP_DEFINITIONS.length - 1 : firstIncompleteIndex;

  const steps = STEP_DEFINITIONS.map((step, index): OnboardingStep => {
    const state: OnboardingStepState = completedByStep[step.id]
      ? "complete"
      : index === currentIndex
        ? "current"
        : "pending";

    return {
      ...step,
      state
    };
  });

  return {
    steps,
    currentStepId: firstIncompleteIndex === -1 ? null : STEP_DEFINITIONS[currentIndex].id,
    readyToStartSession: firstIncompleteIndex === -1
  };
}
