import { mapUserFacingError, type UserFacingError } from "./error-mapping";
import { PROPOSED_ACTION_STATUSES, type ProposedActionStatus } from "./proposed-actions";

export const SESSION_EVENT_TYPES = Object.freeze({
  PROGRESS: "progress",
  ASSISTANT_DELTA: "assistant.delta",
  ASSISTANT_FINAL: "assistant.final",
  ERROR: "error",
  ACTION_PROPOSED: "action.proposed",
  ACTION_STATUS: "action.status",
  CONNECTED: "transport.connected",
  DISCONNECTED: "transport.disconnected"
});

export type SessionEventType = (typeof SESSION_EVENT_TYPES)[keyof typeof SESSION_EVENT_TYPES];

export type SessionMessage = {
  messageId: string;
  role: "assistant";
  content: string;
  status: "STREAMING" | "FINAL";
};

export type ProgressEventView = {
  eventId: string | null;
  message: string;
  createdAt: string | null;
};

export type ProposedActionView = {
  actionId: string;
  actionType?: string | null;
  resourceId?: string | null;
  resourceTitle?: string | null;
  preview?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  updatedAt?: string | null;
  status: ProposedActionStatus;
};

export type SessionState = {
  connection: "CONNECTED" | "DISCONNECTED";
  messages: SessionMessage[];
  progress: ProgressEventView[];
  proposedActions: Record<string, ProposedActionView>;
  errors: UserFacingError[];
  processedEventIds: string[];
};

type SessionEvent = {
  eventId?: string;
  type?: string;
  message?: string;
  messageId?: string;
  delta?: string;
  content?: string;
  action?: UnsafeProposedAction;
  actionId?: string;
  status?: string;
  error?: {
    category?: string;
    code?: string;
  };
  createdAt?: string;
};

type UnsafeProposedAction = {
  actionId?: string;
  actionType?: string;
  resourceId?: string;
  resourceTitle?: string;
  preview?: string;
  createdAt?: string;
  expiresAt?: string;
  status?: string;
};

export const MAX_PROCESSED_EVENT_IDS = 500;

const ACTION_STATUS_VALUES = new Set<string>(Object.values(PROPOSED_ACTION_STATUSES));
const INVALID_SESSION_EVENT_ERROR = Object.freeze({
  category: "VALIDATION",
  code: "INVALID_SESSION_EVENT"
});

export function createInitialSessionState(): SessionState {
  return {
    connection: "DISCONNECTED",
    messages: [],
    progress: [],
    proposedActions: {},
    errors: [],
    processedEventIds: []
  };
}

export function reduceSessionEvent(state: SessionState | undefined, event: SessionEvent | null | undefined): SessionState {
  const current = state ?? createInitialSessionState();
  if (!event || typeof event.type !== "string") {
    return current;
  }

  const processedEventIdSet = new Set(current.processedEventIds);
  if (event.eventId && processedEventIdSet.has(event.eventId)) {
    return current;
  }

  const next: SessionState = {
    ...current,
    messages: [...current.messages],
    progress: [...current.progress],
    proposedActions: { ...current.proposedActions },
    errors: [...current.errors],
    processedEventIds: appendProcessedEventId(current.processedEventIds, event.eventId)
  };

  switch (event.type) {
    case SESSION_EVENT_TYPES.CONNECTED:
      next.connection = "CONNECTED";
      break;
    case SESSION_EVENT_TYPES.DISCONNECTED:
      next.connection = "DISCONNECTED";
      break;
    case SESSION_EVENT_TYPES.PROGRESS:
      next.progress.push({
        eventId: event.eventId ?? null,
        message: event.message ?? "Working",
        createdAt: event.createdAt ?? null
      });
      break;
    case SESSION_EVENT_TYPES.ASSISTANT_DELTA:
      appendAssistantDelta(next, event);
      break;
    case SESSION_EVENT_TYPES.ASSISTANT_FINAL:
      finalizeAssistantMessage(next, event);
      break;
    case SESSION_EVENT_TYPES.ACTION_PROPOSED:
      if (event.action?.actionId) {
        next.proposedActions[event.action.actionId] = toSafeProposedActionView(event.action);
      }
      break;
    case SESSION_EVENT_TYPES.ACTION_STATUS:
      if (event.actionId && ACTION_STATUS_VALUES.has(event.status ?? "")) {
        next.proposedActions[event.actionId] = {
          ...(next.proposedActions[event.actionId] ?? { actionId: event.actionId }),
          status: event.status as ProposedActionStatus,
          updatedAt: event.createdAt ?? null
        };
      } else if (event.actionId) {
        next.errors.push(mapUserFacingError(INVALID_SESSION_EVENT_ERROR));
      }
      break;
    case SESSION_EVENT_TYPES.ERROR:
      next.errors.push(mapUserFacingError(event.error));
      break;
    default:
      next.errors.push(mapUserFacingError({ category: "INTERNAL", code: "UNKNOWN_SESSION_EVENT" }));
  }

  return next;
}

function appendProcessedEventId(processedEventIds: readonly string[], eventId: string | undefined): string[] {
  if (!eventId) {
    return [...processedEventIds];
  }

  return [...processedEventIds, eventId].slice(-MAX_PROCESSED_EVENT_IDS);
}

function toSafeProposedActionView(action: UnsafeProposedAction): ProposedActionView {
  return {
    actionId: action.actionId as string,
    actionType: action.actionType ?? null,
    resourceId: action.resourceId ?? null,
    resourceTitle: action.resourceTitle ?? null,
    preview: typeof action.preview === "string" ? action.preview : null,
    createdAt: action.createdAt ?? null,
    expiresAt: action.expiresAt ?? null,
    status: PROPOSED_ACTION_STATUSES.PROPOSED
  };
}

function appendAssistantDelta(state: SessionState, event: SessionEvent): void {
  const messageId = event.messageId ?? "assistant-active";
  const existingIndex = state.messages.findIndex((message) => message.messageId === messageId);
  const delta = typeof event.delta === "string" ? event.delta : "";

  if (existingIndex === -1) {
    state.messages.push({
      messageId,
      role: "assistant",
      content: delta,
      status: "STREAMING"
    });
    return;
  }

  state.messages[existingIndex] = {
    ...state.messages[existingIndex],
    content: `${state.messages[existingIndex].content}${delta}`,
    status: "STREAMING"
  };
}

function finalizeAssistantMessage(state: SessionState, event: SessionEvent): void {
  const messageId = event.messageId ?? "assistant-active";
  const existingIndex = state.messages.findIndex((message) => message.messageId === messageId);
  const content = typeof event.content === "string" ? event.content : null;

  if (existingIndex === -1) {
    state.messages.push({
      messageId,
      role: "assistant",
      content: content ?? "",
      status: "FINAL"
    });
    return;
  }

  state.messages[existingIndex] = {
    ...state.messages[existingIndex],
    content: content ?? state.messages[existingIndex].content,
    status: "FINAL"
  };
}
