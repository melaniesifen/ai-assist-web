import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDogfoodSidebarState, type DogfoodSidebarContractInput } from "../src/dogfood-sidebar-state";
import {
  App,
  createDogfoodSidebarInputFromSearch,
  DogfoodAssistantSurface,
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

    expect(html).toContain("Assistant for this document");
    expect(html).toContain("Product login");
    expect(html).toContain("Signed in");
    expect(html).toContain("Google");
    expect(html).toContain("Connected");
    expect(html).toContain("doc_connected_123");
    expect(html).toContain("Provider");
    expect(html).toContain("Ready for a read-only command");
    expect(html).toContain("Summarize this doc");
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
    expect(html).toContain("Blocked");
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
});
