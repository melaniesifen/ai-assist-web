import { describe, expect, it } from "vitest";
import { CONTEXT_MODE_IDS } from "../src/context-modes";
import { PROPOSED_ACTION_STATUSES } from "../src/proposed-actions";
import {
  DEMO_REVIEW_FIXTURES,
  ASSISTANT_DEMO_SESSION_ID,
  OVERLAPPING_REVIEW_FIXTURES,
  applyReviewCard,
  approveAllReviewCards,
  approveReviewCard,
  closeAssistantShell,
  createApplyActionCommand,
  createAssistantShellState,
  createContentScriptBridgeViewModel,
  createInitialMockChatState,
  createMockApplyResponse,
  createMockApplyResponseWithResult,
  createMockApplyResult,
  createReviewCardsFromFixtures,
  createSafeClientLogEvent,
  getApproveAllState,
  getAssistantDemoContextModeOptions,
  mapReviewFixtureToCard,
  openAssistantShell,
  rejectReviewCard,
  reconcileReviewCardStatusEvent,
  resolveApplyResult,
  safeLogExcludesForbiddenContent,
  submitMockChatMessage,
  type BackendApplyResponseView,
  type ContractProposedActionReviewRef
} from "../src/assistant-demo";

async function loadGoogleDocsContractFixtures(): Promise<{
  proposedActionFixtures: readonly { name: string; validator: string; value: ContractProposedActionReviewRef }[];
  validateActionDecisionCommandPayload: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
  validateApplyActionCommandPayload: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
  validateHttpCommandResponse: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
  validateProposedActionReviewRef: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
  validateHttpCommandRequest: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
  applyActionCommandFixture: { value: { commandId: string; idempotencyKey: string } };
  applyActionResultResponseFixtures: readonly { name: string; value: BackendApplyResponseView }[];
  reconnectRequiredApplyResponseFixture: { value: BackendApplyResponseView };
}> {
  // @ts-expect-error - sibling contract fixtures are JavaScript-only until contracts publish generated TypeScript types.
  const fixtures = await import("../../ai-assist-contracts/fixtures/google-docs-vertical-slice.fixtures.js");
  // @ts-expect-error - sibling contract fixtures are JavaScript-only until contracts publish generated TypeScript types.
  const proposedActions = await import("../../ai-assist-contracts/fixtures/proposed-actions.fixtures.js");
  // @ts-expect-error - sibling contract validators are JavaScript-only until contracts publish generated TypeScript types.
  const actions = await import("../../ai-assist-contracts/src/actions.js");
  // @ts-expect-error - sibling contract validators are JavaScript-only until contracts publish generated TypeScript types.
  const commands = await import("../../ai-assist-contracts/src/commands.js");

  return {
    proposedActionFixtures: fixtures.proposedActionFixtures,
    applyActionCommandFixture: proposedActions.applyActionCommandFixture,
    applyActionResultResponseFixtures: proposedActions.applyActionResultResponseFixtures,
    reconnectRequiredApplyResponseFixture: proposedActions.reconnectRequiredApplyResponseFixture,
    validateProposedActionReviewRef: actions.validateProposedActionReviewRef,
    validateActionDecisionCommandPayload: commands.validateActionDecisionCommandPayload,
    validateApplyActionCommandPayload: commands.validateApplyActionCommandPayload,
    validateHttpCommandResponse: commands.validateHttpCommandResponse,
    validateHttpCommandRequest: commands.validateHttpCommandRequest
  };
}

describe("Assistant demo helpers", () => {
  it("maps real M1 contract fixtures into review-card view models", async () => {
    const { proposedActionFixtures, validateProposedActionReviewRef } = await loadGoogleDocsContractFixtures();
    const reviewFixtures = proposedActionFixtures.filter((fixture) => fixture.validator === "validateProposedActionReviewRef");

    expect(reviewFixtures.length).toBeGreaterThanOrEqual(5);
    for (const fixture of reviewFixtures) {
      expect(validateProposedActionReviewRef(fixture.value)).toMatchObject({ valid: true, issues: [] });
    }

    const proposed = reviewFixtures.find((fixture) => fixture.name === "action-review-proposed-diff-card");
    expect(proposed).toBeDefined();

    const card = mapReviewFixtureToCard(proposed!.value, "idem-fixture");

    expect(card.actionId).toBe("action_review_replace");
    expect(card.status).toBe("PROPOSED");
    expect(card.targetText).toBe("<fixture current text>");
    expect(card.replacementText).toBe("<fixture proposed text>");
    expect(card.surroundingContext).toBe("<fixture surrounding context>");
    expect(card.rationale).toBe("Clarify the selected sentence.");
    expect(card.idempotencyKey).toBe("idem-fixture");
    expect(card.targetRange).toEqual({ start: 42, end: 64 });
    expect(card.originalTextHash).toBe("sha256:google-docs-original");
  });

  it("keeps runtime demo fixtures compatible with the proposed-action review contract shape", async () => {
    const { validateProposedActionReviewRef } = await loadGoogleDocsContractFixtures();
    const card = mapReviewFixtureToCard(DEMO_REVIEW_FIXTURES[0], "idem-runtime");

    for (const fixture of DEMO_REVIEW_FIXTURES) {
      expect(validateProposedActionReviewRef(fixture)).toMatchObject({ valid: true, issues: [] });
    }
    expect(DEMO_REVIEW_FIXTURES[0].target.targetRange).toEqual({ start: 42, end: 64 });
    expect(card.targetRange).toEqual({ start: 42, end: 64 });
    expect(card.idempotencyKey).toBe("idem-runtime");
  });

  it("keeps valid anchor-targeted review refs approvable", async () => {
    const { validateProposedActionReviewRef } = await loadGoogleDocsContractFixtures();
    const anchoredFixture: ContractProposedActionReviewRef = {
      ...DEMO_REVIEW_FIXTURES[0],
      actionId: "action_review_anchor_target",
      target: {
        targetAnchor: {
          connector: "google_docs",
          anchorId: "anchor_review_demo",
          resourceRevision: "rev_google_docs"
        }
      }
    };

    const card = mapReviewFixtureToCard(anchoredFixture);

    expect(validateProposedActionReviewRef(anchoredFixture)).toMatchObject({ valid: true, issues: [] });
    expect(card.targetRange).toBeNull();
    expect(card.targetAnchor).toEqual({
      connector: "google_docs",
      anchorId: "anchor_review_demo",
      resourceRevision: "rev_google_docs"
    });
    expect(card.conflict).toBeNull();
    expect(card.canApprove).toBe(true);
    expect(card.canApply).toBe(false);
  });

  it("does not treat mixed target variants as connector-verified", async () => {
    const { validateProposedActionReviewRef } = await loadGoogleDocsContractFixtures();
    const mixedTargetFixture: ContractProposedActionReviewRef = {
      ...DEMO_REVIEW_FIXTURES[0],
      actionId: "action_review_mixed_target",
      target: {
        targetRange: { start: 42, end: 64 },
        targetAnchor: {
          connector: "google_docs",
          anchorId: "anchor_review_demo",
          resourceRevision: "rev_google_docs"
        }
      }
    };

    const card = mapReviewFixtureToCard(mixedTargetFixture);

    expect(validateProposedActionReviewRef(mixedTargetFixture).valid).toBe(false);
    expect(card.conflict?.reasonCode).toBe("UNVERIFIABLE_TARGET");
    expect(card.canApprove).toBe(false);
  });

  it("models side-panel availability from content-script bridge metadata", () => {
    const ready = createAssistantShellState(createContentScriptBridgeViewModel());
    const unsupported = createAssistantShellState(createContentScriptBridgeViewModel({ supportState: "UNSUPPORTED_PAGE" }));
    const closed = closeAssistantShell(ready);

    expect(ready).toMatchObject({ panelAvailable: true, panelOpen: true });
    expect(ready.bridge).toMatchObject({
      documentId: "gdoc_google_docs_demo",
      source: "GOOGLE_DOCS_CONTENT_SCRIPT"
    });
    expect(unsupported).toMatchObject({ panelAvailable: false, panelOpen: false });
    expect(openAssistantShell(closed)).toMatchObject({ panelAvailable: true, panelOpen: true });
  });

  it("defaults assistant demo to selection and active-resource MVP modes while disabling future modes", () => {
    const options = getAssistantDemoContextModeOptions();

    expect(options.find((option) => option.mode === CONTEXT_MODE_IDS.SELECTION)?.enabled).toBe(true);
    expect(options.find((option) => option.mode === CONTEXT_MODE_IDS.ACTIVE_RESOURCE)?.enabled).toBe(true);
    expect(options.find((option) => option.mode === CONTEXT_MODE_IDS.VISIBLE_REGION)?.enabled).toBe(false);
    expect(options.find((option) => option.mode === CONTEXT_MODE_IDS.WORKSPACE)?.enabled).toBe(false);
    expect(options.find((option) => option.mode === CONTEXT_MODE_IDS.SCREEN)?.enabled).toBe(false);
  });

  it("creates visible models for review-card states", () => {
    const cards = createReviewCardsFromFixtures(DEMO_REVIEW_FIXTURES);
    const extraStatuses = [
      PROPOSED_ACTION_STATUSES.REJECTED,
      PROPOSED_ACTION_STATUSES.APPLIED,
      PROPOSED_ACTION_STATUSES.FAILED,
      PROPOSED_ACTION_STATUSES.EXPIRED
    ].map((status) =>
      mapReviewFixtureToCard({
        ...DEMO_REVIEW_FIXTURES[0],
        actionId: `action_review_${status.toLowerCase()}`,
        status
      })
    );

    expect(cards.map((card) => card.status)).toContain(PROPOSED_ACTION_STATUSES.PROPOSED);
    expect(cards.map((card) => card.status)).toContain(PROPOSED_ACTION_STATUSES.APPROVED);
    expect(cards.map((card) => card.status)).toContain(PROPOSED_ACTION_STATUSES.CONFLICTED);
    expect(cards.find((card) => card.status === PROPOSED_ACTION_STATUSES.CONFLICTED)?.statusLabel).toBe("Conflict");
    expect(extraStatuses.map((card) => card.statusLabel)).toEqual(["Rejected", "Applied", "Failed", "Expired"]);
  });

  it("supports approve, reject, and backend-shaped apply request commands without self-applying", async () => {
    const {
      proposedActionFixtures,
      validateActionDecisionCommandPayload,
      validateApplyActionCommandPayload,
      validateHttpCommandRequest
    } = await loadGoogleDocsContractFixtures();
    const contractApply = proposedActionFixtures.find((fixture) => fixture.name === "action-command-apply-idempotent");
    const proposed = mapReviewFixtureToCard(DEMO_REVIEW_FIXTURES[0]);
    const approved = approveReviewCard(proposed);
    const rejected = rejectReviewCard(proposed);
    const applyRequested = applyReviewCard(approved);

    expect(contractApply).toBeDefined();
    expect(validateHttpCommandRequest(contractApply!.value)).toMatchObject({ valid: true, issues: [] });
    expect(approved.status).toBe("APPROVED");
    expect(approved.lastCommand).toMatchObject({
      commandType: "actions.approve",
      payload: { sessionId: ASSISTANT_DEMO_SESSION_ID, actionId: proposed.actionId, reasonCode: "USER_APPROVED" }
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.lastCommand).toMatchObject({
      commandType: "actions.reject",
      payload: { sessionId: ASSISTANT_DEMO_SESSION_ID, actionId: proposed.actionId, reasonCode: "USER_REJECTED" }
    });
    expect(applyRequested.status).toBe("APPROVED");
    expect(applyRequested.pendingApplyCommand).toEqual(createApplyActionCommand(proposed.actionId, proposed.idempotencyKey));
    expect(applyRequested.lastCommand?.idempotencyKey).toBe(`idem_apply_${proposed.actionId}`);
    expect(validateHttpCommandRequest(approved.lastCommand)).toMatchObject({ valid: true, issues: [] });
    expect(validateActionDecisionCommandPayload(approved.lastCommand?.payload)).toMatchObject({ valid: true, issues: [] });
    expect(validateHttpCommandRequest(rejected.lastCommand)).toMatchObject({ valid: true, issues: [] });
    expect(validateActionDecisionCommandPayload(rejected.lastCommand?.payload)).toMatchObject({ valid: true, issues: [] });
    expect(validateHttpCommandRequest(applyRequested.pendingApplyCommand)).toMatchObject({ valid: true, issues: [] });
    expect(validateApplyActionCommandPayload(applyRequested.pendingApplyCommand?.payload)).toMatchObject({ valid: true, issues: [] });
  });

  it("transitions to terminal apply states only from mocked backend-shaped results", () => {
    const requested = applyReviewCard(approveReviewCard(mapReviewFixtureToCard(DEMO_REVIEW_FIXTURES[0])));
    const approvedWithoutRequest = approveReviewCard(mapReviewFixtureToCard(DEMO_REVIEW_FIXTURES[1]));
    const applied = resolveApplyResult(requested, createMockApplyResult(requested, PROPOSED_ACTION_STATUSES.APPLIED));
    const failed = resolveApplyResult(requested, createMockApplyResult(requested, PROPOSED_ACTION_STATUSES.FAILED));
    const conflicted = resolveApplyResult(
      requested,
      createMockApplyResult(requested, PROPOSED_ACTION_STATUSES.CONFLICTED, "APPLY_TARGET_CONFLICTED")
    );

    expect(applied).toMatchObject({ status: "APPLIED", canApply: false, pendingApplyCommand: null });
    expect(failed).toMatchObject({ status: "FAILED", canApply: false, pendingApplyCommand: null });
    expect(conflicted).toMatchObject({ status: "CONFLICTED", canApply: false, pendingApplyCommand: null });
    expect(conflicted.conflict?.message).toContain("No document mutation occurred.");
    expect(() => createMockApplyResult(approvedWithoutRequest)).toThrow("pending apply request");
    expect(resolveApplyResult(approvedWithoutRequest, createMockApplyResult(requested))).toMatchObject({
      status: "APPROVED",
      duplicateNotice: "Apply result ignored because no apply request is pending."
    });
  });

  it("renders backend apply responses for duplicate replay, expired, denied, reconnect-required, and safe errors", () => {
    const createRequestedCard = () => applyReviewCard(approveReviewCard(mapReviewFixtureToCard(DEMO_REVIEW_FIXTURES[0])));
    const resolveWithResult = (overrides: Parameters<typeof createMockApplyResponseWithResult>[1]) => {
      const requested = createRequestedCard();
      return resolveApplyResult(requested, createMockApplyResponseWithResult(requested, overrides));
    };
    const resolveWithError = (error: NonNullable<ReturnType<typeof createMockApplyResponse>["error"]>) => {
      const requested = createRequestedCard();
      return resolveApplyResult(
        requested,
        createMockApplyResponse(requested, {
          status: "rejected",
          result: undefined,
          error
        })
      );
    };
    const duplicate = resolveWithResult({
      replayed: true,
      status: "APPLIED"
    });
    const expired = resolveWithResult({
      status: "EXPIRED",
      failureCode: "ACTION_EXPIRED"
    });
    const denied = resolveWithError({ category: "AUTHORIZATION", code: "AUTHORIZATION_DENIED", retryable: false });
    const reconnect = resolveWithError({ category: "OAUTH", code: "OAUTH_RECONNECT_REQUIRED", retryable: false });
    const safeError = resolveWithError({ category: "DEPENDENCY", code: "CONNECTOR_UNAVAILABLE", retryable: true });

    expect(duplicate.applyDisplay).toMatchObject({
      kind: "DUPLICATE_REPLAY",
      title: "Duplicate replay"
    });
    expect(duplicate.applyDisplay?.message).toContain("No duplicate document mutation occurred.");
    expect(expired).toMatchObject({ status: "EXPIRED", statusLabel: "Expired" });
    expect(expired.applyDisplay).toMatchObject({ title: "Expired", code: "ACTION_EXPIRED" });
    expect(denied).toMatchObject({ statusLabel: "Denied", canReject: false, canApply: false, pendingApplyCommand: null });
    expect(denied.applyDisplay).toMatchObject({ kind: "SAFE_ERROR", title: "Denied", code: "AUTHORIZATION_DENIED" });
    expect(reconnect).toMatchObject({ statusLabel: "Reconnect required", canReject: false, canApply: false, pendingApplyCommand: null });
    expect(reconnect.applyDisplay).toMatchObject({ kind: "SAFE_ERROR", title: "Reconnect required", code: "OAUTH_RECONNECT_REQUIRED" });
    expect(safeError.applyDisplay).toMatchObject({ kind: "SAFE_ERROR", title: "Safe error", code: "CONNECTOR_UNAVAILABLE", retryable: true });
    expect(JSON.stringify([denied, reconnect, safeError])).not.toMatch(/oauth token|authorization header|raw document|selected text|action payload/i);
  });

  it("reconciles real contract-shaped apply HTTP response fixtures", async () => {
    const {
      applyActionCommandFixture,
      applyActionResultResponseFixtures,
      reconnectRequiredApplyResponseFixture,
      validateHttpCommandResponse
    } = await loadGoogleDocsContractFixtures();
    const createContractPendingCard = (response: { commandId: string; result?: { actionId?: string; idempotencyKey?: string } }) => {
      const actionId = response.result?.actionId ?? "action_proposed_action_demo";
      const idempotencyKey = response.result?.idempotencyKey ?? applyActionCommandFixture.value.idempotencyKey;
      const approved = approveReviewCard(
        mapReviewFixtureToCard(
          {
            ...DEMO_REVIEW_FIXTURES[0],
            actionId,
            resourceRef: {
              ...DEMO_REVIEW_FIXTURES[0].resourceRef,
              resourceId: "gdoc_proposed_action_demo"
            }
          },
          idempotencyKey
        )
      );
      const requested = applyReviewCard(approved);
      const pendingApplyCommand = {
        ...requested.pendingApplyCommand!,
        commandId: response.commandId
      };

      return {
        ...requested,
        pendingApplyCommand,
        lastCommand: pendingApplyCommand
      };
    };
    const byName = new Map(applyActionResultResponseFixtures.map((fixture) => [fixture.name, fixture.value]));
    const appliedResponse = byName.get("action-apply-result-applied")!;
    const replayResponse = byName.get("action-apply-result-duplicate-replay")!;
    const conflictedResponse = byName.get("action-apply-result-conflict-no-mutation")!;
    const failedResponse = byName.get("action-apply-result-failed")!;

    for (const response of [appliedResponse, replayResponse, conflictedResponse, failedResponse, reconnectRequiredApplyResponseFixture.value]) {
      expect(validateHttpCommandResponse(response)).toMatchObject({ valid: true, issues: [] });
    }

    expect(resolveApplyResult(createContractPendingCard(appliedResponse), appliedResponse).applyDisplay).toMatchObject({
      title: "Applied"
    });
    expect(resolveApplyResult(createContractPendingCard(replayResponse), replayResponse).applyDisplay).toMatchObject({
      kind: "DUPLICATE_REPLAY",
      title: "Duplicate replay"
    });
    expect(resolveApplyResult(createContractPendingCard(conflictedResponse), conflictedResponse)).toMatchObject({
      status: "CONFLICTED",
      canApply: false
    });
    expect(resolveApplyResult(createContractPendingCard(failedResponse), failedResponse).applyDisplay).toMatchObject({
      title: "Failed",
      code: "CONNECTOR_OPERATION_FAILED"
    });
    expect(
      resolveApplyResult(createContractPendingCard(reconnectRequiredApplyResponseFixture.value), reconnectRequiredApplyResponseFixture.value)
    ).toMatchObject({
      statusLabel: "Reconnect required",
      canReject: false,
      canApply: false,
      applyDisplay: { title: "Reconnect required", code: "OAUTH_RECONNECT_REQUIRED" }
    });
  });

  it("reconciles action.status_changed events into review cards", () => {
    const approved = approveReviewCard(mapReviewFixtureToCard(DEMO_REVIEW_FIXTURES[0]));
    const applied = reconcileReviewCardStatusEvent(approved, {
      type: "action.status_changed",
      eventId: "evt-action-applied",
      createdAt: "2026-06-07T12:00:00.000Z",
      payload: {
        actionId: approved.actionId,
        previousStatus: "APPROVED",
        status: "APPLIED",
        reasonCode: "APPLY_SUCCEEDED"
      }
    });
    const conflicted = reconcileReviewCardStatusEvent(approved, {
      type: "action.status_changed",
      payload: {
        actionId: approved.actionId,
        previousStatus: "APPROVED",
        status: "CONFLICTED",
        reasonCode: "APPLY_TARGET_CONFLICTED"
      }
    });
    const unrelated = reconcileReviewCardStatusEvent(approved, {
      type: "action.status_changed",
      payload: {
        actionId: "other-action",
        status: "FAILED"
      }
    });
    const denied = reconcileReviewCardStatusEvent(approved, {
      type: "action.status_changed",
      payload: {
        actionId: approved.actionId,
        previousStatus: "APPROVED",
        status: "FAILED",
        reasonCode: "AUTHORIZATION_DENIED"
      }
    });
    const reconnect = reconcileReviewCardStatusEvent(approved, {
      type: "action.status_changed",
      payload: {
        actionId: approved.actionId,
        previousStatus: "APPROVED",
        status: "FAILED",
        reasonCode: "OAUTH_RECONNECT_REQUIRED"
      }
    });

    expect(applied).toMatchObject({ status: "APPLIED", canApply: false });
    expect(applied.applyDisplay).toMatchObject({ title: "Applied", code: "APPLY_SUCCEEDED" });
    expect(conflicted).toMatchObject({ status: "CONFLICTED", canApply: false });
    expect(conflicted.conflict?.message).toContain("No document mutation occurred.");
    expect(denied).toMatchObject({ status: "FAILED", canApply: false, applyDisplay: { title: "Denied", code: "AUTHORIZATION_DENIED" } });
    expect(reconnect).toMatchObject({
      status: "FAILED",
      canApply: false,
      applyDisplay: { title: "Reconnect required", code: "OAUTH_RECONNECT_REQUIRED" }
    });
    expect(unrelated).toBe(approved);
  });

  it("handles duplicate approval, rejection, and apply attempts deterministically", () => {
    const proposed = mapReviewFixtureToCard(DEMO_REVIEW_FIXTURES[0]);
    const approved = approveReviewCard(proposed);
    const rejected = rejectReviewCard(proposed);
    const applyRequested = applyReviewCard(approved);

    expect(approveReviewCard(approved).duplicateNotice).toBe("Approve already recorded.");
    expect(rejectReviewCard(rejected).duplicateNotice).toBe("Reject already recorded.");
    expect(applyReviewCard(applyRequested).duplicateNotice).toBe("Apply request already queued with the same idempotency key.");
  });

  it("enables approve-all for safe non-overlapping proposed cards while leaving visible conflicts untouched", () => {
    const cards = createReviewCardsFromFixtures(DEMO_REVIEW_FIXTURES);

    expect(getApproveAllState(cards)).toEqual({ enabled: true, reason: null });
    expect(approveAllReviewCards(cards).map((card) => card.status)).toEqual([
      "APPROVED",
      "APPROVED",
      "APPROVED",
      "CONFLICTED",
      "CONFLICTED",
      "CONFLICTED"
    ]);
  });

  it("disables approve-all for overlapping proposed targets and renders stale, ambiguous, or unverifiable conflicts", () => {
    const conflicted = createReviewCardsFromFixtures(DEMO_REVIEW_FIXTURES);
    const overlapping = createReviewCardsFromFixtures(OVERLAPPING_REVIEW_FIXTURES);

    expect(conflicted.find((card) => card.conflict?.kind === "STALE")?.conflict?.message).toContain("No document mutation occurred.");
    expect(conflicted.find((card) => card.conflict?.kind === "AMBIGUOUS")?.conflict?.message).toContain("No document mutation occurred.");
    expect(conflicted.find((card) => card.conflict?.kind === "UNVERIFIABLE")?.conflict?.message).toContain("No document mutation occurred.");
    expect(getApproveAllState(overlapping).enabled).toBe(false);
    expect(overlapping.every((card) => card.conflict?.kind === "OVERLAPPING")).toBe(true);
  });

  it("models mocked chat submit, progress, response, and cleared hidden state", () => {
    const initial = createInitialMockChatState();
    const submitted = submitMockChatMessage(initial, "  improve this text  ");

    expect(submitted.messages).toHaveLength(2);
    expect(submitted.messages[0]).toMatchObject({ role: "user", content: "improve this text", status: "SENT" });
    expect(submitted.messages[1]).toMatchObject({ role: "assistant", status: "FINAL" });
    expect(submitted.progress).toBe("Mocked assistant response ready.");
    expect(submitMockChatMessage(submitted, "   ")).toBe(submitted);
    expect(createInitialMockChatState()).toMatchObject({ messages: [], progress: null, isSubmitting: false });
  });

  it("redacts forbidden client log fields and preserves metadata-only fields", () => {
    const event = createSafeClientLogEvent("assistant.chat.submit", {
      prompt: "raw prompt",
      documentText: "raw document",
      message: "raw selected text under a generic key",
      preview: "raw preview",
      ocrText: "raw OCR text",
      actionPayload: { proposedText: "secret" },
      provider: "openai",
      actionId: "action_review_replace",
      durationMs: 12
    });

    expect(event.metadata).toEqual({
      prompt: "[redacted]",
      documentText: "[redacted]",
      message: "[redacted]",
      preview: "[redacted]",
      ocrText: "[redacted]",
      actionPayload: "[redacted]",
      provider: "openai",
      actionId: "action_review_replace",
      durationMs: 12
    });
    expect(safeLogExcludesForbiddenContent(event)).toBe(true);
    expect(JSON.stringify(event)).not.toContain("raw prompt");
    expect(JSON.stringify(event)).not.toContain("raw document");
    expect(event.eventName).not.toMatch(/m\d/i);
  });
});
