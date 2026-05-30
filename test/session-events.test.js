import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PROCESSED_EVENT_IDS, createInitialSessionState, reduceSessionEvent } from "../src/session-events.js";

test("reduces assistant deltas and final events into a single message", () => {
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

  assert.deepEqual(state.messages, [
    { messageId: "msg-1", role: "assistant", content: "Hello there", status: "FINAL" }
  ]);
});

test("deduplicates session events by eventId", () => {
  let state = createInitialSessionState();
  const event = { eventId: "evt-1", type: "progress", message: "Fetching context" };

  state = reduceSessionEvent(state, event);
  state = reduceSessionEvent(state, event);

  assert.equal(state.progress.length, 1);
  assert.deepEqual(state.processedEventIds, ["evt-1"]);
});

test("maps raw errors to safe user-facing errors", () => {
  const state = reduceSessionEvent(createInitialSessionState(), {
    eventId: "evt-1",
    type: "error",
    error: {
      category: "OAUTH",
      code: "TOKEN_EXPIRED",
      message: "raw token value should not be shown"
    }
  });

  assert.equal(state.errors[0].message, "Reconnect the provider account to continue.");
  assert.equal(state.errors[0].code, "TOKEN_EXPIRED");
});

test("tracks proposed action status transitions", () => {
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

  assert.equal(state.proposedActions["action-1"].status, "CONFLICTED");
});

test("stores only safe proposed action fields", () => {
  const state = reduceSessionEvent(createInitialSessionState(), {
    eventId: "evt-1",
    type: "action.proposed",
    action: {
      actionId: "action-1",
      actionType: "REPLACE_TEXT",
      resourceId: "doc-1",
      resourceTitle: "Draft",
      preview: "Replace selected text",
      payload: { decrypted: true },
      originalText: "sensitive original",
      replacementText: "sensitive replacement",
      apiKey: "secret",
      providerResponse: "raw provider response"
    }
  });

  assert.deepEqual(state.proposedActions["action-1"], {
    actionId: "action-1",
    actionType: "REPLACE_TEXT",
    resourceId: "doc-1",
    resourceTitle: "Draft",
    preview: "Replace selected text",
    createdAt: null,
    expiresAt: null,
    status: "PROPOSED"
  });
});

test("ignores invalid action status events without mutating action state", () => {
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

  assert.equal(state.proposedActions["action-1"].status, "PROPOSED");
  assert.equal(state.errors[0].code, "INVALID_SESSION_EVENT");
});

test("does not create action placeholders for invalid status events", () => {
  const state = reduceSessionEvent(createInitialSessionState(), {
    eventId: "evt-1",
    type: "action.status",
    actionId: "action-1",
    status: undefined
  });

  assert.equal(Object.hasOwn(state.proposedActions, "action-1"), false);
  assert.equal(state.errors[0].code, "INVALID_SESSION_EVENT");
});

test("bounds processed event id history while deduplicating recent events", () => {
  let state = createInitialSessionState();
  for (let index = 0; index < MAX_PROCESSED_EVENT_IDS + 5; index += 1) {
    state = reduceSessionEvent(state, {
      eventId: `evt-${index}`,
      type: "progress",
      message: `step-${index}`
    });
  }

  assert.equal(state.processedEventIds.length, MAX_PROCESSED_EVENT_IDS);
  const progressCount = state.progress.length;
  state = reduceSessionEvent(state, {
    eventId: `evt-${MAX_PROCESSED_EVENT_IDS + 4}`,
    type: "progress",
    message: "duplicate"
  });

  assert.equal(state.progress.length, progressCount);
});
