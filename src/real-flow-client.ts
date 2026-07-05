export const REAL_FLOW_CLIENT_LOG_EVENT = "real-flow-client-state";

export const DEFAULT_REAL_FLOW_ENDPOINTS = Object.freeze({
  setupStatus: "/setup/status",
  googleConnect: "/oauth/google/start",
  googleCallback: "/oauth/google/callback",
  googleDisconnect: "/oauth/google/connection",
  resourceSession: "/resource-sessions/{sessionId}",
  contextConsent: "/resource-sessions/{sessionId}/context-consent",
  commandCreate: "/resource-sessions/{sessionId}/commands",
  actionDecision: "/resource-sessions/{sessionId}/actions/{actionId}/{decision}",
  actionApply: "/resource-sessions/{sessionId}/apply-action",
  sessionStream: "/sessions/{sessionId}/events"
});

export const DEFAULT_REAL_FLOW_SESSION_ID = "session_deployed_shape";

const SAFE_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  AUTHENTICATION_EXPIRED: "Sign in again before continuing.",
  OAUTH_RECONNECT_REQUIRED: "Reconnect Google before using this document.",
  GOOGLE_PERMISSION_DENIED: "Google permission is missing for this document.",
  AUTHORIZATION_DENIED: "This session is not authorized for the requested action.",
  PROVIDER_QUOTA_EXCEEDED: "Provider quota is temporarily limited. Retry later.",
  PROVIDER_UNAVAILABLE: "Provider access is temporarily unavailable.",
  STALE_DOCUMENT_REVISION: "The document changed. Refresh context before applying.",
  UNCERTAIN_MUTATION_STATE: "Mutation state is uncertain. Refresh before retrying.",
  RATE_LIMITED: "Too many requests. Retry after the service cools down.",
  DEPENDENCY_UNAVAILABLE: "A connected service is unavailable. Retry later."
});

export const REAL_FLOW_FORBIDDEN_LOG_PATTERNS = [
  /authorization[_ -]?header/i,
  /authorization:/i,
  /bearer/i,
  /oauth/i,
  /provider[_ -]?key/i,
  /api[_ -]?key/i,
  /prompt/i,
  /selected text/i,
  /document text/i,
  /model response/i,
  /screenshot/i,
  /ocr/i,
  /accessibility/i,
  /action payload/i,
  /raw content/i,
  /ciphertext/i,
  /secret material/i,
  /decrypted secret/i,
  /(^|[^a-z0-9])sk-[a-z0-9]/i
] as const;

export type RealFlowEndpointKey = keyof typeof DEFAULT_REAL_FLOW_ENDPOINTS;
export type RealFlowEndpointConfig = Readonly<Record<RealFlowEndpointKey, string>>;

export type RealFlowStepStatus =
  | "ready"
  | "loading"
  | "empty"
  | "disabled"
  | "retryable_error"
  | "blocked";

export type RealFlowErrorRef = {
  code: string;
  category: string;
  retryable: boolean;
};

export type RealFlowStepRef = {
  id: string;
  label: string;
  status: RealFlowStepStatus;
  route: RealFlowEndpointKey;
  pathParams?: Partial<Record<"actionId" | "decision", string>>;
  error?: RealFlowErrorRef;
  disabledReason?: string;
  retryAfterSeconds?: number;
};

export type RealFlowStepViewModel = {
  id: string;
  label: string;
  status: string;
  tone: "ready" | "pending" | "idle" | "blocked";
  message: string;
  route: string;
  retryable: boolean;
};

export type RealFlowClientState = {
  httpBaseUrl: string;
  sseBaseUrl: string;
  sessionId: string;
  endpoints: RealFlowEndpointConfig;
  steps: readonly RealFlowStepRef[];
};

export type RealFlowClientViewModel = {
  httpBaseUrl: string;
  streamUrl: string;
  durableRefreshRoute: string;
  sessionId: string;
  steps: readonly RealFlowStepViewModel[];
  safeLogEvent: RealFlowClientLogEvent;
};

export type RealFlowClientLogEvent = {
  event: typeof REAL_FLOW_CLIENT_LOG_EVENT;
  httpBaseUrl: string;
  streamPath: string;
  sessionId: string;
  stepStatuses: readonly {
    id: string;
    status: RealFlowStepStatus;
    errorCode: string | null;
    retryable: boolean;
  }[];
};

export function createRealFlowClientConfig(
  overrides: Partial<RealFlowEndpointConfig> = {}
): RealFlowEndpointConfig {
  return Object.freeze({
    ...DEFAULT_REAL_FLOW_ENDPOINTS,
    ...definedEndpointOverrides(overrides)
  });
}

export function createRealFlowClientStateFromRuntimeEnv(env: Record<string, string | undefined>): RealFlowClientState {
  return {
    ...createRealFlowClientDemoState(),
    httpBaseUrl: normalizeBaseUrl(env.VITE_API_BASE_URL, "http://localhost:8787"),
    sseBaseUrl: normalizeBaseUrl(env.VITE_SSE_BASE_URL, normalizeBaseUrl(env.VITE_API_BASE_URL, "http://localhost:8787")),
    sessionId: sanitizePathSegment(env.VITE_DEMO_SESSION_ID, DEFAULT_REAL_FLOW_SESSION_ID),
    endpoints: createRealFlowClientConfig({
      setupStatus: env.VITE_SETUP_STATUS_PATH,
      googleConnect: env.VITE_GOOGLE_CONNECT_PATH,
      googleCallback: env.VITE_GOOGLE_CALLBACK_PATH,
      googleDisconnect: env.VITE_GOOGLE_DISCONNECT_PATH,
      resourceSession: env.VITE_RESOURCE_SESSION_PATH,
      contextConsent: env.VITE_CONTEXT_CONSENT_PATH,
      commandCreate: env.VITE_COMMAND_CREATE_PATH,
      actionDecision: env.VITE_ACTION_DECISION_PATH,
      actionApply: env.VITE_ACTION_APPLY_PATH,
      sessionStream: env.VITE_SESSION_STREAM_PATH
    })
  };
}

export function createRealFlowClientDemoState(): RealFlowClientState {
  return {
    httpBaseUrl: "http://localhost:8787",
    sseBaseUrl: "http://localhost:8787",
    sessionId: DEFAULT_REAL_FLOW_SESSION_ID,
    endpoints: createRealFlowClientConfig(),
    steps: Object.freeze([
      {
        id: "product-session",
        label: "Product session",
        status: "ready",
        route: "setupStatus"
      },
      {
        id: "google-connect",
        label: "Google connect",
        status: "loading",
        route: "googleConnect"
      },
      {
        id: "provider-access",
        label: "Platform provider",
        status: "ready",
        route: "setupStatus"
      },
      {
        id: "expired-session",
        label: "Expired session",
        status: "retryable_error",
        route: "setupStatus",
        error: {
          code: "AUTHENTICATION_EXPIRED",
          category: "AUTHENTICATION",
          retryable: true
        }
      },
      {
        id: "document-readiness",
        label: "Document readiness",
        status: "empty",
        route: "resourceSession"
      },
      {
        id: "denied-request",
        label: "Denied request",
        status: "blocked",
        route: "actionDecision",
        pathParams: {
          actionId: "action_denied_demo",
          decision: "approve"
        },
        error: {
          code: "AUTHORIZATION_DENIED",
          category: "AUTHORIZATION",
          retryable: false
        }
      },
      {
        id: "ask-stream",
        label: "Ask and stream",
        status: "retryable_error",
        route: "commandCreate",
        error: {
          code: "PROVIDER_QUOTA_EXCEEDED",
          category: "PROVIDER_QUOTA",
          retryable: true
        },
        retryAfterSeconds: 30
      },
      {
        id: "apply-action",
        label: "Apply action",
        status: "blocked",
        route: "actionApply",
        error: {
          code: "STALE_DOCUMENT_REVISION",
          category: "CONFLICT",
          retryable: false
        }
      },
      {
        id: "uncertain-mutation",
        label: "Uncertain mutation",
        status: "blocked",
        route: "actionApply",
        error: {
          code: "UNCERTAIN_MUTATION_STATE",
          category: "DEPENDENCY",
          retryable: false
        }
      },
      {
        id: "provider-unavailable",
        label: "Provider unavailable",
        status: "retryable_error",
        route: "commandCreate",
        error: {
          code: "PROVIDER_UNAVAILABLE",
          category: "DEPENDENCY",
          retryable: true
        }
      },
      {
        id: "disconnect",
        label: "Google disconnect",
        status: "disabled",
        route: "googleDisconnect",
        disabledReason: "Disconnect is disabled while apply verification is unresolved."
      }
    ])
  };
}

export function createRealFlowClientViewModel(state: RealFlowClientState): RealFlowClientViewModel {
  return {
    httpBaseUrl: state.httpBaseUrl,
    streamUrl: createSessionStreamUrl(state.sseBaseUrl, state.endpoints.sessionStream, state.sessionId),
    durableRefreshRoute: materializeEndpointPath(state.endpoints.resourceSession, state.sessionId),
    sessionId: state.sessionId,
    steps: state.steps.map((step) => mapStep(step, state.endpoints, state.sessionId)),
    safeLogEvent: createRealFlowClientLogEvent(state)
  };
}

export function createRealFlowClientLogEvent(state: RealFlowClientState): RealFlowClientLogEvent {
  return {
    event: REAL_FLOW_CLIENT_LOG_EVENT,
    httpBaseUrl: state.httpBaseUrl,
    streamPath: state.endpoints.sessionStream,
    sessionId: state.sessionId,
    stepStatuses: state.steps.map((step) => ({
      id: step.id,
      status: step.status,
      errorCode: step.error?.code ?? null,
      retryable: step.error?.retryable ?? false
    }))
  };
}

export function createSessionStreamUrl(baseUrl: string, pathTemplate: string, sessionId: string): string {
  return joinUrl(baseUrl, materializeEndpointPath(pathTemplate, sessionId));
}

export function safeRealFlowLogExcludesForbiddenContent(event: RealFlowClientLogEvent): boolean {
  const serialized = JSON.stringify(event);
  return REAL_FLOW_FORBIDDEN_LOG_PATTERNS.every((pattern) => !pattern.test(serialized));
}

function mapStep(step: RealFlowStepRef, endpoints: RealFlowEndpointConfig, sessionId: string): RealFlowStepViewModel {
  const route = materializeEndpointPath(endpoints[step.route], sessionId, step.pathParams);

  switch (step.status) {
    case "ready":
      return {
        id: step.id,
        label: step.label,
        status: "Ready",
        tone: "ready",
        message: "Backend-shaped state is ready.",
        route,
        retryable: false
      };
    case "loading":
      return {
        id: step.id,
        label: step.label,
        status: "Loading",
        tone: "pending",
        message: "Request is in flight.",
        route,
        retryable: false
      };
    case "empty":
      return {
        id: step.id,
        label: step.label,
        status: "Empty",
        tone: "idle",
        message: "No active document is selected yet.",
        route,
        retryable: false
      };
    case "disabled":
      return {
        id: step.id,
        label: step.label,
        status: "Disabled",
        tone: "idle",
        message: step.disabledReason ?? "This action is disabled until required state is available.",
        route,
        retryable: false
      };
    case "retryable_error":
      return {
        id: step.id,
        label: step.label,
        status: "Retry",
        tone: "blocked",
        message: `${safeErrorMessage(step.error)}${step.retryAfterSeconds ? ` Retry after ${step.retryAfterSeconds}s.` : ""}`,
        route,
        retryable: true
      };
    default:
      return {
        id: step.id,
        label: step.label,
        status: "Blocked",
        tone: "blocked",
        message: safeErrorMessage(step.error),
        route,
        retryable: false
      };
  }
}

function materializeEndpointPath(
  pathTemplate: string,
  sessionId: string,
  pathParams: Partial<Record<"actionId" | "decision", string>> = {}
): string {
  return pathTemplate
    .replace("{sessionId}", encodeURIComponent(sessionId))
    .replace("{actionId}", encodeURIComponent(pathParams.actionId ?? "action_deployed_shape"))
    .replace("{decision}", encodeURIComponent(pathParams.decision ?? "approve"));
}

function safeErrorMessage(error: RealFlowErrorRef | undefined): string {
  if (error === undefined) {
    return "User action is required before continuing.";
  }

  return SAFE_ERROR_MESSAGES[error.code] ?? "The service returned a safe actionable error.";
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/$/, "") : fallback;
}

function sanitizePathSegment(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.replace(/[^a-zA-Z0-9_.:-]/g, "_");
}

function definedEndpointOverrides(overrides: Partial<Record<RealFlowEndpointKey, string | undefined>>): Partial<RealFlowEndpointConfig> {
  return Object.fromEntries(
    Object.entries(overrides).filter((entry): entry is [RealFlowEndpointKey, string] => typeof entry[1] === "string")
  );
}
