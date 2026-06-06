import { CONTEXT_MODE_IDS, getContextModeOptions } from "./context-modes";
import { FORBIDDEN_EXTENSION_RETENTION } from "./extension-surface";
import { PROPOSED_ACTION_STATUSES, getProposedActionState, type ProposedActionStatus } from "./proposed-actions";

export const M2_SESSION_ID = "session_m2_demo";
export const M2_DOCUMENT_ID = "gdoc_m1_demo";
export const M2_DOCUMENT_TITLE = "M1 fixture document";
export const M2_RESOURCE_REVISION = "rev_m1";
export const M2_DEFAULT_IDEMPOTENCY_PREFIX = "idem_m2_apply";
export const M2_CONTRACT_VERSION = Object.freeze({
  major: 0,
  minor: 1,
  patch: 0
});
export const M2_IDENTITY_SCOPE = Object.freeze({
  tenantId: "tenant_m1_demo",
  userId: "user_m1_demo",
  authSubject: "auth_subject_m1_demo",
  requestId: "req_m1_demo",
  correlationId: "corr_m1_demo"
});

export type M2ActionType = "REPLACE_TEXT" | "INSERT_TEXT";
export type M2ConflictKind = "STALE" | "AMBIGUOUS" | "OVERLAPPING" | "UNVERIFIABLE";

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
  actionType: M2ActionType;
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
  actionType: M2ActionType;
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
  duplicateNotice: string | null;
};

export type ConflictDisplayModel = {
  kind: M2ConflictKind;
  reasonCode: string;
  title: string;
  message: string;
  noMutation: true;
};

export type BackendCommandView = {
  contractVersion: typeof M2_CONTRACT_VERSION;
  commandId: string;
  commandType: "actions.approve" | "actions.reject" | "actions.apply";
  identityScope: typeof M2_IDENTITY_SCOPE;
  idempotencyKey?: string;
  payload: {
    sessionId: string;
    actionId: string;
    reasonCode?: string;
  };
};

export type ApproveAllState = {
  enabled: boolean;
  reason: string | null;
};

export type MockApplyResult = {
  commandId: string;
  commandType: "actions.apply";
  idempotencyKey: string;
  actionId: string;
  status: Extract<ProposedActionStatus, "APPLIED" | "FAILED" | "CONFLICTED">;
  conflictReasonCode?: string;
};

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

export const DEMO_DOCUMENT_URL = `https://docs.google.com/document/d/${M2_DOCUMENT_ID}/edit`;
const GOOGLE_DOCS_RESOURCE_REF = Object.freeze({
  connector: "google_docs",
  resourceId: M2_DOCUMENT_ID,
  resourceType: "document",
  displayName: M2_DOCUMENT_TITLE,
  externalUrl: DEMO_DOCUMENT_URL
});

export const DEMO_REVIEW_FIXTURES: readonly ContractProposedActionReviewRef[] = Object.freeze([
  Object.freeze({
    actionId: "action_m1_review",
    actionType: "REPLACE_TEXT",
    status: PROPOSED_ACTION_STATUSES.PROPOSED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 42, end: 64 } },
    originalTextHash: "sha256:m1-original",
    currentText: "<fixture current text>",
    proposedText: "<fixture proposed text>",
    surroundingText: "<fixture surrounding context>",
    rationale: "Clarify the selected sentence.",
    expiresAt: "2026-06-03T18:00:00.000Z"
  }),
  Object.freeze({
    actionId: "action_m1_insert",
    actionType: "INSERT_TEXT",
    status: PROPOSED_ACTION_STATUSES.PROPOSED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 80, end: 80 } },
    originalTextHash: "sha256:m1-insert-anchor",
    proposedText: "<fixture inserted text>",
    surroundingText: "<fixture second context>",
    rationale: "Add a transition.",
    expiresAt: "2026-06-03T18:00:00.000Z"
  }),
  Object.freeze({
    actionId: "action_m1_approved",
    actionType: "REPLACE_TEXT",
    status: PROPOSED_ACTION_STATUSES.APPROVED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 100, end: 124 } },
    originalTextHash: "sha256:m1-approved",
    currentText: "<fixture approved current>",
    proposedText: "<fixture approved replacement>",
    surroundingText: "<fixture approved context>",
    rationale: "Tighten the approved sentence.",
    expiresAt: "2026-06-03T18:00:00.000Z"
  }),
  Object.freeze({
    actionId: "action_m1_conflict_stale",
    actionType: "REPLACE_TEXT",
    status: PROPOSED_ACTION_STATUSES.CONFLICTED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 140, end: 164 } },
    originalTextHash: "sha256:m1-stale",
    currentText: "<fixture stale current>",
    proposedText: "<fixture stale replacement>",
    surroundingText: "<fixture stale context>",
    rationale: "This edit needs regeneration after document changes.",
    conflictReasonCode: "STALE_RESOURCE_REVISION",
    expiresAt: "2026-06-03T18:00:00.000Z"
  }),
  Object.freeze({
    actionId: "action_m2_conflict_ambiguous",
    actionType: "REPLACE_TEXT",
    status: PROPOSED_ACTION_STATUSES.CONFLICTED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 170, end: 188 } },
    originalTextHash: "sha256:m1-ambiguous",
    currentText: "<fixture ambiguous current>",
    proposedText: "<fixture ambiguous replacement>",
    surroundingText: "<fixture ambiguous context>",
    rationale: "The same text appears more than once.",
    conflictReasonCode: "AMBIGUOUS_TARGET",
    expiresAt: "2026-06-03T18:00:00.000Z"
  }),
  Object.freeze({
    actionId: "action_m2_conflict_unverifiable",
    actionType: "REPLACE_TEXT",
    status: PROPOSED_ACTION_STATUSES.CONFLICTED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 200, end: 218 } },
    originalTextHash: "sha256:m1-unverifiable",
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
    actionId: "action_m1_overlap",
    actionType: "REPLACE_TEXT",
    status: PROPOSED_ACTION_STATUSES.PROPOSED,
    resourceRef: GOOGLE_DOCS_RESOURCE_REF,
    target: { targetRange: { start: 50, end: 70 } },
    originalTextHash: "sha256:m1-overlap",
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
  documentId = M2_DOCUMENT_ID,
  title = M2_DOCUMENT_TITLE,
  url = DEMO_DOCUMENT_URL,
  resourceRevision = M2_RESOURCE_REVISION
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

export function getM2ContextModeOptions() {
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

export function mapM1ReviewFixtureToCard(
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
    duplicateNotice: null
  };
}

export function createReviewCardsFromFixtures(fixtures: readonly ContractProposedActionReviewRef[]): ReviewCardViewModel[] {
  return markOverlappingCards(fixtures.map((fixture) => mapM1ReviewFixtureToCard(fixture)));
}

export function approveReviewCard(card: ReviewCardViewModel, sessionId = M2_SESSION_ID): ReviewCardViewModel {
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
    duplicateNotice: null
  };
}

export function rejectReviewCard(card: ReviewCardViewModel, sessionId = M2_SESSION_ID): ReviewCardViewModel {
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
    duplicateNotice: null
  };
}

export function applyReviewCard(card: ReviewCardViewModel, sessionId = M2_SESSION_ID): ReviewCardViewModel {
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
    duplicateNotice: null
  };
}

export function createMockApplyResult(
  card: ReviewCardViewModel,
  status: MockApplyResult["status"] = PROPOSED_ACTION_STATUSES.APPLIED,
  conflictReasonCode?: string
): MockApplyResult {
  if (card.pendingApplyCommand === null) {
    throw new Error("Cannot create a mocked apply result without a pending apply request.");
  }

  const command = card.pendingApplyCommand;

  return {
    commandId: command.commandId,
    commandType: "actions.apply",
    idempotencyKey: card.idempotencyKey,
    actionId: card.actionId,
    status,
    ...(conflictReasonCode === undefined ? {} : { conflictReasonCode })
  };
}

export function resolveApplyResult(card: ReviewCardViewModel, result: MockApplyResult): ReviewCardViewModel {
  if (card.pendingApplyCommand === null) {
    return withDuplicateNotice(card, "Apply result ignored because no apply request is pending.");
  }

  if (
    result.actionId !== card.actionId ||
    result.idempotencyKey !== card.idempotencyKey ||
    result.commandId !== card.pendingApplyCommand.commandId
  ) {
    return withDuplicateNotice(card, "Apply result ignored because it does not match this action request.");
  }

  if (result.status === PROPOSED_ACTION_STATUSES.CONFLICTED) {
    const conflict = createConflictDisplayModel(
      result.conflictReasonCode ?? "APPLY_TARGET_CONFLICTED",
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
      duplicateNotice: null
    };
  }

  const statusLabel = result.status === PROPOSED_ACTION_STATUSES.APPLIED ? "Applied" : "Failed";

  return {
    ...card,
    status: result.status,
    statusLabel,
    canApprove: false,
    canReject: false,
    canApply: false,
    isSafeForApproveAll: false,
    pendingApplyCommand: null,
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

export function approveAllReviewCards(cards: readonly ReviewCardViewModel[], sessionId = M2_SESSION_ID): ReviewCardViewModel[] {
  if (!getApproveAllState(cards).enabled) {
    return cards.map((card) => ({ ...card }));
  }

  return cards.map((card) => (card.status === PROPOSED_ACTION_STATUSES.PROPOSED ? approveReviewCard(card, sessionId) : { ...card }));
}

export function createApplyActionCommand(actionId: string, idempotencyKey: string, sessionId = M2_SESSION_ID): BackendCommandView {
  return {
    contractVersion: M2_CONTRACT_VERSION,
    commandId: `cmd_m2_apply_${actionId}`,
    commandType: "actions.apply",
    identityScope: M2_IDENTITY_SCOPE,
    idempotencyKey,
    payload: {
      sessionId,
      actionId
    }
  };
}

export function createApplyIdempotencyKey(actionId: string): string {
  return `${M2_DEFAULT_IDEMPOTENCY_PREFIX}_${actionId}`;
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
    contractVersion: M2_CONTRACT_VERSION,
    commandId: `cmd_m2_${commandType.toLowerCase()}_${actionId}`,
    commandType,
    identityScope: M2_IDENTITY_SCOPE,
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

function createConflictDisplayModel(
  reasonCode: string | undefined,
  originalTextHash: string | undefined,
  hasVerifiedTarget: boolean,
  actionType: M2ActionType
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

function getConflictKind(reasonCode: string): M2ConflictKind {
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

function getConflictTitle(kind: M2ConflictKind): string {
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

function getConflictMessage(kind: M2ConflictKind): string {
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
