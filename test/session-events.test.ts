import { describe, expect, it } from "vitest";
import { MAX_PROCESSED_EVENT_IDS, createInitialSessionState, reduceSessionEvent } from "../src/session-events";

describe("session event reducer", () => {
  it("reduces assistant deltas and final events into a single message", () => {
    let state = createInitialSessionState();
    state = reduceSessionEvent(state, {
      eventId: "evt-1",
      type: "assistant.delta",
      messageId: "msg-1",
      delta: "Hello "
    });
    state = reduceSessionEvent(state, {
      eventId: "evt-2",
      type: "assistant.delta",
      messageId: "msg-1",
      delta: "there"
    });
    state = reduceSessionEvent(state, {
      eventId: "evt-3",
      type: "assistant.final",
      messageId: "msg-1"
    });

    expect(state.messages).toEqual([
      { messageId: "msg-1", role: "assistant", content: "Hello there", status: "FINAL" }
    ]);
  });

  it("deduplicates session events by eventId", () => {
    let state = createInitialSessionState();
    const event = { eventId: "evt-1", type: "progress", message: "Fetching context" };

    state = reduceSessionEvent(state, event);
    state = reduceSessionEvent(state, event);

    expect(state.progress).toHaveLength(1);
    expect(state.processedEventIds).toEqual(["evt-1"]);
  });

  it("maps raw errors to safe user-facing errors", () => {
    const state = reduceSessionEvent(createInitialSessionState(), {
      eventId: "evt-1",
      type: "error",
      error: {
        category: "OAUTH",
        code: "TOKEN_EXPIRED"
      }
    });

    expect(state.errors[0].message).toBe("Reconnect the provider account to continue.");
    expect(state.errors[0].code).toBe("TOKEN_EXPIRED");
  });

  it("tracks transport state and default progress content", () => {
    let state = createInitialSessionState();
    state = reduceSessionEvent(state, { type: "transport.connected" });
    state = reduceSessionEvent(state, { type: "progress" });
    state = reduceSessionEvent(state, { type: "transport.disconnected" });

    expect(state.connection).toBe("DISCONNECTED");
    expect(state.progress[0]).toEqual({
      eventId: null,
      message: "Working",
      createdAt: null
    });
    expect(state.processedEventIds).toEqual([]);
  });

  it("returns the current state for missing or malformed events", () => {
    const state = createInitialSessionState();

    const reducedNull = reduceSessionEvent(state, null);
    const reducedEmpty = reduceSessionEvent(state, {});

    expect(reducedNull.errors[0].code).toBe("INVALID_SESSION_EVENT");
    expect(reducedNull.streamWarnings[0].kind).toBe("MALFORMED_EVENT");
    expect(reducedEmpty.errors[0].code).toBe("INVALID_SESSION_EVENT");
  });

  it("records unknown event types as safe errors", () => {
    const state = reduceSessionEvent(createInitialSessionState(), {
      eventId: "evt-unknown",
      type: "raw.provider.payload"
    });

    expect(state.errors[0].category).toBe("INTERNAL");
    expect(state.errors[0].code).toBe("UNKNOWN_SESSION_EVENT");
  });

  it("tracks proposed action status transitions", () => {
    let state = createInitialSessionState();
    state = reduceSessionEvent(state, {
      eventId: "evt-1",
      type: "action.proposed",
      action: { actionId: "action-1", actionType: "REPLACE_TEXT" }
    });
    state = reduceSessionEvent(state, {
      eventId: "evt-2",
      type: "action.status",
      actionId: "action-1",
      status: "CONFLICTED"
    });

    expect(state.proposedActions["action-1"].status).toBe("CONFLICTED");
  });

  it("creates an action status view for valid status events that arrive before proposal details", () => {
    const state = reduceSessionEvent(createInitialSessionState(), {
      eventId: "evt-1",
      type: "action.status",
      actionId: "action-1",
      status: "APPROVED",
      createdAt: "2026-05-30T00:00:00.000Z"
    });

    expect(state.proposedActions["action-1"]).toEqual({
      actionId: "action-1",
      status: "APPROVED",
      updatedAt: "2026-05-30T00:00:00.000Z"
    });
  });

  it("stores only safe proposed action fields", () => {
    const state = reduceSessionEvent(createInitialSessionState(), {
      eventId: "evt-1",
      type: "action.proposed",
      action: {
        actionId: "action-1",
        actionType: "REPLACE_TEXT",
        resourceId: "doc-1",
        resourceTitle: "Draft",
        preview: "Replace selected text",
        createdAt: undefined,
        expiresAt: undefined
      }
    });

    expect(state.proposedActions["action-1"]).toEqual({
      actionId: "action-1",
      actionType: "REPLACE_TEXT",
      resourceId: "doc-1",
      resourceTitle: "Draft",
      preview: "Replace selected text",
      createdAt: null,
      expiresAt: null,
      status: "PROPOSED"
    });
    expect(Object.hasOwn(state.proposedActions["action-1"], "payload")).toBe(false);
  });

  it("ignores invalid action status events without mutating action state", () => {
    let state = createInitialSessionState();
    state = reduceSessionEvent(state, {
      eventId: "evt-1",
      type: "action.proposed",
      action: { actionId: "action-1", actionType: "REPLACE_TEXT" }
    });
    state = reduceSessionEvent(state, {
      eventId: "evt-2",
      type: "action.status",
      actionId: "action-1",
      status: "BAD_STATUS"
    });

    expect(state.proposedActions["action-1"].status).toBe("PROPOSED");
    expect(state.errors[0].code).toBe("INVALID_SESSION_EVENT");
  });

  it("does not create action placeholders for invalid status events", () => {
    const state = reduceSessionEvent(createInitialSessionState(), {
      eventId: "evt-1",
      type: "action.status",
      actionId: "action-1",
      status: undefined
    });

    expect(Object.hasOwn(state.proposedActions, "action-1")).toBe(false);
    expect(state.errors[0].code).toBe("INVALID_SESSION_EVENT");
  });

  it("bounds processed event id history while deduplicating recent events", () => {
    let state = createInitialSessionState();
    for (let index = 0; index < MAX_PROCESSED_EVENT_IDS + 5; index += 1) {
      state = reduceSessionEvent(state, {
        eventId: `evt-${index}`,
        type: "progress",
        message: `step-${index}`
      });
    }

    expect(state.processedEventIds).toHaveLength(MAX_PROCESSED_EVENT_IDS);
    const progressCount = state.progress.length;
    state = reduceSessionEvent(state, {
      eventId: `evt-${MAX_PROCESSED_EVENT_IDS + 4}`,
      type: "progress",
      message: "duplicate"
    });

    expect(state.progress).toHaveLength(progressCount);
  });

  it("finalizes a new assistant message with explicit content", () => {
    const state = reduceSessionEvent(createInitialSessionState(), {
      eventId: "evt-1",
      type: "assistant.final",
      messageId: "msg-1",
      content: "Complete response"
    });

    expect(state.messages).toEqual([
      { messageId: "msg-1", role: "assistant", content: "Complete response", status: "FINAL" }
    ]);
  });

  it("reduces full SessionEvent envelopes with nested payloads", () => {
    let state = createInitialSessionState();
    state = reduceSessionEvent(state, {
      eventId: "evt-1",
      sequence: 1,
      type: "progress",
      payload: { message: "Loading approved context" },
      createdAt: "2026-06-07T12:00:00.000Z"
    });
    state = reduceSessionEvent(state, {
      eventId: "evt-2",
      sequence: 2,
      type: "assistant.delta",
      payload: { messageId: "msg-1", delta: "Streaming " }
    });
    state = reduceSessionEvent(state, {
      eventId: "evt-3",
      sequence: 3,
      type: "assistant.final",
      payload: { messageId: "msg-1", content: "Streaming answer" }
    });

    expect(state.progress[0]).toEqual({
      eventId: "evt-1",
      message: "Loading approved context",
      createdAt: "2026-06-07T12:00:00.000Z"
    });
    expect(state.messages).toEqual([
      { messageId: "msg-1", role: "assistant", content: "Streaming answer", status: "FINAL" }
    ]);
    expect(state.lastEventId).toBe("evt-3");
    expect(state.lastSequence).toBe(3);
  });

  it("records sequence gaps without exposing raw event payloads", () => {
    let state = createInitialSessionState();
    state = reduceSessionEvent(state, { eventId: "evt-1", sequence: 1, type: "progress" });
    state = reduceSessionEvent(state, { eventId: "evt-3", sequence: 3, type: "progress" });

    expect(state.streamWarnings).toEqual([
      {
        eventId: "evt-3",
        kind: "SEQUENCE_GAP",
        message: "The event stream skipped one or more updates. Refresh durable state before applying changes."
      }
    ]);
  });
});
