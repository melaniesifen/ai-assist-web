export const CONTEXT_MODES = Object.freeze({
  SELECTION: "SELECTION",
  ACTIVE_RESOURCE: "ACTIVE_RESOURCE"
} as const);

export const CONSENT_STATUSES = Object.freeze({
  ACTIVE: "active",
  MISSING: "missing",
  REVOKED: "revoked",
  EXPIRED: "expired"
} as const);

export const CONNECTOR_STATUSES = Object.freeze({
  SUCCESS: "success",
  RETRYABLE_ERROR: "retryable_error",
  TERMINAL_ERROR: "terminal_error"
} as const);

export type ContextMode = (typeof CONTEXT_MODES)[keyof typeof CONTEXT_MODES];
export type ConsentStatus = (typeof CONSENT_STATUSES)[keyof typeof CONSENT_STATUSES];
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[keyof typeof CONNECTOR_STATUSES];

export type ResourceRef = {
  connector: string;
  resourceId: string;
  resourceType: string;
  displayName?: string;
};

export type ProvenanceRef = {
  sourceType: string;
  trustLevel: string;
  connector: string;
  resourceId: string;
  resourceVersion?: string;
  clientSupplied: boolean;
  connectorVerified: boolean;
};

export type NormalizedContextRef = {
  contextId: string;
  sessionId: string;
  provider: string;
  resourceRef: ResourceRef;
  contextMode: ContextMode;
  sourceType: string;
  trustLevel: string;
  content?: string;
  contentHash: string;
  anchors?: readonly unknown[];
  resourceRevision?: string;
  metadata?: {
    truncated?: boolean;
    contentLength?: number;
    originalContentLength?: number;
    truncationReason?: string;
  };
  provenance: ProvenanceRef;
  capturedAt: string;
  expiresAt: string;
};

export type ConnectorErrorRef = {
  category: string;
  code: string;
  message?: string;
  retryAfterSeconds?: number;
  dependencyStatus?: string;
};

export type ConnectorResponseRef = {
  connector: string;
  operation: string;
  status: ConnectorStatus;
  requestId: string;
  resourceRevision?: string;
  result?: {
    context?: NormalizedContextRef;
    resourceRevision?: string;
  };
  error?: ConnectorErrorRef;
};

export type ContractErrorRef = {
  code: string;
  category: string;
  message?: string;
  httpStatus?: number;
  target?: string;
};

export type GoogleOAuthStatusRef = {
  provider: "google";
  status: "connected" | "reconnect_required" | "not_connected";
  googleAccountId?: string;
  error?: ContractErrorRef;
};

export type ContextReadinessInput = {
  id: string;
  title: string;
  contextMode: ContextMode;
  consentStatus: ConsentStatus;
  connectorResponse?: ConnectorResponseRef;
  consentError?: ContractErrorRef;
  googleOAuth?: GoogleOAuthStatusRef;
};

export type MetadataItem = {
  label: string;
  value: string;
};

export type ContextReadinessTone = "ready" | "blocked" | "warning";

export type ContextReadinessLogEvent = {
  eventName: "google_docs_read_path_state_rendered";
  scenarioId: string;
  contextMode: ContextMode;
  consentStatus: ConsentStatus;
  connectorStatus: ConnectorStatus | "not_called";
  failureCode: string | null;
  provenanceTrustLevel: string | null;
  truncated: boolean | null;
};

export type GoogleDocsReadinessViewModel = {
  id: string;
  title: string;
  tone: ContextReadinessTone;
  contextMode: ContextMode;
  contextLabel: string;
  statusLabel: string;
  consentLabel: string;
  consentMessage: string;
  userMessage: string;
  metadata: readonly MetadataItem[];
  failure: {
    code: string;
    message: string;
  } | null;
  safeLogEvent: ContextReadinessLogEvent;
};

const SAFE_FAILURE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  CONSENT_REQUIRED: "Grant access to this Google Doc before reading context.",
  OAUTH_RECONNECT_REQUIRED: "Reconnect Google before reading this document.",
  GOOGLE_DOCS_READ_PERMISSION_DENIED: "The connected Google account cannot read this document.",
  GOOGLE_DOCS_LIST_RATE_LIMITED: "Google resource discovery is rate limited. Try again later.",
  GOOGLE_DOCS_READ_TIMEOUT: "Google Docs did not respond in time. Retry later.",
  GOOGLE_DOCS_READ_UNAVAILABLE: "Google Docs read service is temporarily unavailable."
});

const FORBIDDEN_LOG_KEY_PATTERNS = [
  /api.?key/i,
  /provider.?key/i,
  /oauth.?token/i,
  /authorization/i,
  /document.?text/i,
  /selected.?text/i,
  /prompt/i,
  /model.?response/i,
  /screenshot/i,
  /ocr/i,
  /accessibility/i,
  /action.?payload/i
];

const FORBIDDEN_LOG_VALUE_PATTERNS = [
  /sk-[a-z0-9_-]+/i,
  /oauth_[a-z0-9_-]+/i,
  /bearer\s+[a-z0-9._-]+/i,
  /authorization:\s*bearer/i,
  /raw document/i,
  /selected text/i,
  /model response/i,
  /prompt:/i,
  /screenshot/i,
  /ocr/i,
  /accessibility tree/i,
  /action payload/i
];

function formatStatus(status: string): string {
  return status.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function metadata(label: string, value: string | number | boolean | undefined): MetadataItem | null {
  if (value === undefined || value === "") {
    return null;
  }

  return { label, value: String(value) };
}

function compactMetadata(items: readonly (MetadataItem | null)[]): MetadataItem[] {
  return items.filter((item): item is MetadataItem => item !== null);
}

export function createGoogleDocsReadinessViewModel(input: ContextReadinessInput): GoogleDocsReadinessViewModel {
  const context = input.connectorResponse?.result?.context;
  const failureCode = getFailureCode(input);
  const connectorStatus = input.connectorResponse?.status ?? "not_called";
  const hasConsent = input.consentStatus === CONSENT_STATUSES.ACTIVE;
  const ready = hasConsent && connectorStatus === CONNECTOR_STATUSES.SUCCESS && context !== undefined;
  const tone = ready ? "ready" : connectorStatus === CONNECTOR_STATUSES.RETRYABLE_ERROR ? "warning" : "blocked";
  const failure = failureCode === null ? null : { code: failureCode, message: getSafeFailureMessage(failureCode) };

  return {
    id: input.id,
    title: input.title,
    tone,
    contextMode: input.contextMode,
    contextLabel: getContextLabel(input.contextMode),
    statusLabel: ready ? "Ready" : failure?.message ?? "Blocked",
    consentLabel: formatStatus(input.consentStatus),
    consentMessage: getConsentMessage(input.consentStatus),
    userMessage: getUserMessage({ ready, input, failure }),
    metadata: context === undefined ? [] : createContextMetadata(context),
    failure,
    safeLogEvent: {
      eventName: "google_docs_read_path_state_rendered",
      scenarioId: input.id,
      contextMode: input.contextMode,
      consentStatus: input.consentStatus,
      connectorStatus,
      failureCode,
      provenanceTrustLevel: context?.provenance.trustLevel ?? null,
      truncated: context?.metadata?.truncated ?? null
    }
  };
}

function createContextMetadata(context: NormalizedContextRef): readonly MetadataItem[] {
  return compactMetadata([
    metadata("Resource", context.resourceRef.displayName ?? context.resourceRef.resourceId),
    metadata("Content hash", context.contentHash),
    metadata("Revision", context.resourceRevision ?? context.provenance.resourceVersion),
    metadata("Source", context.sourceType),
    metadata("Trust", context.trustLevel),
    metadata("Provenance", context.provenance.connectorVerified ? "connector verified" : "client supplied"),
    metadata("Client supplied", context.provenance.clientSupplied),
    metadata("Truncated", context.metadata?.truncated ?? false),
    metadata("Content length", context.metadata?.contentLength),
    metadata("Original length", context.metadata?.originalContentLength),
    metadata("Truncation reason", context.metadata?.truncationReason)
  ]);
}

function getFailureCode(input: ContextReadinessInput): string | null {
  if (input.googleOAuth?.status === "reconnect_required") {
    return input.googleOAuth.error?.code ?? "OAUTH_RECONNECT_REQUIRED";
  }

  if (input.consentStatus !== CONSENT_STATUSES.ACTIVE) {
    return input.consentError?.code ?? "CONSENT_REQUIRED";
  }

  return input.connectorResponse?.error?.code ?? null;
}

function getSafeFailureMessage(code: string): string {
  return SAFE_FAILURE_MESSAGES[code] ?? "Read context is unavailable. Try again later.";
}

function getContextLabel(contextMode: ContextMode): string {
  return contextMode === CONTEXT_MODES.ACTIVE_RESOURCE ? "Active resource" : "Selection";
}

function getConsentMessage(consentStatus: ConsentStatus): string {
  switch (consentStatus) {
    case CONSENT_STATUSES.ACTIVE:
      return "Consent is active for this Google Docs context mode.";
    case CONSENT_STATUSES.REVOKED:
      return "Consent was revoked before context capture.";
    case CONSENT_STATUSES.EXPIRED:
      return "Consent expired before context capture.";
    default:
      return "Consent is required before context capture.";
  }
}

function getUserMessage({
  ready,
  input,
  failure
}: {
  ready: boolean;
  input: ContextReadinessInput;
  failure: GoogleDocsReadinessViewModel["failure"];
}): string {
  if (ready) {
    return `${getContextLabel(input.contextMode)} read path is ready with metadata-only context display.`;
  }

  if (failure !== null) {
    return failure.message;
  }

  return "Read context is blocked until backend readiness checks pass.";
}

export function createGoogleDocsReadinessDemoStates(): readonly ContextReadinessInput[] {
  return Object.freeze([
    {
      id: "selection-ready",
      title: "Selection context ready",
      contextMode: CONTEXT_MODES.SELECTION,
      consentStatus: CONSENT_STATUSES.ACTIVE,
      connectorResponse: createDemoConnectorResponse({
        context: createDemoContext({
          contextId: "ctx_google_docs_selection",
          contextMode: CONTEXT_MODES.SELECTION,
          sourceType: "connector_selection",
          contentHash: "sha256:google-docs-selection",
          contentLength: 24,
          truncated: false
        })
      })
    },
    {
      id: "active-resource-ready",
      title: "Active resource ready",
      contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: CONSENT_STATUSES.ACTIVE,
      connectorResponse: createDemoConnectorResponse({
        context: createDemoContext({
          contextId: "ctx_google_docs_active_resource",
          contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
          sourceType: "connector_resource_excerpt",
          contentHash: "sha256:google-docs-active-resource",
          contentLength: 4200,
          truncated: false
        })
      })
    },
    {
      id: "active-resource-truncated",
      title: "Active resource truncated",
      contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: CONSENT_STATUSES.ACTIVE,
      connectorResponse: createDemoConnectorResponse({
        context: createDemoContext({
          contextId: "ctx_google_docs_truncated",
          contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
          sourceType: "connector_resource_excerpt",
          contentHash: "sha256:google-docs-truncated",
          contentLength: 6000,
          originalContentLength: 18000,
          truncated: true,
          truncationReason: "MAX_CONTEXT_BYTES"
        })
      })
    },
    {
      id: "missing-consent",
      title: "Missing consent",
      contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: CONSENT_STATUSES.MISSING,
      consentError: {
        code: "CONSENT_REQUIRED",
        category: "CONSENT_REQUIRED",
        target: "contextConsentGrant"
      }
    },
    {
      id: "revoked-consent",
      title: "Revoked consent",
      contextMode: CONTEXT_MODES.SELECTION,
      consentStatus: CONSENT_STATUSES.REVOKED,
      consentError: {
        code: "CONSENT_REQUIRED",
        category: "CONSENT_REQUIRED",
        target: "contextConsentGrant"
      }
    },
    {
      id: "expired-consent",
      title: "Expired consent",
      contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: CONSENT_STATUSES.EXPIRED,
      consentError: {
        code: "CONSENT_REQUIRED",
        category: "CONSENT_REQUIRED",
        target: "contextConsentGrant"
      }
    },
    {
      id: "reconnect-required",
      title: "Reconnect required",
      contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: CONSENT_STATUSES.ACTIVE,
      googleOAuth: {
        provider: "google",
        status: "reconnect_required",
        googleAccountId: "google_account_read_path_demo",
        error: {
          code: "OAUTH_RECONNECT_REQUIRED",
          category: "OAUTH",
          target: "googleOAuth"
        }
      }
    },
    {
      id: "permission-failure",
      title: "Permission failure",
      contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: CONSENT_STATUSES.ACTIVE,
      connectorResponse: {
        connector: "google_docs",
        operation: "ReadContext",
        status: CONNECTOR_STATUSES.TERMINAL_ERROR,
        requestId: "req_google_docs_permission",
        error: {
          category: "authorization",
          code: "GOOGLE_DOCS_READ_PERMISSION_DENIED"
        }
      }
    }
  ]);
}

function createDemoConnectorResponse({ context }: { context: NormalizedContextRef }): ConnectorResponseRef {
  return {
    connector: "google_docs",
    operation: "ReadContext",
    status: CONNECTOR_STATUSES.SUCCESS,
    requestId: `req_${context.contextId}`,
    resourceRevision: context.resourceRevision,
    result: {
      context,
      resourceRevision: context.resourceRevision
    }
  };
}

function createDemoContext({
  contextId,
  contextMode,
  sourceType,
  contentHash,
  contentLength,
  originalContentLength,
  truncated,
  truncationReason
}: {
  contextId: string;
  contextMode: ContextMode;
  sourceType: string;
  contentHash: string;
  contentLength: number;
  originalContentLength?: number;
  truncated: boolean;
  truncationReason?: string;
}): NormalizedContextRef {
  const resourceRevision = "rev_google_docs_demo";
  const resourceId = "gdoc_read_path_demo";

  return {
    contextId,
    sessionId: "session_read_path_demo",
    provider: "google_docs",
    resourceRef: {
      connector: "google_docs",
      resourceId,
      resourceType: "document",
      displayName: "Google Docs readiness fixture document"
    },
    contextMode,
    sourceType,
    trustLevel: "connector_verified",
    contentHash,
    anchors: Object.freeze([]),
    resourceRevision,
    metadata: {
      truncated,
      contentLength,
      ...(originalContentLength === undefined ? {} : { originalContentLength }),
      ...(truncationReason === undefined ? {} : { truncationReason })
    },
    provenance: {
      sourceType,
      trustLevel: "connector_verified",
      connector: "google_docs",
      resourceId,
      resourceVersion: resourceRevision,
      clientSupplied: false,
      connectorVerified: true
    },
    capturedAt: "2026-06-07T12:00:00.000Z",
    expiresAt: "2026-06-07T12:15:00.000Z"
  };
}

export function createContextReadinessLogEvent(input: ContextReadinessInput): ContextReadinessLogEvent {
  return createGoogleDocsReadinessViewModel(input).safeLogEvent;
}

export function safeContextReadinessLogExcludesForbiddenContent(event: ContextReadinessLogEvent): boolean {
  return keyAndValueAreSafe("event", event);
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
