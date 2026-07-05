import { createInitialSessionState, reduceSessionEvent, type SessionState } from "./session-events";

export const SESSION_STREAM_LOG_EVENT = "session-stream";
export const LAST_EVENT_ID_HEADER = "Last-Event-ID";

export type SseFrame = {
  id?: string;
  event?: string;
  data?: string;
};

export type SessionEventEnvelope = {
  eventId: string;
  sequence: number;
  requestId: string;
  correlationId: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type SessionStreamClientState = {
  session: SessionState;
  lastEventId: string | null;
  reconnectRequired: boolean;
  malformedFrameCount: number;
  safeLogEvent: SessionStreamLogEvent;
};

export type SessionStreamRouteResult = {
  streamUrl: string;
  requestHeaders: Record<string, string>;
  ok: boolean;
  status: number;
  contentType: string | null;
  state: SessionStreamClientState;
  refreshGuidance: string | null;
};

export type SessionStreamRouteFetchInit = {
  method: "GET";
  headers: Record<string, string>;
  signal?: AbortSignal;
};

export type SessionStreamRouteFetch = (
  streamUrl: string,
  init: SessionStreamRouteFetchInit
) => Promise<{
  ok: boolean;
  status: number;
  headers: {
    get(name: string): string | null;
  };
  body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}>;

export type FetchSessionStreamRouteOptions = {
  streamUrl: string;
  lastEventId?: string | null;
  initialState?: SessionStreamClientState;
  fetcher?: SessionStreamRouteFetch;
  onResponse?: (response: { ok: boolean; status: number; contentType: string | null }) => void;
  onState?: (state: SessionStreamClientState) => void;
  signal?: AbortSignal;
};

export type SessionStreamLogEvent = {
  event: typeof SESSION_STREAM_LOG_EVENT;
  sessionId: string | null;
  requestId: string | null;
  correlationId: string | null;
  lastEventId: string | null;
  eventType: string | null;
  warningKinds: readonly string[];
  errorCodes: readonly string[];
};

export const SESSION_STREAM_FORBIDDEN_LOG_PATTERNS = [
  /authorization[_ -]?header/i,
  /authorization:/i,
  /bearer/i,
  /oauth/i,
  /provider[_-]?key/i,
  /api[_-]?key/i,
  /prompt/i,
  /selected text/i,
  /document text/i,
  /model response/i,
  /screenshot/i,
  /ocr/i,
  /accessibility/i,
  /action payload/i,
  /raw content/i,
  /sk-[a-z0-9]/i
] as const;

const DEMO_CREATED_AT = "2026-06-07T12:00:00.000Z";
const DEMO_REQUEST_ID = "request_demo_stream";
const DEMO_CORRELATION_ID = "correlation_demo_stream";
const DEMO_SESSION_ID = "session_stream_demo";
const DEMO_TENANT_ID = "tenant_demo";
const DEMO_USER_ID = "user_demo";
const DEMO_ACTION_ID = "action_stream_review";
const DEMO_RESOURCE_REF = Object.freeze({
  connector: "google_docs",
  resourceId: "gdoc_stream_demo",
  resourceType: "document",
  displayName: "Stream demo document",
  externalUrl: "https://docs.google.com/document/d/gdoc_stream_demo/edit"
});
const REFRESH_DURABLE_STATE_GUIDANCE =
  "Refresh durable session state over HTTP before applying changes.";

export function createInitialSessionStreamClientState(): SessionStreamClientState {
  return {
    session: createInitialSessionState(),
    lastEventId: null,
    reconnectRequired: false,
    malformedFrameCount: 0,
    safeLogEvent: createSessionStreamLogEvent(createInitialSessionState(), null)
  };
}

export function reduceSseFrame(
  state: SessionStreamClientState | undefined,
  frame: string | SseFrame
): SessionStreamClientState {
  const current = state ?? createInitialSessionStreamClientState();
  const parsedFrame = typeof frame === "string" ? parseSseFrame(frame) : frame;
  if (!parsedFrame.data) {
    return current;
  }

  const event = parseSessionEventData(parsedFrame.data);
  const session = reduceSessionEvent(current.session, event);
  const malformed = event === null;
  return {
    session,
    lastEventId: malformed ? current.lastEventId : (parsedFrame.id ?? event?.eventId ?? current.lastEventId),
    reconnectRequired: malformed || session.streamWarnings.some((warning) => warning.kind === "SEQUENCE_GAP"),
    malformedFrameCount: current.malformedFrameCount + (malformed ? 1 : 0),
    safeLogEvent: createSessionStreamLogEvent(session, event)
  };
}

export async function fetchSessionStreamRoute({
  streamUrl,
  lastEventId = null,
  initialState = createInitialSessionStreamClientState(),
  fetcher = defaultSessionStreamRouteFetch,
  onResponse,
  onState,
  signal
}: FetchSessionStreamRouteOptions): Promise<SessionStreamRouteResult> {
  const requestHeaders = createLastEventIdHeaders(lastEventId);
  const response = await fetcher(streamUrl, {
    method: "GET",
    headers: requestHeaders,
    signal
  });
  const contentType = response.headers.get("content-type");
  onResponse?.({ ok: response.ok, status: response.status, contentType });
  const state = response.body
    ? await reduceReadableSseStream(response.body, initialState, onState)
    : reduceSseFrames(await response.text(), initialState, onState);

  return {
    streamUrl,
    requestHeaders,
    ok: response.ok,
    status: response.status,
    contentType,
    state,
    refreshGuidance: state.reconnectRequired ? REFRESH_DURABLE_STATE_GUIDANCE : null
  };
}

export function parseSseFrame(frame: string): SseFrame {
  const parsed: SseFrame = {};
  const dataLines: string[] = [];

  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("id:")) {
      parsed.id = line.slice(3).trim();
    } else if (line.startsWith("event:")) {
      parsed.event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length > 0) {
    parsed.data = dataLines.join("\n");
  }

  return parsed;
}

export function createLastEventIdHeaders(lastEventId: string | null): Record<string, string> {
  return lastEventId ? { [LAST_EVENT_ID_HEADER]: lastEventId } : {};
}

export function getSessionStreamRefreshGuidance(state: SessionStreamClientState): string | null {
  return state.reconnectRequired ? REFRESH_DURABLE_STATE_GUIDANCE : null;
}

export function createSessionStreamLogEvent(
  state: SessionState,
  event: SessionEventEnvelope | null
): SessionStreamLogEvent {
  return {
    event: SESSION_STREAM_LOG_EVENT,
    sessionId: event?.sessionId ?? null,
    requestId: event?.requestId ?? null,
    correlationId: event?.correlationId ?? null,
    lastEventId: state.lastEventId,
    eventType: event?.type ?? null,
    warningKinds: state.streamWarnings.map((warning) => warning.kind),
    errorCodes: state.errors.map((error) => error.code)
  };
}

export function safeSessionStreamLogExcludesForbiddenContent(event: SessionStreamLogEvent): boolean {
  const serialized = JSON.stringify(event);
  return SESSION_STREAM_FORBIDDEN_LOG_PATTERNS.every((pattern) => !pattern.test(serialized));
}

export function createSessionStreamDemoFrames(): string[] {
  return [
    toSseFrame(createDemoEnvelope("evt-stream-1", 1, "progress", { message: "Loading approved context" })),
    toSseFrame(createDemoEnvelope("evt-stream-2", 2, "assistant.delta", { messageId: "assistant-stream", delta: "Here is " })),
    toSseFrame(createDemoEnvelope("evt-stream-2", 2, "assistant.delta", { messageId: "assistant-stream", delta: "duplicate" })),
    toSseFrame(createDemoEnvelope("evt-stream-4", 4, "assistant.delta", { messageId: "assistant-stream", delta: "a streamed answer." })),
    toSseFrame(createDemoEnvelope("evt-stream-5", 5, "assistant.final", { messageId: "assistant-stream" })),
    toSseFrame(
      createDemoEnvelope("evt-stream-6", 6, "action.proposed", {
        actionId: DEMO_ACTION_ID,
        actionType: "REPLACE_TEXT",
        resourceRef: DEMO_RESOURCE_REF,
        summary: "Review one proposed edit.",
        expiresAt: "2026-06-08T12:00:00.000Z"
      })
    ),
    toSseFrame(
      createDemoEnvelope("evt-stream-7", 7, "action.status_changed", {
        actionId: DEMO_ACTION_ID,
        previousStatus: "PROPOSED",
        status: "APPROVED",
        reasonCode: "USER_APPROVED"
      })
    ),
    toSseFrame(
      createDemoEnvelope("evt-stream-8", 8, "action.status_changed", {
        actionId: "action_stream_rejected",
        previousStatus: "PROPOSED",
        status: "REJECTED",
        reasonCode: "USER_REJECTED"
      })
    ),
    toSseFrame(
      createDemoEnvelope("evt-stream-9", 9, "action.status_changed", {
        actionId: "action_stream_expired",
        previousStatus: "PROPOSED",
        status: "EXPIRED",
        reasonCode: "ACTION_EXPIRED"
      })
    ),
    toSseFrame(
      createDemoEnvelope("evt-stream-10", 10, "error", {
        errorCode: "AUTHORIZATION_DENIED",
        category: "AUTHORIZATION",
        retryable: false,
        message: "Access denied."
      })
    ),
    "id: evt-stream-bad\nevent: message\ndata: {bad json",
    toSseFrame(createDemoEnvelope("evt-stream-11", 11, "error", { error: { category: "PROVIDER", code: "RATE_LIMITED" } }))
  ];
}

export function createAcceptedCommandView(): Record<string, string> {
  return {
    commandType: "assistant.command.create",
    sessionId: DEMO_SESSION_ID,
    requestId: DEMO_REQUEST_ID,
    correlationId: DEMO_CORRELATION_ID,
    status: "ACCEPTED"
  };
}

function parseSessionEventData(data: string): SessionEventEnvelope | null {
  try {
    const parsed = JSON.parse(data) as Partial<SessionEventEnvelope>;
    if (!parsed || typeof parsed.type !== "string" || typeof parsed.eventId !== "string") {
      return null;
    }
    return {
      eventId: parsed.eventId,
      sequence: typeof parsed.sequence === "number" ? parsed.sequence : 0,
      requestId: typeof parsed.requestId === "string" ? parsed.requestId : "",
      correlationId: typeof parsed.correlationId === "string" ? parsed.correlationId : "",
      tenantId: typeof parsed.tenantId === "string" ? parsed.tenantId : "",
      userId: typeof parsed.userId === "string" ? parsed.userId : "",
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : "",
      type: parsed.type,
      payload: isRecord(parsed.payload) ? parsed.payload : {},
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : ""
    };
  } catch {
    return null;
  }
}

function splitSseFrames(body: string): string[] {
  return body
    .split(/\r?\n\r?\n/)
    .map((frame) => frame.trim())
    .filter((frame) => frame.length > 0);
}

async function reduceReadableSseStream(
  body: ReadableStream<Uint8Array>,
  initialState: SessionStreamClientState,
  onState: ((state: SessionStreamClientState) => void) | undefined
): Promise<SessionStreamClientState> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let current = initialState;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const split = splitCompleteSseFrames(buffer);
      buffer = split.remaining;
      current = split.frames.reduce((state, frame) => reduceFrameAndNotify(state, frame, onState), current);
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      current = reduceFrameAndNotify(current, buffer, onState);
    }
  } finally {
    reader.releaseLock();
  }

  return current;
}

function reduceSseFrames(
  body: string,
  initialState: SessionStreamClientState,
  onState: ((state: SessionStreamClientState) => void) | undefined
): SessionStreamClientState {
  return splitSseFrames(body).reduce((state, frame) => reduceFrameAndNotify(state, frame, onState), initialState);
}

function reduceFrameAndNotify(
  state: SessionStreamClientState,
  frame: string,
  onState: ((state: SessionStreamClientState) => void) | undefined
): SessionStreamClientState {
  const next = reduceSseFrame(state, frame);
  if (next !== state) {
    onState?.(next);
  }
  return next;
}

function splitCompleteSseFrames(buffer: string): { frames: string[]; remaining: string } {
  const separator = /\r?\n\r?\n/;
  const frames: string[] = [];
  let remaining = buffer;

  for (;;) {
    const match = separator.exec(remaining);
    if (!match) {
      return { frames, remaining };
    }
    frames.push(remaining.slice(0, match.index));
    remaining = remaining.slice(match.index + match[0].length);
  }
}

const defaultSessionStreamRouteFetch: SessionStreamRouteFetch = async (streamUrl, init) => {
  const response = await fetch(streamUrl, init);
  return response;
};

function toSseFrame(event: SessionEventEnvelope): string {
  return [`id: ${event.eventId}`, "event: session-event", `data: ${JSON.stringify(event)}`].join("\n");
}

function createDemoEnvelope(
  eventId: string,
  sequence: number,
  type: string,
  payload: Record<string, unknown>
): SessionEventEnvelope {
  return {
    eventId,
    sequence,
    requestId: DEMO_REQUEST_ID,
    correlationId: DEMO_CORRELATION_ID,
    tenantId: DEMO_TENANT_ID,
    userId: DEMO_USER_ID,
    sessionId: DEMO_SESSION_ID,
    type,
    payload,
    createdAt: DEMO_CREATED_AT
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
