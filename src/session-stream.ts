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
  /authorization/i,
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
    const session = reduceSessionEvent(current.session, null);
    return {
      ...current,
      session,
      malformedFrameCount: current.malformedFrameCount + 1,
      reconnectRequired: true,
      safeLogEvent: createSessionStreamLogEvent(session, null)
    };
  }

  const event = parseSessionEventData(parsedFrame.data);
  const session = reduceSessionEvent(current.session, event);
  const malformed = event === null;
  return {
    session,
    lastEventId: parsedFrame.id ?? event?.eventId ?? current.lastEventId,
    reconnectRequired: malformed || session.streamWarnings.some((warning) => warning.kind === "SEQUENCE_GAP"),
    malformedFrameCount: current.malformedFrameCount + (malformed ? 1 : 0),
    safeLogEvent: createSessionStreamLogEvent(session, event)
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
    "id: evt-stream-bad\nevent: message\ndata: {bad json",
    toSseFrame(createDemoEnvelope("evt-stream-6", 6, "error", { error: { category: "PROVIDER", code: "RATE_LIMITED" } }))
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
