import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDogfoodSidebarState, type DogfoodSidebarContractInput } from "../src/dogfood-sidebar-state";
import { createInitialSessionStreamClientState, reduceSseFrame, type SessionEventEnvelope } from "../src/session-stream";
import {
  App,
  createDogfoodSidebarInputFromSearch,
  DogfoodAssistantSurface,
  DogfoodSessionStatePanel,
  DogfoodCommandResultPanel,
  preventDogfoodCommandSubmit
} from "../src/App";

const CONNECTED_INPUT: DogfoodSidebarContractInput = {
  productAuth: "signed_in",
  googleOAuth: "connected",
  activeDocument: {
    status: "detected",
    documentId: "doc_connected_123"
  },
  context: "ready",
  provider: "ready",
  command: "ready",
  stream: "open",
  proposedActions: "ready",
  apply: "ready",
  controlledDocumentWriteApproved: true
};

describe("dogfood sidebar shell", () => {
  it("renders the connected assistant as the primary surface", () => {
    const state = createDogfoodSidebarState(CONNECTED_INPUT);
    const html = renderToStaticMarkup(<DogfoodAssistantSurface input={CONNECTED_INPUT} state={state} />);

    expect(html).toContain("Chat with this doc");
    expect(html).toContain("Connected");
    expect(html).toContain("Chat");
    expect(html).toContain("Summarize this doc");
    expect(html).toContain("Ask a question about this Google Doc.");
    expect(html).not.toContain("Product login");
    expect(html).not.toContain("Google</span>");
    expect(html).not.toContain("Mocked assistant chat");
    expect(html).not.toContain("Proposed edit review cards");
  });

  it("renders actionable blockers without enabling command submission", () => {
    const input = createDogfoodSidebarInputFromSearch(
      "?productAuthStatus=signed_out&googleOAuthStatus=not_connected&activeTabUrl=https%3A%2F%2Fdocs.google.com%2Fdocument%2Fd%2Fmissing%2Fedit&providerStatus=missing&contextStatus=consent_required",
      null
    );
    const state = createDogfoodSidebarState(input);
    const html = renderToStaticMarkup(<DogfoodAssistantSurface input={input} state={state} />);

    expect(state.canSubmitCommand).toBe(false);
    expect(html).toContain("Setup needed");
    expect(html).toContain("PRODUCT_AUTH_REQUIRED");
    expect(html).toContain("GOOGLE_OAUTH_REQUIRED");
    expect(html).toContain("ACTIVE_DOCUMENT_REQUIRED");
    expect(html).toContain("CONTEXT_CONSENT_REQUIRED");
    expect(html).toContain("PROVIDER_REQUIRED");
    expect(html).toContain("Sign in to AI Assist before using the sidebar.");
    expect(html).toContain("disabled");
  });

  it("does not fall back to demo document identity when runtime document context is missing", () => {
    const input = createDogfoodSidebarInputFromSearch(
      "?documentId=&activeTabUrl=https%3A%2F%2Fdocs.google.com%2Fdocument%2Fd%2Fmissing%2Fedit",
      null
    );

    expect(input.activeDocument).toEqual({
      status: "missing_document_id"
    });
  });

  it("enables command submission when the extension supplies connected readiness gates", () => {
    const input = createDogfoodSidebarInputFromSearch(
      "?documentId=doc_connected_123&productAuthStatus=signed_in&googleOAuthStatus=connected&contextStatus=ready&providerStatus=ready&commandStatus=ready&streamStatus=open",
      null
    );
    const state = createDogfoodSidebarState(input);

    expect(state.canSubmitCommand).toBe(true);
    expect(state.activeDocumentId).toBe("doc_connected_123");
    expect(state.blockers.map((blocker) => blocker.area)).toEqual(["apply", "apply"]);
  });

  it("prevents default form navigation while backend command submission is pending", () => {
    let prevented = false;

    preventDogfoodCommandSubmit({
      preventDefault: () => {
        prevented = true;
      }
    });

    expect(prevented).toBe(true);
  });

  it("keeps the primary app title ID unique even with diagnostics in the DOM", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html.match(/id="app-title"/g)).toHaveLength(1);
    expect(html).toContain("id=\"dev-harness-title\"");
  });

  it("renders command results without exposing raw prompt, bearer, or document content", () => {
    const html = renderToStaticMarkup(
      <DogfoodCommandResultPanel
        result={{
          status: "retryable_error",
          title: "Command can be retried",
          message: "The backend command route is unavailable from this browser session. Retry after readiness is refreshed.",
          retryable: true,
          route: "/resource-sessions/session_001/commands",
          requestId: null,
          correlationId: null,
          commandId: "cmd_safe_001",
          errorCode: "BACKEND_UNAVAILABLE",
          safeLogEvent: {
            event: "dogfood-command-submission",
            commandKind: "custom",
            routeTemplate: "/resource-sessions/{sessionId}/commands",
            route: "/resource-sessions/session_001/commands",
            hasActiveDocument: true,
            inputLength: 32,
            resultStatus: "retryable_error",
            httpStatus: null,
            requestId: null,
            correlationId: null,
            commandIdPresent: true,
            errorCode: "BACKEND_UNAVAILABLE",
            blockerCodes: []
          }
        }}
      />
    );

    expect(html).toContain("Command can be retried");
    expect(html).toContain("BACKEND_UNAVAILABLE");
    expect(html).toContain("metadata only");
    expect(html).not.toMatch(/private prompt|document text|doc_connected_123|Bearer|id\.jwt/i);
  });

  it("renders deterministic stream progress, final assistant output, and backend proposed edit cards", () => {
    const state = createDogfoodSidebarState(CONNECTED_INPUT);
    const streamState = [
      createEnvelope("evt-1", 1, "progress", { message: "Reading approved context" }),
      createEnvelope("evt-2", 2, "assistant.delta", { messageId: "msg-1", delta: "Draft " }),
      createEnvelope("evt-3", 3, "assistant.final", { messageId: "msg-1", content: "Draft final answer." }),
      createEnvelope("evt-4", 4, "action.proposed", {
        actionId: "action_test_backend_001",
        actionType: "REPLACE_TEXT",
        resourceRef: { resourceId: "doc_connected_123", displayName: "Controlled test doc" },
        summary: "Deterministic test proposal from backend-shaped state.",
        expiresAt: "2026-07-05T00:00:00.000Z"
      })
    ].reduce((current, event) => reduceSseFrame(current, { id: event.eventId, data: JSON.stringify(event) }), createInitialSessionStreamClientState());
    const html = renderToStaticMarkup(
      <DogfoodAssistantSurface input={CONNECTED_INPUT} initialSessionStreamState={streamState} state={state} />
    );

    expect(html).toContain("Chat");
    expect(html).toContain("Reading approved context");
    expect(html).toContain("Draft final answer.");
    expect(html).toContain("Suggested edits");
    expect(html).toContain("action_test_backend_001");
    expect(html).toContain("Deterministic test proposal from backend-shaped state.");
    expect(html).toContain("Apply");
    expect(html).toContain("metadata only");
  });

  it("keeps apply disabled when controlled-document write approval is missing", () => {
    const input = {
      ...CONNECTED_INPUT,
      controlledDocumentWriteApproved: false
    };
    const state = createDogfoodSidebarState(input);
    const streamState = reduceSseFrame(
      createInitialSessionStreamClientState(),
      {
        id: "evt-approved",
        data: JSON.stringify(
          createEnvelope("evt-approved", 1, "action.status_changed", {
            actionId: "action_test_approved",
            status: "APPROVED"
          })
        )
      }
    );
    const html = renderToStaticMarkup(
      <DogfoodSessionStatePanel
        actionResult={null}
        actionRouteStates={{}}
        actionSubmitting={null}
        onRefresh={async () => undefined}
        onAction={async () => undefined}
        proposedActions={Object.values(streamState.session.proposedActions)}
        sidebarState={state}
        streamRefreshError={null}
        streamRefreshing={false}
        streamState={streamState}
      />
    );

    expect(html).toContain("action_test_approved");
    expect(html).toContain("Apply stays disabled until backend readiness and controlled-document approval are present.");
    expect(html).toMatch(/<button class="primary" disabled="" type="button">Apply<\/button>/);
  });

  it("keeps action controls disabled when backend session identity is missing", () => {
    const state = createDogfoodSidebarState(CONNECTED_INPUT);
    const streamState = reduceSseFrame(
      createInitialSessionStreamClientState(),
      {
        id: "evt-missing-session",
        data: JSON.stringify({
          ...createEnvelope("evt-missing-session", 1, "action.proposed", {
            actionId: "action_missing_session",
            actionType: "REPLACE_TEXT",
            summary: "Deterministic proposal without backend session identity."
          }),
          sessionId: ""
        })
      }
    );
    const html = renderToStaticMarkup(
      <DogfoodSessionStatePanel
        actionResult={null}
        actionRouteStates={{}}
        actionSubmitting={null}
        onRefresh={async () => undefined}
        onAction={async () => undefined}
        proposedActions={Object.values(streamState.session.proposedActions)}
        sidebarState={state}
        streamRefreshError={null}
        streamRefreshing={false}
        streamState={streamState}
      />
    );

    expect(html).toContain("Refresh backend action state before reviewing or applying this action.");
    expect(html).toMatch(/<button disabled="" type="button">Reject<\/button>/);
    expect(html).toMatch(/<button disabled="" type="button">Approve<\/button>/);
    expect(html).toMatch(/<button class="primary" disabled="" type="button">Apply<\/button>/);
  });

  it("freezes action controls after an accepted route until backend status refresh", () => {
    const state = createDogfoodSidebarState(CONNECTED_INPUT);
    const streamState = reduceSseFrame(
      createInitialSessionStreamClientState(),
      {
        id: "evt-proposed",
        data: JSON.stringify(
          createEnvelope("evt-proposed", 1, "action.proposed", {
            actionId: "action_waiting_status",
            actionType: "REPLACE_TEXT",
            summary: "Deterministic proposal waiting on backend status."
          })
        )
      }
    );
    const html = renderToStaticMarkup(
      <DogfoodSessionStatePanel
        actionResult={null}
        actionRouteStates={{ action_waiting_status: { pendingKind: null, acceptedKind: "approve" } }}
        actionSubmitting={null}
        onRefresh={async () => undefined}
        onAction={async () => undefined}
        proposedActions={Object.values(streamState.session.proposedActions)}
        sidebarState={state}
        streamRefreshError={null}
        streamRefreshing={false}
        streamState={streamState}
      />
    );

    expect(html).toContain("Waiting for backend status refresh before another action.");
    expect(html).toMatch(/<button disabled="" type="button">Reject<\/button>/);
    expect(html).toMatch(/<button disabled="" type="button">Approve<\/button>/);
    expect(html).toMatch(/<button class="primary" disabled="" type="button">Apply<\/button>/);
  });
});

function createEnvelope(eventId: string, sequence: number, type: string, payload: Record<string, unknown>): SessionEventEnvelope {
  return {
    eventId,
    sequence,
    requestId: "req_test_stream",
    correlationId: "corr_test_stream",
    tenantId: "tenant_test",
    userId: "user_test",
    sessionId: "session_test",
    type,
    payload,
    createdAt: "2026-07-05T00:00:00.000Z"
  };
}
