export const DOGFOOD_SIDEBAR_STATE_LOG_EVENT = "dogfood-sidebar-state";

export type ProductAuthStatus = "unknown" | "signed_out" | "signing_in" | "signed_in" | "expired" | "error";
export type GoogleOAuthStatus =
  | "unknown"
  | "not_connected"
  | "connecting"
  | "connected"
  | "reconnect_required"
  | "access_denied"
  | "dependency_error";
export type ActiveDocumentStatus = "unsupported_page" | "missing_document_id" | "detected";
export type ContextReadinessStatus =
  | "idle"
  | "loading"
  | "ready"
  | "consent_required"
  | "permission_denied"
  | "unavailable"
  | "error";
export type ProviderReadinessStatus = "unknown" | "ready" | "missing" | "unavailable" | "rate_limited" | "error";
export type CommandSubmissionStatus = "idle" | "ready" | "submitting" | "accepted" | "blocked" | "failed";
export type StreamStateStatus = "disconnected" | "connecting" | "open" | "reconnect_required" | "closed" | "error" | "unavailable";
export type ProposedActionsStatus = "none" | "loading" | "ready" | "blocked" | "error";
export type ApplyReadinessStatus = "blocked" | "ready" | "applying" | "applied" | "conflicted" | "failed" | "uncertain";

export type DogfoodSidebarBlockerCode =
  | "PRODUCT_AUTH_REQUIRED"
  | "PRODUCT_AUTH_EXPIRED"
  | "GOOGLE_OAUTH_REQUIRED"
  | "GOOGLE_OAUTH_RECONNECT_REQUIRED"
  | "GOOGLE_OAUTH_BLOCKED"
  | "UNSUPPORTED_PAGE"
  | "ACTIVE_DOCUMENT_REQUIRED"
  | "CONTEXT_CONSENT_REQUIRED"
  | "CONTEXT_PERMISSION_DENIED"
  | "CONTEXT_UNAVAILABLE"
  | "PROVIDER_REQUIRED"
  | "PROVIDER_UNAVAILABLE"
  | "COMMAND_IN_FLIGHT"
  | "COMMAND_FAILED"
  | "STREAM_REFRESH_REQUIRED"
  | "PROPOSED_ACTIONS_UNAVAILABLE"
  | "APPLY_WRITE_APPROVAL_REQUIRED"
  | "APPLY_BACKEND_NOT_READY"
  | "APPLY_UNCERTAIN";

export interface DogfoodSidebarContractInput {
  productAuth: ProductAuthStatus;
  googleOAuth: GoogleOAuthStatus;
  activeDocument: {
    status: ActiveDocumentStatus;
    documentId?: string | null;
  };
  context: ContextReadinessStatus;
  provider: ProviderReadinessStatus;
  command: CommandSubmissionStatus;
  stream: StreamStateStatus;
  proposedActions: ProposedActionsStatus;
  apply: ApplyReadinessStatus;
  controlledDocumentWriteApproved: boolean;
}

export interface DogfoodSidebarBlocker {
  code: DogfoodSidebarBlockerCode;
  message: string;
  area: "auth" | "google" | "document" | "context" | "provider" | "command" | "stream" | "actions" | "apply";
  retryable: boolean;
}

export interface DogfoodSidebarState {
  defaultSurface: "assistant";
  activeDocumentId: string | null;
  canSubmitCommand: boolean;
  canOpenStream: boolean;
  canReviewProposedActions: boolean;
  canApplyApprovedAction: boolean;
  commandReadiness: "ready" | "blocked" | "in_progress" | "accepted" | "failed";
  streamReadiness: "available" | "pending" | "refresh_required" | "unavailable";
  applyReadiness: "ready" | "blocked" | "in_progress" | "terminal" | "uncertain";
  blockers: DogfoodSidebarBlocker[];
  safeLogEvent: DogfoodSidebarSafeLogEvent;
  devHarnessDisposition: DevHarnessDisposition[];
}

export interface DogfoodSidebarSafeLogEvent {
  eventName: typeof DOGFOOD_SIDEBAR_STATE_LOG_EVENT;
  productAuth: ProductAuthStatus;
  googleOAuth: GoogleOAuthStatus;
  activeDocumentStatus: ActiveDocumentStatus;
  hasActiveDocumentId: boolean;
  context: ContextReadinessStatus;
  provider: ProviderReadinessStatus;
  command: CommandSubmissionStatus;
  stream: StreamStateStatus;
  proposedActions: ProposedActionsStatus;
  apply: ApplyReadinessStatus;
  blockerCodes: DogfoodSidebarBlockerCode[];
}

export interface DevHarnessDisposition {
  id: "setup-harness" | "context-readiness-harness" | "real-flow-harness" | "session-stream-harness" | "mock-chat-review-demo";
  disposition: "hide_behind_dev_affordance" | "remove_from_dogfood_build";
  reason: string;
}

const FORBIDDEN_LOG_PATTERNS = [
  /authorization/i,
  /bearer/i,
  /oauth[_ -]?token/i,
  /access[_ -]?token/i,
  /refresh[_ -]?token/i,
  /provider[_ -]?key/i,
  /api[_ -]?key/i,
  /document[_ -]?text/i,
  /selected[_ -]?text/i,
  /raw[_ -]?prompt/i,
  /model[_ -]?output/i,
  /action[_ -]?payload/i,
  /screenshot/i,
  /ocr/i,
  /accessibility[_ -]?tree/i
];

export function createDogfoodSidebarState(input: DogfoodSidebarContractInput): DogfoodSidebarState {
  const blockers = createBlockers(input);
  const upstreamReady = hasUpstreamReadiness(input);
  const commandReadiness = mapCommandReadiness(input.command, blockers);
  const streamReadiness = mapStreamReadiness(input.stream);
  const applyReadiness = mapApplyReadiness(input.apply);
  const canSubmitCommand = upstreamReady && (input.command === "idle" || input.command === "ready");
  const canOpenStream = upstreamReady && (canSubmitCommand || input.command === "accepted" || input.stream === "open");
  const canReviewProposedActions = upstreamReady && input.proposedActions === "ready" && !["blocked", "submitting"].includes(input.command);
  const canApplyApprovedAction =
    canReviewProposedActions &&
    input.apply === "ready" &&
    input.controlledDocumentWriteApproved &&
    input.stream !== "reconnect_required";

  return {
    defaultSurface: "assistant",
    activeDocumentId: getDetectedDocumentId(input),
    canSubmitCommand,
    canOpenStream,
    canReviewProposedActions,
    canApplyApprovedAction,
    commandReadiness,
    streamReadiness,
    applyReadiness,
    blockers,
    safeLogEvent: createSafeLogEvent(input, blockers),
    devHarnessDisposition: createDevHarnessDisposition()
  };
}

export function safeDogfoodSidebarLogExcludesForbiddenContent(event: DogfoodSidebarSafeLogEvent): boolean {
  const serialized = JSON.stringify(event);
  return FORBIDDEN_LOG_PATTERNS.every((pattern) => !pattern.test(serialized));
}

export function createDevHarnessDisposition(): DevHarnessDisposition[] {
  return [
    {
      id: "setup-harness",
      disposition: "hide_behind_dev_affordance",
      reason: "Useful for deterministic auth/OAuth/provider coverage, but it cannot be the dogfood default view."
    },
    {
      id: "context-readiness-harness",
      disposition: "hide_behind_dev_affordance",
      reason: "Useful for blocked-state coverage, but dogfood users should see compact active-document readiness."
    },
    {
      id: "real-flow-harness",
      disposition: "hide_behind_dev_affordance",
      reason: "Useful for route-shape diagnostics, but dogfood users should see assistant command readiness."
    },
    {
      id: "session-stream-harness",
      disposition: "hide_behind_dev_affordance",
      reason: "Useful for SSE reducer diagnostics, but dogfood users should see assistant progress and final output."
    },
    {
      id: "mock-chat-review-demo",
      disposition: "remove_from_dogfood_build",
      reason: "Mocked chat and proposed edits must not appear as product state unless explicitly labeled in tests."
    }
  ];
}

function createBlockers(input: DogfoodSidebarContractInput): DogfoodSidebarBlocker[] {
  const blockers: DogfoodSidebarBlocker[] = [];

  if (input.productAuth === "signed_out" || input.productAuth === "unknown" || input.productAuth === "signing_in") {
    blockers.push(blocker("PRODUCT_AUTH_REQUIRED", "Sign in to AI Assist before using the sidebar.", "auth", true));
  }
  if (input.productAuth === "error") {
    blockers.push(blocker("PRODUCT_AUTH_REQUIRED", "Product sign-in is blocked by an authentication error.", "auth", true));
  }
  if (input.productAuth === "expired") {
    blockers.push(blocker("PRODUCT_AUTH_EXPIRED", "Sign in again before using the sidebar.", "auth", true));
  }
  if (input.googleOAuth === "not_connected" || input.googleOAuth === "unknown" || input.googleOAuth === "connecting") {
    blockers.push(blocker("GOOGLE_OAUTH_REQUIRED", "Connect Google before reading this document.", "google", true));
  }
  if (input.googleOAuth === "reconnect_required") {
    blockers.push(blocker("GOOGLE_OAUTH_RECONNECT_REQUIRED", "Reconnect Google before reading this document.", "google", true));
  }
  if (input.googleOAuth === "access_denied" || input.googleOAuth === "dependency_error") {
    blockers.push(blocker("GOOGLE_OAUTH_BLOCKED", "Google OAuth is blocked by authorization or backend configuration.", "google", true));
  }
  if (input.activeDocument.status === "unsupported_page") {
    blockers.push(blocker("UNSUPPORTED_PAGE", "Open a supported Google Docs document.", "document", false));
  }
  if (input.activeDocument.status === "missing_document_id") {
    blockers.push(blocker("ACTIVE_DOCUMENT_REQUIRED", "The sidebar could not identify the active Google Doc.", "document", true));
  }
  if (input.activeDocument.status === "detected" && !getDetectedDocumentId(input)) {
    blockers.push(blocker("ACTIVE_DOCUMENT_REQUIRED", "The sidebar could not identify the active Google Doc.", "document", true));
  }
  if (input.context === "idle" || input.context === "loading") {
    blockers.push(blocker("CONTEXT_UNAVAILABLE", "Document context is not ready yet.", "context", true));
  }
  if (input.context === "consent_required") {
    blockers.push(blocker("CONTEXT_CONSENT_REQUIRED", "Approve document context access before submitting a command.", "context", true));
  }
  if (input.context === "permission_denied") {
    blockers.push(blocker("CONTEXT_PERMISSION_DENIED", "Google permission is missing for this document.", "context", false));
  }
  if (input.context === "unavailable" || input.context === "error") {
    blockers.push(blocker("CONTEXT_UNAVAILABLE", "Document context is not available from the backend.", "context", true));
  }
  if (input.provider === "missing" || input.provider === "unknown") {
    blockers.push(blocker("PROVIDER_REQUIRED", "Provider access is required before submitting a command.", "provider", true));
  }
  if (input.provider === "unavailable" || input.provider === "rate_limited" || input.provider === "error") {
    blockers.push(blocker("PROVIDER_UNAVAILABLE", "Provider access is temporarily unavailable.", "provider", true));
  }
  if (input.command === "submitting") {
    blockers.push(blocker("COMMAND_IN_FLIGHT", "Wait for the current command to finish.", "command", false));
  }
  if (input.command === "failed") {
    blockers.push(blocker("COMMAND_FAILED", "Retry the command after reviewing the backend error.", "command", true));
  }
  if (input.command === "blocked") {
    blockers.push(blocker("COMMAND_FAILED", "Command submission is blocked until readiness is refreshed.", "command", true));
  }
  if (input.stream === "reconnect_required") {
    blockers.push(blocker("STREAM_REFRESH_REQUIRED", "Refresh durable session state before applying changes.", "stream", true));
  }
  if (input.proposedActions === "blocked" || input.proposedActions === "error") {
    blockers.push(blocker("PROPOSED_ACTIONS_UNAVAILABLE", "Proposed actions are not ready for review.", "actions", true));
  }
  if (!input.controlledDocumentWriteApproved) {
    blockers.push(blocker("APPLY_WRITE_APPROVAL_REQUIRED", "Controlled-document write approval is required before apply.", "apply", false));
  }
  if (input.apply === "blocked" || input.apply === "failed" || input.apply === "conflicted") {
    blockers.push(blocker("APPLY_BACKEND_NOT_READY", "Apply is blocked until backend action state is ready.", "apply", true));
  }
  if (input.apply === "uncertain") {
    blockers.push(blocker("APPLY_UNCERTAIN", "Mutation state is uncertain. Refresh before retrying.", "apply", false));
  }

  return blockers;
}

function hasUpstreamReadiness(input: DogfoodSidebarContractInput): boolean {
  return (
    input.productAuth === "signed_in" &&
    input.googleOAuth === "connected" &&
    Boolean(getDetectedDocumentId(input)) &&
    input.context === "ready" &&
    input.provider === "ready"
  );
}

function getDetectedDocumentId(input: DogfoodSidebarContractInput): string | null {
  if (input.activeDocument.status !== "detected") {
    return null;
  }
  const documentId = input.activeDocument.documentId?.trim();
  return documentId ? documentId : null;
}

function blocker(
  code: DogfoodSidebarBlockerCode,
  message: string,
  area: DogfoodSidebarBlocker["area"],
  retryable: boolean
): DogfoodSidebarBlocker {
  return { code, message, area, retryable };
}

function mapCommandReadiness(
  command: CommandSubmissionStatus,
  blockers: DogfoodSidebarBlocker[]
): DogfoodSidebarState["commandReadiness"] {
  if (command === "submitting") {
    return "in_progress";
  }
  if (command === "accepted") {
    return "accepted";
  }
  if (command === "failed") {
    return "failed";
  }
  return hasCommandBlockingDependency(blockers) ? "blocked" : "ready";
}

function mapStreamReadiness(stream: StreamStateStatus): DogfoodSidebarState["streamReadiness"] {
  if (stream === "open") {
    return "available";
  }
  if (stream === "connecting" || stream === "disconnected") {
    return "pending";
  }
  if (stream === "reconnect_required") {
    return "refresh_required";
  }
  return "unavailable";
}

function mapApplyReadiness(apply: ApplyReadinessStatus): DogfoodSidebarState["applyReadiness"] {
  if (apply === "ready") {
    return "ready";
  }
  if (apply === "applying") {
    return "in_progress";
  }
  if (apply === "applied" || apply === "conflicted" || apply === "failed") {
    return "terminal";
  }
  if (apply === "uncertain") {
    return "uncertain";
  }
  return "blocked";
}

function hasCommandBlockingDependency(blockers: DogfoodSidebarBlocker[]): boolean {
  return blockers.some((blocker) =>
    ["auth", "google", "document", "context", "provider", "command"].includes(blocker.area)
  );
}

function createSafeLogEvent(
  input: DogfoodSidebarContractInput,
  blockers: DogfoodSidebarBlocker[]
): DogfoodSidebarSafeLogEvent {
  return {
    eventName: DOGFOOD_SIDEBAR_STATE_LOG_EVENT,
    productAuth: input.productAuth,
    googleOAuth: input.googleOAuth,
    activeDocumentStatus: input.activeDocument.status,
    hasActiveDocumentId: input.activeDocument.status === "detected" && Boolean(input.activeDocument.documentId),
    context: input.context,
    provider: input.provider,
    command: input.command,
    stream: input.stream,
    proposedActions: input.proposedActions,
    apply: input.apply,
    blockerCodes: blockers.map((blocker) => blocker.code)
  };
}
