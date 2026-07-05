import { describe, expect, it } from "vitest";
import {
  createDogfoodSidebarState,
  safeDogfoodSidebarLogExcludesForbiddenContent,
  type DogfoodSidebarBlockerCode,
  type DogfoodSidebarContractInput
} from "../src/dogfood-sidebar-state";

const READY_INPUT: DogfoodSidebarContractInput = {
  productAuth: "signed_in",
  googleOAuth: "connected",
  activeDocument: {
    status: "detected",
    documentId: "doc_ready_123"
  },
  context: "ready",
  provider: "ready",
  command: "ready",
  stream: "open",
  proposedActions: "ready",
  apply: "ready",
  controlledDocumentWriteApproved: true
};

describe("dogfood sidebar state contract", () => {
  it("derives the real assistant as the default ready surface", () => {
    const state = createDogfoodSidebarState(READY_INPUT);

    expect(state.defaultSurface).toBe("assistant");
    expect(state.activeDocumentId).toBe("doc_ready_123");
    expect(state.canSubmitCommand).toBe(true);
    expect(state.canOpenStream).toBe(true);
    expect(state.canReviewProposedActions).toBe(true);
    expect(state.canApplyApprovedAction).toBe(true);
    expect(state.commandReadiness).toBe("ready");
    expect(state.streamReadiness).toBe("available");
    expect(state.applyReadiness).toBe("ready");
    expect(state.blockers).toEqual([]);
  });

  it("blocks command submission until auth, Google, document, context, and provider readiness are satisfied", () => {
    const state = createDogfoodSidebarState({
      ...READY_INPUT,
      productAuth: "signed_out",
      googleOAuth: "not_connected",
      activeDocument: {
        status: "missing_document_id"
      },
      context: "consent_required",
      provider: "missing"
    });

    expect(state.canSubmitCommand).toBe(false);
    expect(state.commandReadiness).toBe("blocked");
    expect(state.blockers.map((blocker) => blocker.code)).toEqual([
      "PRODUCT_AUTH_REQUIRED",
      "GOOGLE_OAUTH_REQUIRED",
      "ACTIVE_DOCUMENT_REQUIRED",
      "CONTEXT_CONSENT_REQUIRED",
      "PROVIDER_REQUIRED"
    ]);
  });

  it.each([
    ["product auth is unknown", { productAuth: "unknown" }],
    ["product auth is signing in", { productAuth: "signing_in" }],
    ["product auth errored", { productAuth: "error" }],
    ["product auth expired", { productAuth: "expired" }],
    ["Google OAuth is unknown", { googleOAuth: "unknown" }],
    ["Google OAuth is connecting", { googleOAuth: "connecting" }],
    ["Google OAuth needs reconnect", { googleOAuth: "reconnect_required" }],
    ["Google OAuth is denied", { googleOAuth: "access_denied" }],
    ["page is unsupported", { activeDocument: { status: "unsupported_page" } }],
    ["document ID is missing", { activeDocument: { status: "detected", documentId: null } }],
    ["document ID is blank", { activeDocument: { status: "detected", documentId: "   " } }],
    ["context is idle", { context: "idle" }],
    ["context is loading", { context: "loading" }],
    ["context needs consent", { context: "consent_required" }],
    ["context permission is denied", { context: "permission_denied" }],
    ["provider is unknown", { provider: "unknown" }],
    ["provider is rate limited", { provider: "rate_limited" }],
    ["command is submitting", { command: "submitting" }],
    ["command is blocked", { command: "blocked" }],
    ["command failed", { command: "failed" }]
  ] satisfies Array<[string, Partial<DogfoodSidebarContractInput>]>)("blocks command submission when %s", (_label, patch) => {
    const state = createDogfoodSidebarState({
      ...READY_INPUT,
      ...patch
    });

    expect(state.canSubmitCommand).toBe(false);
    expect(state.commandReadiness).not.toBe("ready");
  });

  it("requires durable refresh before apply when the stream has a reconnect gap", () => {
    const state = createDogfoodSidebarState({
      ...READY_INPUT,
      stream: "reconnect_required"
    });

    expect(state.streamReadiness).toBe("refresh_required");
    expect(state.canSubmitCommand).toBe(true);
    expect(state.canApplyApprovedAction).toBe(false);
    expect(state.blockers.map((blocker) => blocker.code)).toContain("STREAM_REFRESH_REQUIRED");
  });

  it.each([
    ["product auth is signed out", { productAuth: "signed_out" }],
    ["Google OAuth is not connected", { googleOAuth: "not_connected" }],
    ["active document ID is missing", { activeDocument: { status: "missing_document_id" } }],
    ["context is unavailable", { context: "unavailable" }],
    ["provider is unavailable", { provider: "unavailable" }],
    ["command is blocked", { command: "blocked" }]
  ] satisfies Array<[string, Partial<DogfoodSidebarContractInput>]>)(
    "blocks proposed-action review and apply when %s",
    (_label, patch) => {
      const state = createDogfoodSidebarState({
        ...READY_INPUT,
        ...patch
      });

      expect(state.canReviewProposedActions).toBe(false);
      expect(state.canApplyApprovedAction).toBe(false);
    }
  );

  it("does not enable apply while signed out even if proposed action and apply state look ready", () => {
    const state = createDogfoodSidebarState({
      ...READY_INPUT,
      productAuth: "signed_out",
      googleOAuth: "not_connected",
      activeDocument: {
        status: "missing_document_id"
      },
      command: "accepted"
    });

    expect(state.canReviewProposedActions).toBe(false);
    expect(state.canApplyApprovedAction).toBe(false);
  });

  it("separates proposed-action review from controlled-document apply approval", () => {
    const state = createDogfoodSidebarState({
      ...READY_INPUT,
      controlledDocumentWriteApproved: false
    });

    expect(state.canReviewProposedActions).toBe(true);
    expect(state.canApplyApprovedAction).toBe(false);
    expect(state.blockers.map((blocker) => blocker.code)).toContain("APPLY_WRITE_APPROVAL_REQUIRED");
  });

  it("marks uncertain mutation state as not retryable from the client", () => {
    const state = createDogfoodSidebarState({
      ...READY_INPUT,
      apply: "uncertain"
    });

    expect(state.applyReadiness).toBe("uncertain");
    expect(state.canApplyApprovedAction).toBe(false);
    expect(state.blockers).toContainEqual({
      area: "apply",
      code: "APPLY_UNCERTAIN",
      message: "Mutation state is uncertain. Refresh before retrying.",
      retryable: false
    });
  });

  it("keeps harness and mock demo surfaces out of the dogfood default", () => {
    const disposition = createDogfoodSidebarState(READY_INPUT).devHarnessDisposition;

    expect(disposition).toContainEqual({
      id: "mock-chat-review-demo",
      disposition: "remove_from_dogfood_build",
      reason: "Mocked chat and proposed edits must not appear as product state unless explicitly labeled in tests."
    });
    expect(disposition.filter((entry) => entry.disposition === "hide_behind_dev_affordance").map((entry) => entry.id)).toEqual([
      "setup-harness",
      "context-readiness-harness",
      "real-flow-harness",
      "session-stream-harness"
    ]);
  });

  it("keeps sidebar state logs metadata-only", () => {
    const state = createDogfoodSidebarState(READY_INPUT);

    expect(safeDogfoodSidebarLogExcludesForbiddenContent(state.safeLogEvent)).toBe(true);
    expect(JSON.stringify(state.safeLogEvent)).not.toMatch(/doc_ready_123|prompt|document text|model output|oauth token|provider key/i);
  });

  it("emits every documented blocker code from at least one scenario", () => {
    const scenarios: DogfoodSidebarContractInput[] = [
      {
        ...READY_INPUT,
        productAuth: "expired",
        googleOAuth: "reconnect_required",
        activeDocument: {
          status: "unsupported_page"
        },
        context: "permission_denied",
        provider: "unavailable",
        command: "submitting",
        stream: "reconnect_required",
        proposedActions: "blocked",
        apply: "blocked",
        controlledDocumentWriteApproved: false
      },
      {
        ...READY_INPUT,
        productAuth: "signed_out",
        googleOAuth: "not_connected",
        activeDocument: {
          status: "missing_document_id"
        },
        context: "consent_required",
        provider: "missing",
        command: "failed",
        proposedActions: "error",
        apply: "uncertain"
      },
      {
        ...READY_INPUT,
        productAuth: "error",
        googleOAuth: "access_denied",
        activeDocument: {
          status: "detected",
          documentId: ""
        },
        context: "unavailable",
        provider: "rate_limited",
        command: "blocked",
        apply: "conflicted"
      }
    ];
    const emittedCodes = new Set<DogfoodSidebarBlockerCode>(
      scenarios.flatMap((scenario) => createDogfoodSidebarState(scenario).blockers.map((blocker) => blocker.code))
    );

    expect([...emittedCodes].sort()).toEqual(
      [
        "ACTIVE_DOCUMENT_REQUIRED",
        "APPLY_BACKEND_NOT_READY",
        "APPLY_UNCERTAIN",
        "APPLY_WRITE_APPROVAL_REQUIRED",
        "COMMAND_FAILED",
        "COMMAND_IN_FLIGHT",
        "CONTEXT_CONSENT_REQUIRED",
        "CONTEXT_PERMISSION_DENIED",
        "CONTEXT_UNAVAILABLE",
        "GOOGLE_OAUTH_BLOCKED",
        "GOOGLE_OAUTH_RECONNECT_REQUIRED",
        "GOOGLE_OAUTH_REQUIRED",
        "PRODUCT_AUTH_EXPIRED",
        "PRODUCT_AUTH_REQUIRED",
        "PROPOSED_ACTIONS_UNAVAILABLE",
        "PROVIDER_REQUIRED",
        "PROVIDER_UNAVAILABLE",
        "STREAM_REFRESH_REQUIRED",
        "UNSUPPORTED_PAGE"
      ].sort()
    );
  });
});
