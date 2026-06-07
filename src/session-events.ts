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

export type StreamWarning = {
  eventId: string | null;
  kind: "SEQUENCE_GAP" | "MALFORMED_EVENT";
  message: string;
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
  lastEventId: string | null;
  lastSequence: number | null;
  streamWarnings: StreamWarning[];
};

type SessionEvent = {
  eventId?: string;
  sequence?: number;
  type?: string;
  payload?: SessionEventPayload;
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

type SessionEventPayload = {
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
const SEQUENCE_GAP_WARNING = "The event stream skipped one or more updates. Refresh durable state before applying changes.";

export function createInitialSessionState(): SessionState {
  return {
    connection: "DISCONNECTED",
    messages: [],
    progress: [],
    proposedActions: {},
    errors: [],
    processedEventIds: [],
    lastEventId: null,
    lastSequence: null,
    streamWarnings: []
  };
}

export function reduceSessionEvent(state: SessionState | undefined, event: SessionEvent | null | undefined): SessionState {
  const current = state ?? createInitialSessionState();
  const normalizedEvent = normalizeSessionEvent(event);
  if (!normalizedEvent) {
    return recordMalformedEvent(current);
  }

  const processedEventIdSet = new Set(current.processedEventIds);
  if (normalizedEvent.eventId && processedEventIdSet.has(normalizedEvent.eventId)) {
    return current;
  }

  const next: SessionState = {
    ...current,
    messages: [...current.messages],
    progress: [...current.progress],
    proposedActions: { ...current.proposedActions },
    errors: [...current.errors],
    processedEventIds: appendProcessedEventId(current.processedEventIds, normalizedEvent.eventId),
    lastEventId: normalizedEvent.eventId ?? current.lastEventId,
    lastSequence: typeof normalizedEvent.sequence === "number" ? normalizedEvent.sequence : current.lastSequence,
    streamWarnings: [...current.streamWarnings]
  };
  recordSequenceGap(next, current.lastSequence, normalizedEvent);

  switch (normalizedEvent.type) {
    case SESSION_EVENT_TYPES.CONNECTED:
      next.connection = "CONNECTED";
      break;
    case SESSION_EVENT_TYPES.DISCONNECTED:
      next.connection = "DISCONNECTED";
      break;
    case SESSION_EVENT_TYPES.PROGRESS:
      next.progress.push({
        eventId: normalizedEvent.eventId ?? null,
        message: normalizedEvent.message ?? "Working",
        createdAt: normalizedEvent.createdAt ?? null
      });
      break;
    case SESSION_EVENT_TYPES.ASSISTANT_DELTA:
      appendAssistantDelta(next, normalizedEvent);
      break;
    case SESSION_EVENT_TYPES.ASSISTANT_FINAL:
      finalizeAssistantMessage(next, normalizedEvent);
      break;
    case SESSION_EVENT_TYPES.ACTION_PROPOSED:
      if (normalizedEvent.action?.actionId) {
        next.proposedActions[normalizedEvent.action.actionId] = toSafeProposedActionView(normalizedEvent.action);
      }
      break;
    case SESSION_EVENT_TYPES.ACTION_STATUS:
      if (normalizedEvent.actionId && ACTION_STATUS_VALUES.has(normalizedEvent.status ?? "")) {
        next.proposedActions[normalizedEvent.actionId] = {
          ...(next.proposedActions[normalizedEvent.actionId] ?? { actionId: normalizedEvent.actionId }),
          status: normalizedEvent.status as ProposedActionStatus,
          updatedAt: normalizedEvent.createdAt ?? null
        };
      } else if (normalizedEvent.actionId) {
        next.errors.push(mapUserFacingError(INVALID_SESSION_EVENT_ERROR));
      }
      break;
    case SESSION_EVENT_TYPES.ERROR:
      next.errors.push(mapUserFacingError(normalizedEvent.error));
      break;
    default:
      next.errors.push(mapUserFacingError({ category: "INTERNAL", code: "UNKNOWN_SESSION_EVENT" }));
  }

  return next;
}

function normalizeSessionEvent(event: SessionEvent | null | undefined): SessionEvent | null {
  if (!event || typeof event.type !== "string") {
    return null;
  }

  const payload = isObject(event.payload) ? event.payload : {};
  return {
    ...event,
    message: event.message ?? payload.message,
    messageId: event.messageId ?? payload.messageId,
    delta: event.delta ?? payload.delta,
    content: event.content ?? payload.content,
    action: event.action ?? payload.action,
    actionId: event.actionId ?? payload.actionId,
    status: event.status ?? payload.status,
    error: event.error ?? payload.error
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function recordMalformedEvent(state: SessionState): SessionState {
  return {
    ...state,
    errors: [...state.errors, mapUserFacingError(INVALID_SESSION_EVENT_ERROR)],
    streamWarnings: [
      ...state.streamWarnings,
      {
        eventId: null,
        kind: "MALFORMED_EVENT",
        message: "The stream sent an event the client could not use."
      }
    ]
  };
}

function recordSequenceGap(state: SessionState, previousSequence: number | null, event: SessionEvent): void {
  if (typeof previousSequence !== "number" || typeof event.sequence !== "number") {
    return;
  }

  if (event.sequence > previousSequence + 1) {
    state.streamWarnings.push({
      eventId: event.eventId ?? null,
      kind: "SEQUENCE_GAP",
      message: SEQUENCE_GAP_WARNING
    });
  }
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
