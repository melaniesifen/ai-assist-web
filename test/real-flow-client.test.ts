import { describe, expect, it } from "vitest";
import {
  createRealFlowClientConfig,
  createRealFlowClientDemoState,
  createRealFlowClientLogEvent,
  createRealFlowClientViewModel,
  safeRealFlowLogExcludesForbiddenContent,
  type RealFlowClientState
} from "../src/real-flow-client";

describe("real flow client helpers", () => {
  it("models configurable HTTP and SSE backend routes", () => {
    const endpoints = createRealFlowClientConfig({
      commandCreate: "/internal/commands",
      sessionStream: "/internal/sessions/stream"
    });
    const state: RealFlowClientState = {
      httpBaseUrl: "http://localhost:9000/",
      sseBaseUrl: "http://localhost:9000/",
      endpoints,
      steps: [
        {
          id: "ask-stream",
          label: "Ask and stream",
          status: "ready",
          route: "commandCreate"
        }
      ]
    };

    const viewModel = createRealFlowClientViewModel(state);

    expect(viewModel.streamUrl).toBe("http://localhost:9000/internal/sessions/stream");
    expect(viewModel.steps[0]).toMatchObject({
      label: "Ask and stream",
      route: "/internal/commands",
      status: "Ready",
      tone: "ready"
    });
  });

  it("covers loading, retry, empty, disabled, and blocked states", () => {
    const viewModel = createRealFlowClientViewModel(createRealFlowClientDemoState());

    expect(viewModel.steps.map((step) => step.status)).toEqual([
      "Ready",
      "Loading",
      "Ready",
      "Empty",
      "Retry",
      "Blocked",
      "Disabled"
    ]);
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
