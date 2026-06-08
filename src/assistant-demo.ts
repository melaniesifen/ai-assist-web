import { CONTEXT_MODE_IDS, getContextModeOptions } from "./context-modes";
import { mapUserFacingError, type UserFacingError } from "./error-mapping";
import { FORBIDDEN_EXTENSION_RETENTION } from "./extension-surface";
import { PROPOSED_ACTION_STATUSES, getProposedActionState, type ProposedActionStatus } from "./proposed-actions";

export const ASSISTANT_DEMO_SESSION_ID = "session_assistant_demo";
export const ASSISTANT_DEMO_DOCUMENT_ID = "gdoc_google_docs_demo";
export const ASSISTANT_DEMO_DOCUMENT_TITLE = "Google Docs fixture document";
export const ASSISTANT_DEMO_RESOURCE_REVISION = "rev_google_docs";
export const APPLY_IDEMPOTENCY_PREFIX = "idem_apply";
export const ASSISTANT_DEMO_CONTRACT_VERSION = Object.freeze({
  major: 0,
  minor: 1,
  patch: 0
});
export const ASSISTANT_DEMO_IDENTITY_SCOPE = Object.freeze({
  tenantId: "tenant_google_docs_demo",
  userId: "user_google_docs_demo",
  authSubject: "auth_subject_google_docs_demo",
  requestId: "req_google_docs_demo",
  correlationId: "corr_google_docs_demo"
});

export type ReviewActionType = "REPLACE_TEXT" | "INSERT_TEXT";
export type ReviewConflictKind = "STALE" | "AMBIGUOUS" | "OVERLAPPING" | "UNVERIFIABLE";

export type AssistantShellState = {
  panelAvailable: boolean;
  panelOpen: boolean;
  bridge: ContentScriptBridgeViewModel;
};

export type ContentScriptBridgeViewModel = {
  supportState: "READY" | "UNSUPPORTED_PAGE" | "MISSING_DOCUMENT_ID";
  documentId: string | null;
  title: string;
  url: string;
  resourceRevision: string;
  source: "GOOGLE_DOCS_CONTENT_SCRIPT";
};

export type ContractActionTargetRange = {
  start: number;
  end: number;
};

export type ContractActionTargetAnchor = {
  connector: string;
  anchorId: string;
  resourceRevision?: string;
};

export type ContractProposedActionReviewRef = {
  actionId: string;
  actionType: ReviewActionType;
  status: ProposedActionStatus;
  resourceRef: {
    resourceId: string;
    displayName?: string;
    externalUrl?: string;
  };
  target: {
    targetAnchor?: ContractActionTargetAnchor;
    targetRange?: ContractActionTargetRange;
  };
  originalTextHash?: string;
  currentText?: string;
  proposedText: string;
  surroundingText?: string;
  rationale?: string;
  expiresAt?: string;
  conflictReasonCode?: string;
};

export type ReviewCardViewModel = {
  actionId: string;
  actionType: ReviewActionType;
  status: ProposedActionStatus;
  statusLabel: string;
  resourceId: string;
  resourceTitle: string;
  targetText: string;
  replacementText: string;
  surroundingContext: string;
  rationale: string;
  targetRange: {
    start: number;
    end: number;
  } | null;
  targetAnchor: ContractActionTargetAnchor | null;
  originalTextHash: string | null;
  idempotencyKey: string;
  conflict: ConflictDisplayModel | null;
  canApprove: boolean;
  canReject: boolean;
  canApply: boolean;
  isSafeForApproveAll: boolean;
  lastCommand: BackendCommandView | null;
  pendingApplyCommand: BackendCommandView | null;
  applyResponse: BackendApplyResponseView | null;
  applyDisplay: ApplyDisplayModel | null;
  duplicateNotice: string | null;
};

export type ConflictDisplayModel = {
  kind: ReviewConflictKind;
  reasonCode: string;
  title: string;
  message: string;
  noMutation: true;
};

export type BackendCommandView = {
  contractVersion: typeof ASSISTANT_DEMO_CONTRACT_VERSION;
  commandId: string;
  commandType: "actions.approve" | "actions.reject" | "actions.apply";
  identityScope: typeof ASSISTANT_DEMO_IDENTITY_SCOPE;
  idempotencyKey?: string;
  payload: {
    sessionId: string;
    actionId: string;
    reasonCode?: string;
  };
};

export type BackendApplyResponseView = {
  commandId: string;
  commandType: "actions.apply";
  status: "completed" | "rejected";
  result?: {
    actionId: string;
    sessionId: string;
    resourceId: string;
    status: Extract<ProposedActionStatus, "APPLIED" | "CONFLICTED" | "FAILED" | "EXPIRED">;
    idempotencyKey: string;
    replayed?: boolean;
    operationId?: string;
    conflictReasonCode?: string;
    failureCode?: string;
    resourceRevision?: string;
    resultRecordedAt?: string;
  };
  error?: {
    category: string;
    code: string;
    retryable: boolean;
  };
};

export type ApplyDisplayModel = {
  kind: "DURABLE_RESULT" | "SAFE_ERROR" | "DUPLICATE_REPLAY";
  title: string;
  message: string;
  code: string | null;
  retryable: boolean;
};

export type ActionStatusChangedEvent = {
  type: "action.status_changed";
  eventId?: string;
  createdAt?: string;
  payload?: {
    actionId?: string;
    previousStatus?: string;
    status?: string;
    reasonCode?: string;
  };
  actionId?: string;
  status?: string;
  reasonCode?: string;
};

export type ApproveAllState = {
  enabled: boolean;
  reason: string | null;
};

export type MockApplyResult = BackendApplyResponseView;

export type MockChatState = {
  messages: readonly MockChatMessage[];
  progress: string | null;
  isSubmitting: boolean;
};

export type MockChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "SENT" | "PROGRESS" | "FINAL";
};

export type SafeClientLogEvent = {
  eventName: string;
  metadata: Record<string, string | number | boolean | null>;
};

const EMPTY_REVIEW_TEXT = "";
const SAFE_LOG_TEXT = "[redacted]";

export const DEMO_DOCUMENT_URL = `https://docs.google.com/document/d/${ASSISTANT_DEMO_DOCUMENT_ID}/edit`;
const GOOGLE_DOCS_RESOURCE_REF = Object.freeze({
  connector: "google_docs",
  resourceId: ASSISTANT_DEMO_DOCUMENT_ID,
  resourceType: "document",
  displayName: ASSISTANT_DEMO_DOCUMENT_TITLE,
  externalUrl: DEMO_DOCUMENT_URL
});

export const DEMO_REVIEW_FIXTURES: readonly ContractProposedActionReviewRef[] = Object.freeze([
  Object.freeze({
    actionId: "action_review_replace",
    actionType: "REPLACE_TEXT",
    status: PROPOSED_ACTION_STATUSES.PROPOSED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 42, end: 64 } },
    originalTextHash: "sha256:google-docs-original",
    currentText: "<fixture current text>",
    proposedText: "<fixture proposed text>",
    surroundingText: "<fixture surrounding context>",
    rationale: "Clarify the selected sentence.",
    expiresAt: "2026-06-03T18:00:00.000Z"
  }),
  Object.freeze({
    actionId: "action_review_insert",
    actionType: "INSERT_TEXT",
    status: PROPOSED_ACTION_STATUSES.PROPOSED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 80, end: 80 } },
    originalTextHash: "sha256:google-docs-insert-anchor",
    proposedText: "<fixture inserted text>",
    surroundingText: "<fixture second context>",
    rationale: "Add a transition.",
    expiresAt: "2026-06-03T18:00:00.000Z"
  }),
  Object.freeze({
    actionId: "action_review_approved",
    actionType: "REPLACE_TEXT",
    status: PROPOSED_ACTION_STATUSES.APPROVED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 100, end: 124 } },
    originalTextHash: "sha256:google-docs-approved",
    currentText: "<fixture approved current>",
    proposedText: "<fixture approved replacement>",
    surroundingText: "<fixture approved context>",
    rationale: "Tighten the approved sentence.",
    expiresAt: "2026-06-03T18:00:00.000Z"
  }),
  Object.freeze({
    actionId: "action_conflict_stale",
    actionType: "REPLACE_TEXT",
    status: PROPOSED_ACTION_STATUSES.CONFLICTED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 140, end: 164 } },
    originalTextHash: "sha256:google-docs-stale",
    currentText: "<fixture stale current>",
    proposedText: "<fixture stale replacement>",
    surroundingText: "<fixture stale context>",
    rationale: "This edit needs regeneration after document changes.",
    conflictReasonCode: "STALE_RESOURCE_REVISION",
    expiresAt: "2026-06-03T18:00:00.000Z"
  }),
  Object.freeze({
    actionId: "action_review_conflict_ambiguous",
    actionType: "REPLACE_TEXT",
    status: PROPOSED_ACTION_STATUSES.CONFLICTED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 170, end: 188 } },
    originalTextHash: "sha256:google-docs-ambiguous",
    currentText: "<fixture ambiguous current>",
    proposedText: "<fixture ambiguous replacement>",
    surroundingText: "<fixture ambiguous context>",
    rationale: "The same text appears more than once.",
    conflictReasonCode: "AMBIGUOUS_TARGET",
    expiresAt: "2026-06-03T18:00:00.000Z"
  }),
  Object.freeze({
    actionId: "action_review_conflict_unverifiable",
    actionType: "REPLACE_TEXT",
    status: PROPOSED_ACTION_STATUSES.CONFLICTED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 200, end: 218 } },
    originalTextHash: "sha256:google-docs-unverifiable",
    currentText: "<fixture unverifiable current>",
    proposedText: "<fixture unverifiable replacement>",
    surroundingText: "<fixture unverifiable context>",
    rationale: "Connector verification metadata is missing.",
    conflictReasonCode: "UNVERIFIABLE_TARGET",
    expiresAt: "2026-06-03T18:00:00.000Z"
  })
]);

export const OVERLAPPING_REVIEW_FIXTURES: readonly ContractProposedActionReviewRef[] = Object.freeze([
  DEMO_REVIEW_FIXTURES[0],
  Object.freeze({
    actionId: "action_review_overlap",
    actionType: "REPLACE_TEXT",
    status: PROPOSED_ACTION_STATUSES.PROPOSED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 50, end: 70 } },
    originalTextHash: "sha256:google-docs-overlap",
    currentText: "<fixture overlapping current>",
    proposedText: "<fixture overlapping replacement>",
    surroundingText: "<fixture overlap context>",
    rationale: "This intentionally overlaps another proposed edit.",
    expiresAt: "2026-06-03T18:00:00.000Z"
  })
]);

export function createAssistantShellState(bridge: ContentScriptBridgeViewModel, panelOpen = true): AssistantShellState {
  const panelAvailable = bridge.supportState === "READY" && bridge.documentId !== null;

  return {
    panelAvailable,
    panelOpen: panelAvailable && panelOpen,
    bridge
  };
}

export function closeAssistantShell(state: AssistantShellState): AssistantShellState {
  return {
    ...state,
    panelOpen: false
  };
}

export function openAssistantShell(state: AssistantShellState): AssistantShellState {
  return {
    ...state,
    panelOpen: state.panelAvailable
  };
}

export function createContentScriptBridgeViewModel({
  supportState = "READY",
  documentId = ASSISTANT_DEMO_DOCUMENT_ID,
  title = ASSISTANT_DEMO_DOCUMENT_TITLE,
  url = DEMO_DOCUMENT_URL,
  resourceRevision = ASSISTANT_DEMO_RESOURCE_REVISION
}: Partial<ContentScriptBridgeViewModel> = {}): ContentScriptBridgeViewModel {
  return {
    supportState,
    documentId: supportState === "READY" ? documentId : null,
    title,
    url,
    resourceRevision,
    source: "GOOGLE_DOCS_CONTENT_SCRIPT"
  };
}

export function getAssistantDemoContextModeOptions() {
  return getContextModeOptions({
    activeResourceConnected: true,
    consentedModes: [CONTEXT_MODE_IDS.ACTIVE_RESOURCE]
  }).map((option) => ({
    ...option,
    enabled: option.mode === CONTEXT_MODE_IDS.SELECTION || option.mode === CONTEXT_MODE_IDS.ACTIVE_RESOURCE,
    disabledReason:
      option.mode === CONTEXT_MODE_IDS.SELECTION || option.mode === CONTEXT_MODE_IDS.ACTIVE_RESOURCE
        ? null
        : (option.disabledReason ?? "Future backend consent gate")
  }));
}

export function mapReviewFixtureToCard(
  fixture: ContractProposedActionReviewRef,
  idempotencyKey = createApplyIdempotencyKey(fixture.actionId)
): ReviewCardViewModel {
  const actionState = getProposedActionState({
    actionId: fixture.actionId,
    status: fixture.status
  });
  const targetRange = fixture.target.targetRange ? { ...fixture.target.targetRange } : null;
  const targetAnchor = fixture.target.targetAnchor ? { ...fixture.target.targetAnchor } : null;
  const hasRangeTarget = targetRange !== null;
  const hasAnchorTarget = targetAnchor !== null;
  const hasVerifiedTarget = hasRangeTarget !== hasAnchorTarget;
  const conflict = createConflictDisplayModel(
    fixture.conflictReasonCode,
    fixture.originalTextHash,
    hasVerifiedTarget,
    fixture.actionType
  );

  return {
    actionId: fixture.actionId,
    actionType: fixture.actionType,
    status: fixture.status,
    statusLabel: actionState.label,
    resourceId: fixture.resourceRef.resourceId,
    resourceTitle: fixture.resourceRef.displayName ?? fixture.resourceRef.resourceId,
    targetText: fixture.currentText ?? EMPTY_REVIEW_TEXT,
    replacementText: fixture.proposedText,
    surroundingContext: fixture.surroundingText ?? EMPTY_REVIEW_TEXT,
    rationale: fixture.rationale ?? "No rationale provided.",
    targetRange,
    targetAnchor,
    originalTextHash: fixture.originalTextHash ?? null,
    idempotencyKey,
    conflict,
    canApprove: actionState.canApprove && conflict === null,
    canReject: actionState.canReject,
    canApply: actionState.canApply && conflict === null,
    isSafeForApproveAll: actionState.canApprove && conflict === null && hasVerifiedTarget,
    lastCommand: null,
    pendingApplyCommand: null,
    applyResponse: null,
    applyDisplay: null,
    duplicateNotice: null
  };
}

export function createReviewCardsFromFixtures(fixtures: readonly ContractProposedActionReviewRef[]): ReviewCardViewModel[] {
  return markOverlappingCards(fixtures.map((fixture) => mapReviewFixtureToCard(fixture)));
}

export function approveReviewCard(card: ReviewCardViewModel, sessionId = ASSISTANT_DEMO_SESSION_ID): ReviewCardViewModel {
  if (card.status === PROPOSED_ACTION_STATUSES.APPROVED) {
    return withDuplicateNotice(card, "Approve already recorded.");
  }
  if (!card.canApprove) {
    return withDuplicateNotice(card, "Approve is not available for this action state.");
  }

  return {
    ...card,
    status: PROPOSED_ACTION_STATUSES.APPROVED,
    statusLabel: "Approved",
    canApprove: false,
    canReject: true,
    canApply: true,
    isSafeForApproveAll: false,
    lastCommand: createDecisionCommand("actions.approve", card.actionId, sessionId, "USER_APPROVED"),
    applyResponse: null,
    applyDisplay: null,
    duplicateNotice: null
  };
}

export function rejectReviewCard(card: ReviewCardViewModel, sessionId = ASSISTANT_DEMO_SESSION_ID): ReviewCardViewModel {
  if (card.status === PROPOSED_ACTION_STATUSES.REJECTED) {
    return withDuplicateNotice(card, "Reject already recorded.");
  }
  if (!card.canReject) {
    return withDuplicateNotice(card, "Reject is not available for this action state.");
  }

  return {
    ...card,
    status: PROPOSED_ACTION_STATUSES.REJECTED,
    statusLabel: "Rejected",
    canApprove: false,
    canReject: false,
    canApply: false,
    isSafeForApproveAll: false,
    lastCommand: createDecisionCommand("actions.reject", card.actionId, sessionId, "USER_REJECTED"),
    pendingApplyCommand: null,
    applyResponse: null,
    applyDisplay: null,
    duplicateNotice: null
  };
}

export function applyReviewCard(card: ReviewCardViewModel, sessionId = ASSISTANT_DEMO_SESSION_ID): ReviewCardViewModel {
  if (card.pendingApplyCommand !== null) {
    return withDuplicateNotice(card, "Apply request already queued with the same idempotency key.");
  }
  if (!card.canApply) {
    return withDuplicateNotice(card, "Apply is only available after approval and connector verification.");
  }

  const command = createApplyActionCommand(card.actionId, card.idempotencyKey, sessionId);

  return {
    ...card,
    canApply: false,
    pendingApplyCommand: command,
    lastCommand: command,
    applyResponse: null,
    applyDisplay: null,
    duplicateNotice: null
  };
}

export function createMockApplyResult(
  card: ReviewCardViewModel,
  status: NonNullable<MockApplyResult["result"]>["status"] = PROPOSED_ACTION_STATUSES.APPLIED,
  conflictReasonCode?: string
): MockApplyResult {
  return createMockApplyResponseWithResult(card, {
    status,
    ...(conflictReasonCode === undefined ? {} : { conflictReasonCode })
  });
}

export function createMockApplyResponse(
  card: ReviewCardViewModel,
  overrides: Partial<BackendApplyResponseView> = {}
): BackendApplyResponseView {
  if (card.pendingApplyCommand === null) {
    throw new Error("Cannot create a mocked apply result without a pending apply request.");
  }

  const command = card.pendingApplyCommand;

  return {
    commandId: command.commandId,
    commandType: "actions.apply",
    status: "completed",
    result: {
      actionId: card.actionId,
      sessionId: command.payload.sessionId,
      resourceId: card.resourceId,
      status: PROPOSED_ACTION_STATUSES.APPLIED,
      idempotencyKey: card.idempotencyKey,
      replayed: false
    },
    ...overrides
  };
}

export function createMockApplyResponseWithResult(
  card: ReviewCardViewModel,
  resultOverrides: Partial<NonNullable<BackendApplyResponseView["result"]>>
): BackendApplyResponseView {
  const response = createMockApplyResponse(card);

  return {
    ...response,
    result: {
      ...response.result!,
      ...resultOverrides
    }
  };
}

export function resolveApplyResult(card: ReviewCardViewModel, response: BackendApplyResponseView): ReviewCardViewModel {
  if (card.pendingApplyCommand === null) {
    return withDuplicateNotice(card, "Apply result ignored because no apply request is pending.");
  }

  if (
    response.commandType !== "actions.apply" ||
    response.commandId !== card.pendingApplyCommand.commandId
  ) {
    return withDuplicateNotice(card, "Apply result ignored because it does not match this action request.");
  }

  if (response.error !== undefined || response.status === "rejected") {
    const safeError = response.error ?? { category: "INTERNAL", code: "APPLY_REJECTED", retryable: false };
    const applyDisplay = createSafeApplyDisplay(safeError);

    return {
      ...card,
      statusLabel: applyDisplay.title,
      canApprove: false,
      canReject: false,
      canApply: false,
      isSafeForApproveAll: false,
      pendingApplyCommand: null,
      applyResponse: response,
      applyDisplay,
      duplicateNotice: null
    };
  }

  if (
    response.result === undefined ||
    response.result.actionId !== card.actionId ||
    response.result.idempotencyKey !== card.idempotencyKey
  ) {
    return withDuplicateNotice(card, "Apply result ignored because it does not match this action request.");
  }

  const reasonCode = response.result.conflictReasonCode ?? response.result.failureCode;

  if (response.result.status === PROPOSED_ACTION_STATUSES.CONFLICTED) {
    const conflict = createConflictDisplayModel(
      reasonCode ?? "APPLY_TARGET_CONFLICTED",
      card.originalTextHash ?? undefined,
      card.targetRange !== null || card.targetAnchor !== null,
      card.actionType
    );

    return {
      ...card,
      status: PROPOSED_ACTION_STATUSES.CONFLICTED,
      statusLabel: "Conflict",
      conflict,
      canApprove: false,
      canReject: false,
      canApply: false,
      isSafeForApproveAll: false,
      pendingApplyCommand: null,
      applyResponse: response,
      applyDisplay: createDurableApplyDisplay(response),
      duplicateNotice: null
    };
  }

  const status = response.result.status;
  const statusLabel = getApplyStatusLabel(status);

  return {
    ...card,
    status,
    statusLabel,
    canApprove: false,
    canReject: false,
    canApply: false,
    isSafeForApproveAll: false,
    pendingApplyCommand: null,
    applyResponse: response,
    applyDisplay: createDurableApplyDisplay(response),
    duplicateNotice: null
  };
}

export function reconcileReviewCardStatusEvent(card: ReviewCardViewModel, event: ActionStatusChangedEvent): ReviewCardViewModel {
  const actionId = event.actionId ?? event.payload?.actionId;
  const status = event.status ?? event.payload?.status;
  const reasonCode = event.reasonCode ?? event.payload?.reasonCode;

  if (event.type !== "action.status_changed" || actionId !== card.actionId || !isProposedActionStatus(status)) {
    return card;
  }

  const actionState = getProposedActionState({ actionId, status });
  const conflict =
    status === PROPOSED_ACTION_STATUSES.CONFLICTED
      ? createConflictDisplayModel(reasonCode ?? "APPLY_TARGET_CONFLICTED", card.originalTextHash ?? undefined, true, card.actionType)
      : card.conflict;

  return {
    ...card,
    status,
    statusLabel: actionState.label,
    conflict,
    canApprove: actionState.canApprove && conflict === null,
    canReject: actionState.canReject,
    canApply: actionState.canApply && conflict === null && card.pendingApplyCommand === null,
    isSafeForApproveAll: actionState.canApprove && conflict === null,
    pendingApplyCommand: null,
    applyDisplay: createStatusEventDisplay(status, reasonCode),
    duplicateNotice: null
  };
}

export function getApproveAllState(cards: readonly ReviewCardViewModel[]): ApproveAllState {
  const candidates = cards.filter((card) => card.status === PROPOSED_ACTION_STATUSES.PROPOSED);
  if (candidates.length === 0) {
    return { enabled: false, reason: "No proposed edits are waiting for approval." };
  }
  if (candidates.some((card) => card.conflict !== null)) {
    return { enabled: false, reason: "Resolve conflicted, stale, ambiguous, overlapping, or unverifiable targets first." };
  }
  if (candidates.some((card) => !card.isSafeForApproveAll)) {
    return { enabled: false, reason: "Approve all only supports connector-verified replace or insert proposals." };
  }
  if (hasOverlappingTargets(candidates)) {
    return { enabled: false, reason: "Approve all is disabled because proposal target ranges overlap." };
  }

  return { enabled: true, reason: null };
}

export function approveAllReviewCards(cards: readonly ReviewCardViewModel[], sessionId = ASSISTANT_DEMO_SESSION_ID): ReviewCardViewModel[] {
  if (!getApproveAllState(cards).enabled) {
    return cards.map((card) => ({ ...card }));
  }

  return cards.map((card) => (card.status === PROPOSED_ACTION_STATUSES.PROPOSED ? approveReviewCard(card, sessionId) : { ...card }));
}

export function createApplyActionCommand(actionId: string, idempotencyKey: string, sessionId = ASSISTANT_DEMO_SESSION_ID): BackendCommandView {
  return {
    contractVersion: ASSISTANT_DEMO_CONTRACT_VERSION,
    commandId: `cmd_review_apply_${actionId}`,
    commandType: "actions.apply",
    identityScope: ASSISTANT_DEMO_IDENTITY_SCOPE,
    idempotencyKey,
    payload: {
      sessionId,
      actionId
    }
  };
}

export function createApplyIdempotencyKey(actionId: string): string {
  return `${APPLY_IDEMPOTENCY_PREFIX}_${actionId}`;
}

export function createInitialMockChatState(): MockChatState {
  return {
    messages: [],
    progress: null,
    isSubmitting: false
  };
}

export function submitMockChatMessage(state: MockChatState, rawPrompt: string): MockChatState {
  const prompt = rawPrompt.trim();
  if (prompt.length === 0) {
    return state;
  }

  const nextIndex = state.messages.length + 1;

  return {
    messages: [
      ...state.messages,
      {
        id: `user-${nextIndex}`,
        role: "user",
        content: prompt,
        status: "SENT"
      },
      {
        id: `assistant-${nextIndex}`,
        role: "assistant",
        content: "I found reviewable edits in the selected passage.",
        status: "FINAL"
      }
    ],
    progress: "Mocked assistant response ready.",
    isSubmitting: false
  };
}

export function createSafeClientLogEvent(
  eventName: string,
  metadata: Record<string, unknown> = {}
): SafeClientLogEvent {
  const safeMetadata: SafeClientLogEvent["metadata"] = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!isSafeLogMetadataKey(key) || isForbiddenLogKey(key) || typeof value === "object") {
      safeMetadata[key] = SAFE_LOG_TEXT;
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      safeMetadata[key] = value;
    }
  }

  return {
    eventName,
    metadata: safeMetadata
  };
}

export function safeLogExcludesForbiddenContent(event: SafeClientLogEvent): boolean {
  const serialized = JSON.stringify(event).toLowerCase();

  return FORBIDDEN_EXTENSION_RETENTION.every((forbidden) => !serialized.includes(forbidden.toLowerCase()));
}

function createDecisionCommand(
  commandType: "actions.approve" | "actions.reject",
  actionId: string,
  sessionId: string,
  reasonCode: string
): BackendCommandView {
  return {
    contractVersion: ASSISTANT_DEMO_CONTRACT_VERSION,
    commandId: `cmd_review_${commandType.toLowerCase()}_${actionId}`,
    commandType,
    identityScope: ASSISTANT_DEMO_IDENTITY_SCOPE,
    payload: {
      sessionId,
      actionId,
      reasonCode
    }
  };
}

function withDuplicateNotice(card: ReviewCardViewModel, duplicateNotice: string): ReviewCardViewModel {
  return {
    ...card,
    duplicateNotice
  };
}

function createDurableApplyDisplay(response: BackendApplyResponseView): ApplyDisplayModel {
  const reasonCode = response.result?.conflictReasonCode ?? response.result?.failureCode;

  if (response.result?.replayed === true) {
    return {
      kind: "DUPLICATE_REPLAY",
      title: "Duplicate replay",
      message: "The backend returned the stored terminal result. No duplicate document mutation occurred.",
      code: reasonCode ?? null,
      retryable: false
    };
  }

  return createStatusEventDisplay(response.result?.status ?? PROPOSED_ACTION_STATUSES.FAILED, reasonCode);
}

function createStatusEventDisplay(status: ProposedActionStatus, reasonCode?: string): ApplyDisplayModel {
  if (status === PROPOSED_ACTION_STATUSES.FAILED && isDeniedReasonCode(reasonCode)) {
    return createSafeApplyDisplay({ category: "AUTHORIZATION", code: "AUTHORIZATION_DENIED", retryable: false });
  }
  if (status === PROPOSED_ACTION_STATUSES.FAILED && isReconnectReasonCode(reasonCode)) {
    return createSafeApplyDisplay({ category: "OAUTH", code: reasonCode ?? "OAUTH_RECONNECT_REQUIRED", retryable: false });
  }

  switch (status) {
    case PROPOSED_ACTION_STATUSES.APPLIED:
      return {
        kind: "DURABLE_RESULT",
        title: "Applied",
        message: "The backend reported the edit was applied once.",
        code: reasonCode ?? null,
        retryable: false
      };
    case PROPOSED_ACTION_STATUSES.CONFLICTED:
      return {
        kind: "DURABLE_RESULT",
        title: "Conflict",
        message: "The backend reported a conflict. No document mutation occurred.",
        code: reasonCode ?? "APPLY_TARGET_CONFLICTED",
        retryable: false
      };
    case PROPOSED_ACTION_STATUSES.EXPIRED:
      return {
        kind: "DURABLE_RESULT",
        title: "Expired",
        message: "The proposal expired. Generate a new proposal before applying.",
        code: reasonCode ?? "ACTION_EXPIRED",
        retryable: false
      };
    case PROPOSED_ACTION_STATUSES.FAILED:
      return {
        kind: "DURABLE_RESULT",
        title: "Failed",
        message: "The backend reported a safe apply failure.",
        code: reasonCode ?? "APPLY_FAILED",
        retryable: false
      };
    default:
      return {
        kind: "DURABLE_RESULT",
        title: getApplyStatusLabel(status),
        message: "The backend reported an action status update.",
        code: reasonCode ?? null,
        retryable: false
      };
  }
}

function createSafeApplyDisplay(error: NonNullable<BackendApplyResponseView["error"]>): ApplyDisplayModel {
  const mapped: UserFacingError = mapUserFacingError(error);
  const denied = isDeniedReasonCode(error.code) || error.category === "AUTHORIZATION";
  const reconnectRequired = isReconnectReasonCode(error.code) || error.category === "OAUTH";

  return {
    kind: "SAFE_ERROR",
    title: denied ? "Denied" : reconnectRequired ? "Reconnect required" : "Safe error",
    message: mapped.message,
    code: mapped.code,
    retryable: error.retryable
  };
}

function getApplyStatusLabel(status: ProposedActionStatus): string {
  return getProposedActionState({ status }).label;
}

function isProposedActionStatus(status: string | undefined): status is ProposedActionStatus {
  return status !== undefined && Object.values(PROPOSED_ACTION_STATUSES).includes(status as ProposedActionStatus);
}

function isDeniedReasonCode(reasonCode: string | undefined): boolean {
  return reasonCode === "AUTHORIZATION_DENIED";
}

function isReconnectReasonCode(reasonCode: string | undefined): boolean {
  return reasonCode === "OAUTH_RECONNECT_REQUIRED" || reasonCode === "RECONNECT_REQUIRED" || reasonCode === "TOKEN_EXPIRED";
}

function createConflictDisplayModel(
  reasonCode: string | undefined,
  originalTextHash: string | undefined,
  hasVerifiedTarget: boolean,
  actionType: ReviewActionType
): ConflictDisplayModel | null {
  const replaceHasHash = actionType === "REPLACE_TEXT" && originalTextHash !== undefined;
  const insertDoesNotNeedHash = actionType === "INSERT_TEXT";

  if (reasonCode === undefined && hasVerifiedTarget && (replaceHasHash || insertDoesNotNeedHash)) {
    return null;
  }

  const normalizedReason = reasonCode ?? "UNVERIFIABLE_TARGET";
  const kind = getConflictKind(normalizedReason);

  return {
    kind,
    reasonCode: normalizedReason,
    title: getConflictTitle(kind),
    message: getConflictMessage(kind),
    noMutation: true
  };
}

function getConflictKind(reasonCode: string): ReviewConflictKind {
  switch (reasonCode) {
    case "STALE_RESOURCE_REVISION":
    case "APPLY_TARGET_CONFLICTED":
      return "STALE";
    case "AMBIGUOUS_TARGET":
      return "AMBIGUOUS";
    case "OVERLAPPING_TARGETS":
      return "OVERLAPPING";
    default:
      return "UNVERIFIABLE";
  }
}

function getConflictTitle(kind: ReviewConflictKind): string {
  switch (kind) {
    case "STALE":
      return "Stale target";
    case "AMBIGUOUS":
      return "Ambiguous target";
    case "OVERLAPPING":
      return "Overlapping proposal";
    case "UNVERIFIABLE":
      return "Unverifiable target";
  }
}

function getConflictMessage(kind: ReviewConflictKind): string {
  switch (kind) {
    case "STALE":
      return "The document changed before apply. No document mutation occurred.";
    case "AMBIGUOUS":
      return "The target text matched more than one location. No document mutation occurred.";
    case "OVERLAPPING":
      return "This proposal overlaps another target range. No document mutation occurred.";
    case "UNVERIFIABLE":
      return "Connector verification metadata is missing. No document mutation occurred.";
  }
}

function markOverlappingCards(cards: ReviewCardViewModel[]): ReviewCardViewModel[] {
  if (!hasOverlappingTargets(cards)) {
    return cards;
  }

  return cards.map((card) => {
    if (card.targetRange === null) {
      return card;
    }

    const targetRange = card.targetRange;
    const overlapsAnotherCard = cards.some(
      (other) => other.actionId !== card.actionId && other.targetRange !== null && rangesOverlap(targetRange, other.targetRange)
    );

    if (!overlapsAnotherCard) {
      return card;
    }

    const conflict = createConflictDisplayModel("OVERLAPPING_TARGETS", card.originalTextHash ?? undefined, true, card.actionType);

    return {
      ...card,
      conflict,
      canApprove: false,
      canApply: false,
      isSafeForApproveAll: false
    };
  });
}

function hasOverlappingTargets(cards: readonly ReviewCardViewModel[]): boolean {
  for (let index = 0; index < cards.length; index += 1) {
    const current = cards[index].targetRange;
    if (current === null) {
      continue;
    }

    for (let compareIndex = index + 1; compareIndex < cards.length; compareIndex += 1) {
      const compare = cards[compareIndex].targetRange;
      if (compare !== null && rangesOverlap(current, compare)) {
        return true;
      }
    }
  }

  return false;
}

function rangesOverlap(first: { start: number; end: number }, second: { start: number; end: number }): boolean {
  return first.start < second.end && second.start < first.end;
}

function isForbiddenLogKey(key: string): boolean {
  const normalized = key.toLowerCase();

  return [
    "prompt",
    "selectedtext",
    "documenttext",
    "modelresponse",
    "screenshot",
    "ocrtext",
    "accessibilitytree",
    "actionpayload",
    "providerkey",
    "oauthtoken",
    "bearertoken",
    "token",
    "secret"
  ].some((forbidden) => normalized.includes(forbidden));
}

function isSafeLogMetadataKey(key: string): boolean {
  return new Set([
    "actionId",
    "commandType",
    "durationMs",
    "eventId",
    "provider",
    "resourceId",
    "sessionId",
    "status"
  ]).has(key);
}
