import { describe, expect, it } from "vitest";
import {
  LAST_EVENT_ID_HEADER,
  createAcceptedCommandView,
  createInitialSessionStreamClientState,
  createLastEventIdHeaders,
  createSessionStreamDemoFrames,
  fetchSessionStreamRoute,
  getSessionStreamRefreshGuidance,
  reduceSseFrame,
  safeSessionStreamLogExcludesForbiddenContent,
  type SessionEventEnvelope,
  type SessionStreamRouteFetch
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

  it("receives deployed-shaped SSE route events and carries Last-Event-ID on reconnect", async () => {
    const requestedHeaders: Record<string, string>[] = [];
    const stateUpdates: string[] = [];
    const routeFetch: SessionStreamRouteFetch = async (_streamUrl, init) => {
      requestedHeaders.push(init.headers);
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === "content-type" ? "text/event-stream" : null)
        },
        body: readableStreamFromChunks([
          ": keepalive\n\n",
          toRouteFrame(
            createRouteEnvelope("evt-route-1", 1, "progress", {
              stage: "context.loading",
              status: "RUNNING",
              messageCode: "CONTEXT_LOADING",
              message: "Loading context"
            })
          ),
          "\n\n",
          [
            toRouteFrame(createRouteEnvelope("evt-route-2", 2, "assistant.delta", { messageId: "msg-route", delta: "Draft " })),
            toRouteFrame(createRouteEnvelope("evt-route-2", 2, "assistant.delta", { messageId: "msg-route", delta: "duplicate" })),
            toRouteFrame(createRouteEnvelope("evt-route-4", 4, "assistant.delta", { messageId: "msg-route", delta: "ready." }))
          ].join("\n\n"),
          "\n\n",
          [
            toRouteFrame(createRouteEnvelope("evt-route-5", 5, "assistant.final", { messageId: "msg-route", finishReason: "stop" })),
            toRouteFrame(
              createRouteEnvelope("evt-route-6", 6, "action.proposed", {
                actionId: "action-route-1",
                actionType: "REPLACE_TEXT",
                resourceRef: { resourceId: "doc-route-1", displayName: "Route fixture doc" },
                summary: "Review one deployed-shaped proposal.",
                expiresAt: "2026-07-05T00:00:00.000Z"
              })
            ),
            toRouteFrame(
              createRouteEnvelope("evt-route-7", 7, "action.status_changed", {
                actionId: "action-route-1",
                previousStatus: "PROPOSED",
                status: "APPROVED",
                reasonCode: "USER_APPROVED"
              })
            ),
            toRouteFrame(
              createRouteEnvelope("evt-route-8", 8, "error", {
                errorCode: "DEPENDENCY_UNAVAILABLE",
                category: "DEPENDENCY",
                retryable: true,
                message: "A connected service is unavailable. Retry later."
              })
            ),
            "id: evt-route-bad\nevent: session-event\ndata: {bad json"
          ].join("\n\n")
        ]),
        text: async () => {
          throw new Error("streaming route test must not buffer response.text()");
        }
      };
    };

    const result = await fetchSessionStreamRoute({
      streamUrl: "https://sse.dev.example.test/sessions/session-route/events",
      lastEventId: "evt-route-0",
      fetcher: routeFetch,
      onState: (state) => {
        stateUpdates.push(
          `${state.session.lastEventId ?? "none"}:${state.session.progress.length}:${state.session.messages[0]?.content ?? ""}`
        );
      }
    });

    expect(requestedHeaders).toEqual([{ [LAST_EVENT_ID_HEADER]: "evt-route-0" }]);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("text/event-stream");
    expect(stateUpdates).toContain("evt-route-1:1:");
    expect(stateUpdates).toContain("evt-route-2:1:Draft ");
    expect(stateUpdates).toContain("evt-route-4:1:Draft ready.");
    expect(result.state.session.progress.map((progress) => progress.message)).toEqual(["Loading context"]);
    expect(result.state.session.messages).toEqual([
      { messageId: "msg-route", role: "assistant", content: "Draft ready.", status: "FINAL" }
    ]);
    expect(result.state.session.processedEventIds.filter((eventId) => eventId === "evt-route-2")).toHaveLength(1);
    expect(result.state.session.proposedActions["action-route-1"]).toMatchObject({
      actionId: "action-route-1",
      actionType: "REPLACE_TEXT",
      resourceId: "doc-route-1",
      resourceTitle: "Route fixture doc",
      preview: "Review one deployed-shaped proposal.",
      status: "APPROVED"
    });
    expect(result.state.session.errors.map((error) => error.code)).toEqual([
      "DEPENDENCY_UNAVAILABLE",
      "INVALID_SESSION_EVENT"
    ]);
    expect(result.state.session.streamWarnings.map((warning) => warning.kind)).toEqual([
      "SEQUENCE_GAP",
      "MALFORMED_EVENT"
    ]);
    expect(result.state.lastEventId).toBe("evt-route-8");
    expect(result.state.reconnectRequired).toBe(true);
    expect(result.refreshGuidance).toBe("Refresh durable session state over HTTP before applying changes.");
    expect(safeSessionStreamLogExcludesForbiddenContent(result.state.safeLogEvent)).toBe(true);
  });

  it("preserves existing state and duplicate suppression across reconnect replay", async () => {
    const initialState = reduceSseFrame(
      createInitialSessionStreamClientState(),
      toRouteFrame(createRouteEnvelope("evt-replay-1", 1, "assistant.delta", { messageId: "msg-replay", delta: "Hello " }))
    );
    const routeFetch: SessionStreamRouteFetch = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "text/event-stream" : null)
      },
      body: readableStreamFromChunks([
        [
          toRouteFrame(createRouteEnvelope("evt-replay-1", 1, "assistant.delta", { messageId: "msg-replay", delta: "Hello " })),
          toRouteFrame(createRouteEnvelope("evt-replay-2", 2, "assistant.delta", { messageId: "msg-replay", delta: "world" })),
          toRouteFrame(createRouteEnvelope("evt-replay-3", 3, "assistant.final", { messageId: "msg-replay", finishReason: "stop" }))
        ].join("\n\n")
      ]),
      text: async () => {
        throw new Error("reconnect replay test must not buffer response.text()");
      }
    });

    const result = await fetchSessionStreamRoute({
      streamUrl: "https://sse.dev.example.test/sessions/session-route/events",
      lastEventId: "evt-replay-1",
      initialState,
      fetcher: routeFetch
    });

    expect(result.requestHeaders).toEqual({ [LAST_EVENT_ID_HEADER]: "evt-replay-1" });
    expect(result.state.session.messages).toEqual([
      { messageId: "msg-replay", role: "assistant", content: "Hello world", status: "FINAL" }
    ]);
    expect(result.state.session.processedEventIds.filter((eventId) => eventId === "evt-replay-1")).toHaveLength(1);
  });

  it("lets browser callers abort a long-lived stream", async () => {
    const abortController = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const routeFetch: SessionStreamRouteFetch = async (_streamUrl, init) => {
      observedSignal = init.signal;
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === "content-type" ? "text/event-stream" : null)
        },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `${toRouteFrame(createRouteEnvelope("evt-abort-1", 1, "progress", { message: "Connected" }))}\n\n`
              )
            );
            init.signal?.addEventListener("abort", () => controller.close(), { once: true });
          }
        }),
        text: async () => {
          throw new Error("abort test must not buffer response.text()");
        }
      };
    };

    const result = await fetchSessionStreamRoute({
      streamUrl: "https://sse.dev.example.test/sessions/session-route/events",
      signal: abortController.signal,
      fetcher: routeFetch,
      onState: () => abortController.abort()
    });

    expect(observedSignal).toBe(abortController.signal);
    expect(abortController.signal.aborted).toBe(true);
    expect(result.state.session.progress.map((progress) => progress.message)).toEqual(["Connected"]);
    expect(result.state.lastEventId).toBe("evt-abort-1");
  });

  it("parses malformed frames into safe error state", () => {
    const state = reduceSseFrame(createInitialSessionStreamClientState(), "id: bad\nevent: session-event\ndata: {nope");

    expect(state.malformedFrameCount).toBe(1);
    expect(state.reconnectRequired).toBe(true);
    expect(state.lastEventId).toBeNull();
    expect(state.session.errors[0].code).toBe("INVALID_SESSION_EVENT");
    expect(getSessionStreamRefreshGuidance(state)).toBe("Refresh durable session state over HTTP before applying changes.");
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

function toRouteFrame(event: SessionEventEnvelope): string {
  return [`id: ${event.eventId}`, "event: session-event", `data: ${JSON.stringify(event)}`].join("\n");
}

function createRouteEnvelope(
  eventId: string,
  sequence: number,
  type: string,
  payload: Record<string, unknown>
): SessionEventEnvelope {
  return {
    eventId,
    sequence,
    requestId: "request_route",
    correlationId: "correlation_route",
    tenantId: "tenant_route",
    userId: "user_route",
    sessionId: "session-route",
    type,
    payload,
    createdAt: "2026-07-04T00:00:00.000Z"
  };
}

function readableStreamFromChunks(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
}
