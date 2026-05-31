export const ERROR_CATEGORIES = Object.freeze({
  AUTHENTICATION: "AUTHENTICATION",
  AUTHORIZATION: "AUTHORIZATION",
  RATE_LIMITED: "RATE_LIMITED",
  VALIDATION: "VALIDATION",
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
  CONFLICT: "CONFLICT",
  DEPENDENCY: "DEPENDENCY",
  PROVIDER_QUOTA: "PROVIDER_QUOTA",
  KMS: "KMS",
  OAUTH: "OAUTH",
  CONNECTOR: "CONNECTOR",
  POLICY: "POLICY",
  INTERNAL: "INTERNAL"
});

export type ErrorCategory = (typeof ERROR_CATEGORIES)[keyof typeof ERROR_CATEGORIES];

type UnsafeErrorInput = {
  category?: string;
  code?: string;
};

export type UserFacingError = {
  category: ErrorCategory;
  code: string;
  message: string;
  retryable: boolean;
};

const SAFE_MESSAGES: Readonly<Record<ErrorCategory, string>> = Object.freeze({
  [ERROR_CATEGORIES.AUTHENTICATION]: "Sign in again to continue.",
  [ERROR_CATEGORIES.AUTHORIZATION]: "You do not have access to that resource.",
  [ERROR_CATEGORIES.RATE_LIMITED]: "Too many requests. Wait a moment and try again.",
  [ERROR_CATEGORIES.VALIDATION]: "Check the request and try again.",
  [ERROR_CATEGORIES.CONSENT_REQUIRED]: "Grant context access before continuing.",
  [ERROR_CATEGORIES.CONFLICT]: "The source changed before the action was applied. Review the latest version.",
  [ERROR_CATEGORIES.DEPENDENCY]: "A connected service is unavailable. Try again later.",
  [ERROR_CATEGORIES.PROVIDER_QUOTA]: "The model provider quota or rate limit was reached.",
  [ERROR_CATEGORIES.KMS]: "Secure credential handling is unavailable. Try again later.",
  [ERROR_CATEGORIES.OAUTH]: "Reconnect the provider account to continue.",
  [ERROR_CATEGORIES.CONNECTOR]: "The connected resource could not be reached.",
  [ERROR_CATEGORIES.POLICY]: "This request is not allowed by the current policy.",
  [ERROR_CATEGORIES.INTERNAL]: "Something went wrong. Try again later."
});

const RETRYABLE_CATEGORIES = new Set<ErrorCategory>([
  ERROR_CATEGORIES.RATE_LIMITED,
  ERROR_CATEGORIES.DEPENDENCY,
  ERROR_CATEGORIES.PROVIDER_QUOTA,
  ERROR_CATEGORIES.KMS,
  ERROR_CATEGORIES.INTERNAL
]);

const SAFE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

export function mapUserFacingError(error: UnsafeErrorInput = {}): UserFacingError {
  const category = isKnownCategory(error.category) ? error.category : ERROR_CATEGORIES.INTERNAL;

  return {
    category,
    code: normalizeSafeErrorCode(error.code),
    message: SAFE_MESSAGES[category],
    retryable: RETRYABLE_CATEGORIES.has(category)
  };
}

function isKnownCategory(category: string | undefined): category is ErrorCategory {
  return typeof category === "string" && Object.hasOwn(SAFE_MESSAGES, category);
}

function normalizeSafeErrorCode(code: string | undefined): string {
  return typeof code === "string" && SAFE_ERROR_CODE_PATTERN.test(code) ? code : "UNKNOWN";
}
