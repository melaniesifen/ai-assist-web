export const PRODUCT_SESSION_STATUSES = Object.freeze({
  ANONYMOUS: "anonymous",
  AUTHENTICATED: "authenticated",
  EXPIRED: "expired"
});

export const GOOGLE_OAUTH_CONNECTION_STATUSES = Object.freeze({
  NOT_CONNECTED: "not_connected",
  CONNECTED: "connected",
  RECONNECT_REQUIRED: "reconnect_required"
});

export const PROVIDER_SECRET_READINESS_STATUSES = Object.freeze({
  MISSING: "missing",
  PENDING_VALIDATION: "pending_validation",
  VALID: "valid",
  INVALID: "invalid",
  EXPIRED: "expired",
  VALIDATION_FAILED: "validation_failed"
});

export const RESOURCE_SESSION_READINESS_STATUSES = Object.freeze({
  NOT_STARTED: "not_started",
  READY: "ready",
  NOT_READY: "not_ready"
});

export const M3_DEFAULT_CONTEXT_MODE = "SELECTION";
export const M3_SETUP_UPDATED_AT = "2026-06-06T18:00:00.000Z";
export const M3_DEMO_SESSION_EXPIRES_AT = "2026-06-06T20:00:00.000Z";
export const M3_DEMO_SECRET_EXPIRES_AT = "2026-06-07T02:00:00.000Z";

const PROVIDER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  BEDROCK: "Amazon Bedrock"
});

const AUTH_PRODUCT_SESSION_LABEL = "Auth / product session";

const SAFE_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  product_session_required: "Sign in before continuing setup.",
  product_session_expired: "Your product session expired. Sign in again.",
  google_oauth_reconnect_required: "Reconnect Google to continue.",
  provider_secret_required: "Add a provider key before starting the resource session.",
  provider_secret_invalid: "Provider key validation failed. Enter a new key.",
  provider_secret_expired: "Provider credentials expired. Enter a new provider key.",
  resource_session_not_ready: "Choose a Google Docs resource before starting.",
  dependency_unavailable: "A setup dependency is temporarily unavailable."
});

const FORBIDDEN_LOG_KEY_PATTERNS = [
  /api.?key/i,
  /provider.?key/i,
  /oauth.?token/i,
  /bearer.?token/i,
  /authorization.?code/i,
  /prompt/i,
  /document.?text/i,
  /selected.?text/i,
  /model.?response/i,
  /screenshot/i,
  /action.?payload/i,
  /ciphertext/i,
  /secret.?material/i
];

const FORBIDDEN_LOG_VALUE_PATTERNS = [
  /sk-[a-z0-9_-]+/i,
  /oauth_[a-z0-9_-]+/i,
  /bearer\s+[a-z0-9._-]+/i,
  /authorization_code_[a-z0-9_-]+/i,
  /raw document/i,
  /selected text/i,
  /model response/i,
  /prompt:/i,
  /action payload/i
];

export type ProductSessionStatus = (typeof PRODUCT_SESSION_STATUSES)[keyof typeof PRODUCT_SESSION_STATUSES];
export type GoogleOAuthConnectionStatus =
  (typeof GOOGLE_OAUTH_CONNECTION_STATUSES)[keyof typeof GOOGLE_OAUTH_CONNECTION_STATUSES];
export type ProviderSecretReadinessStatus =
  (typeof PROVIDER_SECRET_READINESS_STATUSES)[keyof typeof PROVIDER_SECRET_READINESS_STATUSES];
export type ResourceSessionReadinessStatus =
  (typeof RESOURCE_SESSION_READINESS_STATUSES)[keyof typeof RESOURCE_SESSION_READINESS_STATUSES];

export type ContractErrorRef = {
  code?: string;
  category?: string;
  message?: string;
  retryable?: boolean;
  httpStatus?: number;
  target?: string;
};

export type ProductSessionStatusRef = {
  status: ProductSessionStatus;
  tenantId?: string;
  userId?: string;
  authSubject?: string;
  sessionId?: string;
  expiresAt?: string;
  error?: ContractErrorRef;
};

export type GoogleOAuthConnectionStatusRef = {
  provider: "google";
  status: GoogleOAuthConnectionStatus;
  googleAccountId?: string;
  scopes?: readonly string[];
  connectedAt?: string;
  expiresAt?: string;
  error?: ContractErrorRef;
};

export type ProviderSecretReadinessRef = {
  provider: string;
  status: ProviderSecretReadinessStatus;
  secretId?: string;
  fingerprint?: string;
  lastValidatedAt?: string;
  expiresAt?: string;
  error?: ContractErrorRef;
};

export type ResourceRef = {
  connector: string;
  resourceId: string;
  resourceType: string;
  displayName?: string;
};

export type ResourceSessionReadinessRef = {
  status: ResourceSessionReadinessStatus;
  sessionId?: string;
  resourceRef?: ResourceRef;
  resourceRevision?: string;
  createdAt?: string;
  error?: ContractErrorRef;
};

export type SetupErrorRef = {
  kind: string;
  error?: ContractErrorRef;
};

export type FirstRunSetupStatus = {
  productSession: ProductSessionStatusRef;
  googleOAuth: GoogleOAuthConnectionStatusRef;
  providerSecrets: readonly ProviderSecretReadinessRef[];
  resourceSession?: ResourceSessionReadinessRef;
  errors: readonly SetupErrorRef[];
  updatedAt: string;
};

export type SetupCardTone = "ready" | "action" | "blocked" | "pending" | "idle";

export type SetupMetadataItem = {
  label: string;
  value: string;
};

export type SetupCardViewModel = {
  id: string;
  label: string;
  status: string;
  tone: SetupCardTone;
  message: string;
  metadata: readonly SetupMetadataItem[];
};

export type SetupErrorViewModel = {
  kind: string;
  message: string;
  code?: string;
};

export type FirstRunSetupViewModel = {
  ready: boolean;
  updatedAt: string;
  contextPosture: typeof M3_DEFAULT_CONTEXT_MODE;
  productSession: SetupCardViewModel;
  googleOAuth: SetupCardViewModel;
  providerSecrets: readonly SetupCardViewModel[];
  resourceSession: SetupCardViewModel;
  errors: readonly SetupErrorViewModel[];
  safeLogEvent: SafeSetupLogEvent;
};

export type SafeSetupLogEvent = {
  eventName: "first_run_setup_state_rendered";
  setupReady: boolean;
  updatedAt: string;
  productSessionStatus: ProductSessionStatus;
  googleOAuthStatus: GoogleOAuthConnectionStatus;
  providerSecretStatuses: readonly {
    provider: string;
    status: ProviderSecretReadinessStatus;
  }[];
  resourceSessionStatus: ResourceSessionReadinessStatus | "unknown";
  errorKinds: readonly string[];
};

function labelProvider(provider: string): string {
  return PROVIDER_LABELS[provider] ?? "Unknown provider";
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function metadata(label: string, value: string | undefined): SetupMetadataItem | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  return { label, value };
}

function compactMetadata(items: readonly (SetupMetadataItem | null)[]): SetupMetadataItem[] {
  return items.filter((item): item is SetupMetadataItem => item !== null);
}

export function createSetupDemoStates(): readonly FirstRunSetupStatus[] {
  return Object.freeze([
    {
      productSession: {
        status: PRODUCT_SESSION_STATUSES.AUTHENTICATED,
        tenantId: "tenant_m3_demo",
        userId: "user_m3_demo",
        authSubject: "auth_subject_m3_demo",
        sessionId: "session_m3_demo",
        expiresAt: M3_DEMO_SESSION_EXPIRES_AT
      },
      googleOAuth: {
        provider: "google",
        status: GOOGLE_OAUTH_CONNECTION_STATUSES.CONNECTED,
        googleAccountId: "google_account_m3_demo",
        scopes: Object.freeze(["https://www.googleapis.com/auth/documents"]),
        connectedAt: M3_SETUP_UPDATED_AT,
        expiresAt: M3_DEMO_SESSION_EXPIRES_AT
      },
      providerSecrets: Object.freeze([
        {
          provider: "OPENAI",
          status: PROVIDER_SECRET_READINESS_STATUSES.VALID,
          secretId: "secret_m3_openai",
          fingerprint: "fp_m3_openai",
          lastValidatedAt: M3_SETUP_UPDATED_AT,
          expiresAt: M3_DEMO_SECRET_EXPIRES_AT
        },
        {
          provider: "ANTHROPIC",
          status: PROVIDER_SECRET_READINESS_STATUSES.MISSING
        }
      ]),
      resourceSession: {
        status: RESOURCE_SESSION_READINESS_STATUSES.READY,
        sessionId: "resource_session_m3_demo",
        resourceRef: {
          connector: "google_docs",
          resourceId: "gdoc_m3_demo",
          resourceType: "document",
          displayName: "M3 setup fixture document"
        },
        resourceRevision: "rev_m3_demo",
        createdAt: M3_SETUP_UPDATED_AT
      },
      errors: Object.freeze([]),
      updatedAt: M3_SETUP_UPDATED_AT
    },
    {
      productSession: {
        status: PRODUCT_SESSION_STATUSES.EXPIRED,
        error: { code: "AUTHENTICATION_EXPIRED", category: "authentication", message: "Product session expired." }
      },
      googleOAuth: {
        provider: "google",
        status: GOOGLE_OAUTH_CONNECTION_STATUSES.RECONNECT_REQUIRED,
        googleAccountId: "google_account_m3_demo",
        error: {
          code: "OAUTH_RECONNECT_REQUIRED",
          category: "oauth",
          message: "Google connection must be refreshed."
        }
      },
      providerSecrets: Object.freeze([
        {
          provider: "OPENAI",
          status: PROVIDER_SECRET_READINESS_STATUSES.EXPIRED,
          fingerprint: "fp_m3_openai",
          expiresAt: "2026-06-06T17:30:00.000Z",
          error: { code: "PROVIDER_SECRET_EXPIRED", category: "authentication" }
        },
        {
          provider: "ANTHROPIC",
          status: PROVIDER_SECRET_READINESS_STATUSES.INVALID,
          lastValidatedAt: M3_SETUP_UPDATED_AT,
          error: { code: "PROVIDER_SECRET_INVALID", category: "authentication" }
        }
      ]),
      resourceSession: {
        status: RESOURCE_SESSION_READINESS_STATUSES.NOT_READY,
        error: { code: "RESOURCE_SESSION_NOT_READY", category: "validation" }
      },
      errors: Object.freeze([
        { kind: "product_session_expired", error: { code: "AUTHENTICATION_EXPIRED" } },
        { kind: "provider_secret_expired", error: { code: "PROVIDER_SECRET_EXPIRED" } },
        { kind: "resource_session_not_ready", error: { code: "RESOURCE_SESSION_NOT_READY" } }
      ]),
      updatedAt: M3_SETUP_UPDATED_AT
    }
  ]);
}

export function createSetupStatusCoverageFixtures(): readonly FirstRunSetupStatus[] {
  return Object.freeze([
    createCoverageStatus({
      sessionStatus: PRODUCT_SESSION_STATUSES.ANONYMOUS,
      googleStatus: GOOGLE_OAUTH_CONNECTION_STATUSES.NOT_CONNECTED,
      providerStatus: PROVIDER_SECRET_READINESS_STATUSES.MISSING,
      resourceStatus: RESOURCE_SESSION_READINESS_STATUSES.NOT_STARTED
    }),
    createCoverageStatus({
      sessionStatus: PRODUCT_SESSION_STATUSES.AUTHENTICATED,
      googleStatus: GOOGLE_OAUTH_CONNECTION_STATUSES.CONNECTED,
      providerStatus: PROVIDER_SECRET_READINESS_STATUSES.PENDING_VALIDATION,
      resourceStatus: RESOURCE_SESSION_READINESS_STATUSES.READY
    }),
    createCoverageStatus({
      sessionStatus: PRODUCT_SESSION_STATUSES.EXPIRED,
      googleStatus: GOOGLE_OAUTH_CONNECTION_STATUSES.RECONNECT_REQUIRED,
      providerStatus: PROVIDER_SECRET_READINESS_STATUSES.VALIDATION_FAILED,
      resourceStatus: RESOURCE_SESSION_READINESS_STATUSES.NOT_READY
    })
  ]);
}

function createCoverageStatus({
  sessionStatus,
  googleStatus,
  providerStatus,
  resourceStatus
}: {
  sessionStatus: ProductSessionStatus;
  googleStatus: GoogleOAuthConnectionStatus;
  providerStatus: ProviderSecretReadinessStatus;
  resourceStatus: ResourceSessionReadinessStatus;
}): FirstRunSetupStatus {
  return {
    productSession: {
      status: sessionStatus,
      ...(sessionStatus === PRODUCT_SESSION_STATUSES.AUTHENTICATED
        ? {
            tenantId: "tenant_m3_demo",
            userId: "user_m3_demo",
            authSubject: "auth_subject_m3_demo",
            sessionId: "session_m3_demo"
          }
        : {})
    },
    googleOAuth: {
      provider: "google",
      status: googleStatus,
      ...(googleStatus === GOOGLE_OAUTH_CONNECTION_STATUSES.CONNECTED
        ? { googleAccountId: "google_account_m3_demo", scopes: Object.freeze(["https://www.googleapis.com/auth/documents"]) }
        : {})
    },
    providerSecrets: Object.freeze([
      {
        provider: "OPENAI",
        status: providerStatus,
        ...(providerStatus === PROVIDER_SECRET_READINESS_STATUSES.VALID
          ? { secretId: "secret_m3_openai", fingerprint: "fp_m3_openai", expiresAt: M3_DEMO_SECRET_EXPIRES_AT }
          : {})
      }
    ]),
    resourceSession: {
      status: resourceStatus,
      ...(resourceStatus === RESOURCE_SESSION_READINESS_STATUSES.READY
        ? {
            sessionId: "resource_session_m3_demo",
            resourceRef: {
              connector: "google_docs",
              resourceId: "gdoc_m3_demo",
              resourceType: "document",
              displayName: "M3 setup fixture document"
            },
            resourceRevision: "rev_m3_demo"
          }
        : {})
    },
    errors: Object.freeze([]),
    updatedAt: M3_SETUP_UPDATED_AT
  };
}

export function createFirstRunSetupViewModel(status: FirstRunSetupStatus): FirstRunSetupViewModel {
  const productSession = mapProductSession(status.productSession);
  const googleOAuth = mapGoogleOAuth(status.googleOAuth);
  const providerSecrets = status.providerSecrets.map(mapProviderSecret);
  const resourceSession = mapResourceSession(status.resourceSession);
  const errors = status.errors.map(mapSetupError);
  const ready =
    productSession.tone === "ready" &&
    googleOAuth.tone === "ready" &&
    providerSecrets.some((provider) => provider.tone === "ready") &&
    resourceSession.tone === "ready" &&
    errors.length === 0;

  return {
    ready,
    updatedAt: status.updatedAt,
    contextPosture: M3_DEFAULT_CONTEXT_MODE,
    productSession,
    googleOAuth,
    providerSecrets,
    resourceSession,
    errors,
    safeLogEvent: createSafeSetupLogEvent(status, ready)
  };
}

function mapProductSession(session: ProductSessionStatusRef): SetupCardViewModel {
  if (session.status === PRODUCT_SESSION_STATUSES.AUTHENTICATED) {
    return {
      id: "product-session",
      label: AUTH_PRODUCT_SESSION_LABEL,
      status: "Authenticated",
      tone: "ready",
      message: "Signed in with a server-derived tenant and user.",
      metadata: compactMetadata([
        metadata("Tenant", session.tenantId),
        metadata("User", session.userId),
        metadata("Session", session.sessionId),
        metadata("Expires", session.expiresAt)
      ])
    };
  }

  if (session.status === PRODUCT_SESSION_STATUSES.EXPIRED) {
    return {
      id: "product-session",
      label: AUTH_PRODUCT_SESSION_LABEL,
      status: "Expired",
      tone: "blocked",
      message: "Sign in again before continuing setup.",
      metadata: []
    };
  }

  return {
    id: "product-session",
    label: AUTH_PRODUCT_SESSION_LABEL,
    status: "Anonymous",
    tone: "action",
    message: "Sign in to create a product session.",
    metadata: []
  };
}

function mapGoogleOAuth(connection: GoogleOAuthConnectionStatusRef): SetupCardViewModel {
  if (connection.status === GOOGLE_OAUTH_CONNECTION_STATUSES.CONNECTED) {
    return {
      id: "google-oauth",
      label: "Google connection",
      status: "Connected",
      tone: "ready",
      message: "Google OAuth is connected with metadata-only status.",
      metadata: compactMetadata([
        metadata("Provider", connection.provider),
        metadata("Account", connection.googleAccountId),
        metadata("Scopes", connection.scopes?.join(", ")),
        metadata("Expires", connection.expiresAt)
      ])
    };
  }

  if (connection.status === GOOGLE_OAUTH_CONNECTION_STATUSES.RECONNECT_REQUIRED) {
    return {
      id: "google-oauth",
      label: "Google connection",
      status: "Reconnect required",
      tone: "blocked",
      message: "Reconnect Google before choosing a document.",
      metadata: compactMetadata([metadata("Provider", connection.provider), metadata("Account", connection.googleAccountId)])
    };
  }

  return {
    id: "google-oauth",
    label: "Google connection",
    status: "Not connected",
    tone: "action",
    message: "Connect Google to discover Docs resources.",
    metadata: compactMetadata([metadata("Provider", connection.provider)])
  };
}

function mapProviderSecret(secret: ProviderSecretReadinessRef): SetupCardViewModel {
  const label = `${labelProvider(secret.provider)} key`;
  const commonMetadata = compactMetadata([
    metadata("Provider", secret.provider),
    metadata("Fingerprint", secret.fingerprint),
    metadata("Last checked", secret.lastValidatedAt),
    metadata("Expires", secret.expiresAt)
  ]);

  switch (secret.status) {
    case PROVIDER_SECRET_READINESS_STATUSES.VALID:
      return {
        id: `provider-${secret.provider.toLowerCase()}`,
        label,
        status: "Valid",
        tone: "ready",
        message: "Provider credentials are valid for this session.",
        metadata: commonMetadata
      };
    case PROVIDER_SECRET_READINESS_STATUSES.PENDING_VALIDATION:
      return {
        id: `provider-${secret.provider.toLowerCase()}`,
        label,
        status: "Pending validation",
        tone: "pending",
        message: "Waiting for backend provider-key validation.",
        metadata: commonMetadata
      };
    case PROVIDER_SECRET_READINESS_STATUSES.INVALID:
      return {
        id: `provider-${secret.provider.toLowerCase()}`,
        label,
        status: "Invalid",
        tone: "blocked",
        message: "Provider key validation failed. Enter a new key.",
        metadata: commonMetadata
      };
    case PROVIDER_SECRET_READINESS_STATUSES.EXPIRED:
      return {
        id: `provider-${secret.provider.toLowerCase()}`,
        label,
        status: "Expired",
        tone: "blocked",
        message: "Provider credentials expired. Enter a new key.",
        metadata: commonMetadata
      };
    case PROVIDER_SECRET_READINESS_STATUSES.VALIDATION_FAILED:
      return {
        id: `provider-${secret.provider.toLowerCase()}`,
        label,
        status: "Validation failed",
        tone: "blocked",
        message: "Provider validation could not complete. Retry without exposing the key.",
        metadata: commonMetadata
      };
    default:
      return {
        id: `provider-${secret.provider.toLowerCase()}`,
        label,
        status: "Missing",
        tone: "action",
        message: `Enter a ${labelProvider(secret.provider)} key to continue.`,
        metadata: commonMetadata
      };
  }
}

function mapResourceSession(session: ResourceSessionReadinessRef | undefined): SetupCardViewModel {
  if (session?.status === RESOURCE_SESSION_READINESS_STATUSES.READY) {
    return {
      id: "resource-session",
      label: "Resource session",
      status: "Ready",
      tone: "ready",
      message: "Google Docs resource session is ready.",
      metadata: compactMetadata([
        metadata("Session", session.sessionId),
        metadata("Resource", session.resourceRef?.displayName ?? session.resourceRef?.resourceId),
        metadata("Revision", session.resourceRevision)
      ])
    };
  }

  if (session?.status === RESOURCE_SESSION_READINESS_STATUSES.NOT_READY) {
    return {
      id: "resource-session",
      label: "Resource session",
      status: "Not ready",
      tone: "blocked",
      message: "Choose a Google Docs resource before starting.",
      metadata: []
    };
  }

  return {
    id: "resource-session",
    label: "Resource session",
    status: "Not started",
    tone: "idle",
    message: "Start a resource session after sign-in, Google, and provider setup are ready.",
    metadata: []
  };
}

function mapSetupError(errorRef: SetupErrorRef): SetupErrorViewModel {
  return {
    kind: errorRef.kind,
    message: SAFE_ERROR_MESSAGES[errorRef.kind] ?? "Setup needs user action before continuing.",
    code: errorRef.error?.code
  };
}

export function createSafeSetupLogEvent(status: FirstRunSetupStatus, ready = false): SafeSetupLogEvent {
  return {
    eventName: "first_run_setup_state_rendered",
    setupReady: ready,
    updatedAt: status.updatedAt,
    productSessionStatus: status.productSession.status,
    googleOAuthStatus: status.googleOAuth.status,
    providerSecretStatuses: status.providerSecrets.map((secret) => ({
      provider: secret.provider,
      status: secret.status
    })),
    resourceSessionStatus: status.resourceSession?.status ?? "unknown",
    errorKinds: status.errors.map((error) => error.kind)
  };
}

export function safeSetupLogExcludesForbiddenContent(event: SafeSetupLogEvent): boolean {
  const entries = Object.entries(JSON.parse(JSON.stringify(event))) as [string, unknown][];
  return entries.every(([key, value]) => keyAndValueAreSafe(key, value));
}

function keyAndValueAreSafe(key: string, value: unknown): boolean {
  if (FORBIDDEN_LOG_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
    return false;
  }

  if (typeof value === "string") {
    return !FORBIDDEN_LOG_VALUE_PATTERNS.some((pattern) => pattern.test(value));
  }

  if (Array.isArray(value)) {
    return value.every((item) => keyAndValueAreSafe(key, item));
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value).every(([childKey, childValue]) => keyAndValueAreSafe(childKey, childValue));
  }

  return true;
}

export function summarizeSetupCoverage(statuses: readonly FirstRunSetupStatus[]): readonly SetupCardViewModel[] {
  return statuses.flatMap((status) => {
    const viewModel = createFirstRunSetupViewModel(status);
    return [
      viewModel.productSession,
      viewModel.googleOAuth,
      ...viewModel.providerSecrets,
      viewModel.resourceSession
    ];
  });
}

export function getStatusCoverageLabels(statuses: readonly FirstRunSetupStatus[]): readonly string[] {
  return summarizeSetupCoverage(statuses).map((card) => `${card.label}: ${formatStatus(card.status)}`);
}
