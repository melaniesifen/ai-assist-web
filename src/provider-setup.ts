export const MODEL_PROVIDERS = Object.freeze({
  OPENAI: "OPENAI",
  ANTHROPIC: "ANTHROPIC",
  BEDROCK: "BEDROCK"
});

export type ModelProvider = (typeof MODEL_PROVIDERS)[keyof typeof MODEL_PROVIDERS];

export const PROVIDER_LABELS: Readonly<Record<ModelProvider, string>> = Object.freeze({
  [MODEL_PROVIDERS.OPENAI]: "OpenAI",
  [MODEL_PROVIDERS.ANTHROPIC]: "Anthropic",
  [MODEL_PROVIDERS.BEDROCK]: "Amazon Bedrock"
});

export type ProviderSetupInput = {
  provider?: string;
  validationStatus?: string;
  fingerprint?: string;
  expiresAt?: string;
  isValidating?: boolean;
  bedrockEnabled?: boolean;
};

export type ProviderSetupStatus = {
  provider?: string;
  label: string;
  state: "UNAVAILABLE" | "VALIDATING" | "READY" | "EXPIRED" | "INVALID" | "MISSING";
  message: string;
  canSubmitKey: boolean;
  fingerprint?: string | null;
  expiresAt?: string | null;
};

const READY_VALIDATION_STATES = new Set(["VALID", "VALIDATED"]);
const INVALID_VALIDATION_STATES = new Set(["INVALID", "REVOKED"]);
const EXPIRED_VALIDATION_STATES = new Set(["EXPIRED"]);

export function getProviderLabel(provider: string): string {
  return isModelProvider(provider) ? PROVIDER_LABELS[provider] : "Unknown provider";
}

export function getProviderSetupStatus({
  provider,
  validationStatus = "MISSING",
  fingerprint,
  expiresAt,
  isValidating = false,
  bedrockEnabled = false
}: ProviderSetupInput = {}): ProviderSetupStatus {
  if (!provider || !isModelProvider(provider)) {
    return {
      provider,
      label: "Unknown provider",
      state: "UNAVAILABLE",
      message: "Choose a supported model provider.",
      canSubmitKey: false
    };
  }

  if (provider === MODEL_PROVIDERS.BEDROCK && !bedrockEnabled) {
    return {
      provider,
      label: PROVIDER_LABELS[provider],
      state: "UNAVAILABLE",
      message: "Bedrock mode is not enabled for this MVP environment.",
      canSubmitKey: false
    };
  }

  if (isValidating) {
    return {
      provider,
      label: PROVIDER_LABELS[provider],
      state: "VALIDATING",
      message: `Validating ${PROVIDER_LABELS[provider]} credentials.`,
      canSubmitKey: false
    };
  }

  if (READY_VALIDATION_STATES.has(validationStatus)) {
    return {
      provider,
      label: PROVIDER_LABELS[provider],
      state: "READY",
      message: `${PROVIDER_LABELS[provider]} credentials are ready for this session.`,
      fingerprint: fingerprint ?? null,
      expiresAt: expiresAt ?? null,
      canSubmitKey: true
    };
  }

  if (EXPIRED_VALIDATION_STATES.has(validationStatus)) {
    return {
      provider,
      label: PROVIDER_LABELS[provider],
      state: "EXPIRED",
      message: "Session credentials expired. Enter a new provider key.",
      canSubmitKey: true
    };
  }

  if (INVALID_VALIDATION_STATES.has(validationStatus)) {
    return {
      provider,
      label: PROVIDER_LABELS[provider],
      state: "INVALID",
      message: "Provider credentials could not be validated.",
      canSubmitKey: true
    };
  }

  return {
    provider,
    label: PROVIDER_LABELS[provider],
    state: "MISSING",
    message: `Enter a ${PROVIDER_LABELS[provider]} key to continue.`,
    canSubmitKey: true
  };
}

function isModelProvider(provider: string): provider is ModelProvider {
  return Object.hasOwn(PROVIDER_LABELS, provider);
}
