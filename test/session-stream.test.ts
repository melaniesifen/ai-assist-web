import { describe, expect, it } from "vitest";
import {
  LAST_EVENT_ID_HEADER,
  createAcceptedCommandView,
  createInitialSessionStreamClientState,
  createLastEventIdHeaders,
  createSessionStreamDemoFrames,
  reduceSseFrame,
  safeSessionStreamLogExcludesForbiddenContent
} from "../src/session-stream";

describe("session stream client helpers", () => {
  it("reduces mocked SSE frames with full SessionEvent envelopes", () => {
    const state = createSessionStreamDemoFrames().reduce(reduceSseFrame, createInitialSessionStreamClientState());

    expect(state.session.progress[0].message).toBe("Loading approved context");
    expect(state.session.messages).toEqual([
      { messageId: "assistant-stream", role: "assistant", content: "Here is a streamed answer.", status: "FINAL" }
    ]);
    expect(state.session.processedEventIds.filter((eventId) => eventId === "evt-stream-2")).toHaveLength(1);
    expect(state.session.streamWarnings.map((warning) => warning.kind)).toContain("SEQUENCE_GAP");
    expect(state.malformedFrameCount).toBe(1);
    expect(state.reconnectRequired).toBe(true);
    expect(state.session.errors.map((error) => error.code)).toEqual([
      "AUTHORIZATION_DENIED",
      "INVALID_SESSION_EVENT",
      "RATE_LIMITED"
    ]);
  });

  it("creates Last-Event-ID headers only when a reconnect cursor exists", () => {
    expect(createLastEventIdHeaders(null)).toEqual({});
    expect(createLastEventIdHeaders("evt-9")).toEqual({ [LAST_EVENT_ID_HEADER]: "evt-9" });
  });

  it("parses malformed frames into safe error state", () => {
    const state = reduceSseFrame(createInitialSessionStreamClientState(), "id: bad\nevent: session-event\ndata: {nope");

    expect(state.malformedFrameCount).toBe(1);
    expect(state.reconnectRequired).toBe(true);
    expect(state.session.errors[0].code).toBe("INVALID_SESSION_EVENT");
  });

  it("keeps stream logs metadata-only", () => {
    const state = createSessionStreamDemoFrames().reduce(reduceSseFrame, createInitialSessionStreamClientState());

    expect(safeSessionStreamLogExcludesForbiddenContent(state.safeLogEvent)).toBe(true);
    expect(JSON.stringify(state.safeLogEvent)).not.toMatch(/raw document|selected text|model response|oauth|sk-live/i);
  });

  it("models backend command acceptance metadata without sensitive content", () => {
    expect(createAcceptedCommandView()).toEqual({
      commandType: "assistant.command.create",
      sessionId: "session_stream_demo",
      requestId: "request_demo_stream",
      correlationId: "correlation_demo_stream",
      status: "ACCEPTED"
    });
  });
});
