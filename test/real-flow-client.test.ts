import { describe, expect, it } from "vitest";
import {
  DEFAULT_REAL_FLOW_SESSION_ID,
  createSessionStreamUrl,
  createRealFlowClientConfig,
  createRealFlowClientDemoState,
  createRealFlowClientLogEvent,
  createRealFlowClientStateFromRuntimeEnv,
  createRealFlowClientViewModel,
  safeRealFlowLogExcludesForbiddenContent,
  type RealFlowClientState
} from "../src/real-flow-client";

describe("real flow client helpers", () => {
  it("models configurable HTTP and SSE backend routes", () => {
    const endpoints = createRealFlowClientConfig({
      actionDecision: "/internal/sessions/{sessionId}/actions/{actionId}/{decision}",
      sessionStream: "/internal/sessions/stream"
    });
    const state: RealFlowClientState = {
      httpBaseUrl: "http://localhost:9000/",
      sseBaseUrl: "http://localhost:9000/",
      sessionId: "session-test",
      endpoints,
      steps: [
        {
          id: "ask-stream",
          label: "Ask and stream",
          status: "ready",
          route: "actionDecision",
          pathParams: {
            actionId: "action custom/demo",
            decision: "reject"
          }
        }
      ]
    };

    const viewModel = createRealFlowClientViewModel(state);

    expect(viewModel.streamUrl).toBe("http://localhost:9000/internal/sessions/stream");
    expect(viewModel.steps[0]).toMatchObject({
      label: "Ask and stream",
      route: "/internal/sessions/session-test/actions/action%20custom%2Fdemo/reject",
      status: "Ready",
      tone: "ready"
    });
  });

  it("models deployed-shaped session stream URLs with session placeholders", () => {
    expect(createSessionStreamUrl("https://events.example.test/", "/sessions/{sessionId}/events", "session/with space")).toBe(
      "https://events.example.test/sessions/session%2Fwith%20space/events"
    );
  });

  it("reads deployed backend config from runtime env values without code changes", () => {
    const state = createRealFlowClientStateFromRuntimeEnv({
      VITE_API_BASE_URL: "https://api.dev.example.test/",
      VITE_SSE_BASE_URL: "https://events.dev.example.test/",
      VITE_DEMO_SESSION_ID: "session/demo value",
      VITE_COMMAND_CREATE_PATH: "/trusted/commands",
      VITE_SESSION_STREAM_PATH: "/sessions/{sessionId}/events"
    });
    const viewModel = createRealFlowClientViewModel(state);

    expect(viewModel.httpBaseUrl).toBe("https://api.dev.example.test");
    expect(viewModel.sessionId).toBe("session_demo_value");
    expect(viewModel.streamUrl).toBe("https://events.dev.example.test/sessions/session_demo_value/events");
    expect(viewModel.steps.find((step) => step.id === "ask-stream")?.route).toBe("/trusted/commands");
    expect(state.endpoints.setupStatus).toBe("/setup/status");
  });

  it("covers loading, retry, empty, disabled, and blocked states", () => {
    const viewModel = createRealFlowClientViewModel(createRealFlowClientDemoState());

    expect(viewModel.steps.map((step) => step.status)).toEqual([
      "Ready",
      "Loading",
      "Ready",
      "Retry",
      "Empty",
      "Blocked",
      "Retry",
      "Blocked",
      "Blocked",
      "Retry",
      "Disabled"
    ]);
    expect(viewModel.streamUrl).toBe(`http://localhost:8787/sessions/${DEFAULT_REAL_FLOW_SESSION_ID}/events`);
    expect(viewModel.durableRefreshRoute).toBe(`/resource-sessions/${DEFAULT_REAL_FLOW_SESSION_ID}`);
    expect(viewModel.steps.find((step) => step.id === "ask-stream")?.route).toBe(
      `/resource-sessions/${DEFAULT_REAL_FLOW_SESSION_ID}/commands`
    );
    expect(viewModel.steps.find((step) => step.id === "denied-request")?.route).toBe(
      `/resource-sessions/${DEFAULT_REAL_FLOW_SESSION_ID}/actions/action_denied_demo/approve`
    );
    expect(viewModel.steps.find((step) => step.id === "apply-action")?.route).toBe(
      `/resource-sessions/${DEFAULT_REAL_FLOW_SESSION_ID}/apply-action`
    );
    expect(viewModel.steps.find((step) => step.id === "ask-stream")).toMatchObject({
      retryable: true,
      message: "Provider quota is temporarily limited. Retry later. Retry after 30s."
    });
    expect(viewModel.steps.find((step) => step.id === "apply-action")?.message).toBe(
      "The document changed. Refresh context before applying."
    );
  });

  it("maps permission, provider-unavailable, and uncertain-mutation errors to safe messages", () => {
    const state: RealFlowClientState = {
      ...createRealFlowClientDemoState(),
      steps: [
        {
          id: "permission-denied",
          label: "Permission denied",
          status: "blocked",
          route: "resourceSession",
          error: { code: "GOOGLE_PERMISSION_DENIED", category: "AUTHORIZATION", retryable: false }
        },
        {
          id: "provider-unavailable",
          label: "Provider unavailable",
          status: "blocked",
          route: "commandCreate",
          error: { code: "PROVIDER_UNAVAILABLE", category: "DEPENDENCY", retryable: true }
        },
        {
          id: "uncertain-mutation",
          label: "Uncertain mutation",
          status: "blocked",
          route: "actionApply",
          error: { code: "UNCERTAIN_MUTATION_STATE", category: "DEPENDENCY", retryable: false }
        }
      ]
    };

    const messages = createRealFlowClientViewModel(state).steps.map((step) => step.message);

    expect(messages).toEqual([
      "Google permission is missing for this document.",
      "Provider access is temporarily unavailable.",
      "Mutation state is uncertain. Refresh before retrying."
    ]);
  });


  it("keeps real-flow client logs metadata-only", () => {
    const state = createRealFlowClientDemoState();
    const safeLogEvent = createRealFlowClientLogEvent(state);

    expect(safeRealFlowLogExcludesForbiddenContent(safeLogEvent)).toBe(true);
    expect(JSON.stringify(safeLogEvent)).not.toMatch(/document text|selected text|prompt|oauth|sk-live/i);
  });

  it("detects unsafe route or log values before logging", () => {
    const unsafeLogEvent = createRealFlowClientLogEvent({
      ...createRealFlowClientDemoState(),
      endpoints: createRealFlowClientConfig({
        sessionStream: "/api/session-events/stream?authorizationHeader=Bearer leaked"
      })
    });

    expect(safeRealFlowLogExcludesForbiddenContent(unsafeLogEvent)).toBe(false);
  });
});
