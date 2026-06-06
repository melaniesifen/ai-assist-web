import { describe, expect, it } from "vitest";
import { CONTEXT_MODE_IDS } from "../src/context-modes";
import { PROPOSED_ACTION_STATUSES } from "../src/proposed-actions";
import {
  DEMO_REVIEW_FIXTURES,
  M2_SESSION_ID,
  OVERLAPPING_REVIEW_FIXTURES,
  applyReviewCard,
  approveAllReviewCards,
  approveReviewCard,
  closeAssistantShell,
  createApplyActionCommand,
  createAssistantShellState,
  createContentScriptBridgeViewModel,
  createInitialMockChatState,
  createMockApplyResult,
  createReviewCardsFromFixtures,
  createSafeClientLogEvent,
  getApproveAllState,
  getM2ContextModeOptions,
  mapM1ReviewFixtureToCard,
  openAssistantShell,
  rejectReviewCard,
  resolveApplyResult,
  safeLogExcludesForbiddenContent,
  submitMockChatMessage,
  type ContractProposedActionReviewRef
} from "../src/m2-assistant-demo";

async function loadM1ContractFixtures(): Promise<{
  proposedActionFixtures: readonly { name: string; validator: string; value: ContractProposedActionReviewRef }[];
  validateActionDecisionCommandPayload: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
  validateApplyActionCommandPayload: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
  validateProposedActionReviewRef: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
  validateHttpCommandRequest: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
}> {
  // @ts-expect-error - sibling contract fixtures are JavaScript-only until contracts publish generated TypeScript types.
  const fixtures = await import("../../ai-assist-contracts/fixtures/m1-google-docs-vertical-slice.fixtures.js");
  // @ts-expect-error - sibling contract validators are JavaScript-only until contracts publish generated TypeScript types.
  const actions = await import("../../ai-assist-contracts/src/actions.js");
  // @ts-expect-error - sibling contract validators are JavaScript-only until contracts publish generated TypeScript types.
  const commands = await import("../../ai-assist-contracts/src/commands.js");

  return {
    proposedActionFixtures: fixtures.proposedActionFixtures,
    validateProposedActionReviewRef: actions.validateProposedActionReviewRef,
    validateActionDecisionCommandPayload: commands.validateActionDecisionCommandPayload,
    validateApplyActionCommandPayload: commands.validateApplyActionCommandPayload,
    validateHttpCommandRequest: commands.validateHttpCommandRequest
  };
}

describe("M2 assistant demo helpers", () => {
  it("maps real M1 contract fixtures into review-card view models", async () => {
    const { proposedActionFixtures, validateProposedActionReviewRef } = await loadM1ContractFixtures();
    const reviewFixtures = proposedActionFixtures.filter((fixture) => fixture.validator === "validateProposedActionReviewRef");

    expect(reviewFixtures.length).toBeGreaterThanOrEqual(5);
    for (const fixture of reviewFixtures) {
      expect(validateProposedActionReviewRef(fixture.value)).toMatchObject({ valid: true, issues: [] });
    }

    const proposed = reviewFixtures.find((fixture) => fixture.name === "action-review-proposed-diff-card");
    expect(proposed).toBeDefined();

    const card = mapM1ReviewFixtureToCard(proposed!.value, "idem-fixture");

    expect(card.actionId).toBe("action_m1_review");
    expect(card.status).toBe("PROPOSED");
    expect(card.targetText).toBe("<fixture current text>");
    expect(card.replacementText).toBe("<fixture proposed text>");
    expect(card.surroundingContext).toBe("<fixture surrounding context>");
    expect(card.rationale).toBe("Clarify the selected sentence.");
    expect(card.idempotencyKey).toBe("idem-fixture");
    expect(card.targetRange).toEqual({ start: 42, end: 64 });
    expect(card.originalTextHash).toBe("sha256:m1-original");
  });

  it("keeps runtime demo fixtures compatible with the proposed-action review contract shape", async () => {
    const { validateProposedActionReviewRef } = await loadM1ContractFixtures();
    const card = mapM1ReviewFixtureToCard(DEMO_REVIEW_FIXTURES[0], "idem-runtime");

    for (const fixture of DEMO_REVIEW_FIXTURES) {
      expect(validateProposedActionReviewRef(fixture)).toMatchObject({ valid: true, issues: [] });
    }
    expect(DEMO_REVIEW_FIXTURES[0].target.targetRange).toEqual({ start: 42, end: 64 });
    expect(card.targetRange).toEqual({ start: 42, end: 64 });
    expect(card.idempotencyKey).toBe("idem-runtime");
  });

  it("keeps valid anchor-targeted review refs approvable", async () => {
    const { validateProposedActionReviewRef } = await loadM1ContractFixtures();
    const anchoredFixture: ContractProposedActionReviewRef = {
      ...DEMO_REVIEW_FIXTURES[0],
      actionId: "action_m2_anchor_target",
      target: {
        targetAnchor: {
          connector: "google_docs",
          anchorId: "anchor_m2_demo",
          resourceRevision: "rev_m1"
        }
      }
    };

    const card = mapM1ReviewFixtureToCard(anchoredFixture);

    expect(validateProposedActionReviewRef(anchoredFixture)).toMatchObject({ valid: true, issues: [] });
    expect(card.targetRange).toBeNull();
    expect(card.targetAnchor).toEqual({
      connector: "google_docs",
      anchorId: "anchor_m2_demo",
      resourceRevision: "rev_m1"
    });
    expect(card.conflict).toBeNull();
    expect(card.canApprove).toBe(true);
    expect(card.canApply).toBe(false);
  });

  it("does not treat mixed target variants as connector-verified", async () => {
    const { validateProposedActionReviewRef } = await loadM1ContractFixtures();
    const mixedTargetFixture: ContractProposedActionReviewRef = {
      ...DEMO_REVIEW_FIXTURES[0],
      actionId: "action_m2_mixed_target",
      target: {
        targetRange: { start: 42, end: 64 },
        targetAnchor: {
          connector: "google_docs",
          anchorId: "anchor_m2_demo",
          resourceRevision: "rev_m1"
        }
      }
    };

    const card = mapM1ReviewFixtureToCard(mixedTargetFixture);

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
      documentId: "gdoc_m1_demo",
      source: "GOOGLE_DOCS_CONTENT_SCRIPT"
    });
    expect(unsupported).toMatchObject({ panelAvailable: false, panelOpen: false });
    expect(openAssistantShell(closed)).toMatchObject({ panelAvailable: true, panelOpen: true });
  });

  it("defaults M2 to selection and active-resource MVP modes while disabling future modes", () => {
    const options = getM2ContextModeOptions();

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
      mapM1ReviewFixtureToCard({
        ...DEMO_REVIEW_FIXTURES[0],
        actionId: `action_m2_${status.toLowerCase()}`,
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
    } = await loadM1ContractFixtures();
    const contractApply = proposedActionFixtures.find((fixture) => fixture.name === "action-command-apply-idempotent");
    const proposed = mapM1ReviewFixtureToCard(DEMO_REVIEW_FIXTURES[0]);
    const approved = approveReviewCard(proposed);
    const rejected = rejectReviewCard(proposed);
    const applyRequested = applyReviewCard(approved);

    expect(contractApply).toBeDefined();
    expect(validateHttpCommandRequest(contractApply!.value)).toMatchObject({ valid: true, issues: [] });
    expect(approved.status).toBe("APPROVED");
    expect(approved.lastCommand).toMatchObject({
      commandType: "actions.approve",
      payload: { sessionId: M2_SESSION_ID, actionId: proposed.actionId, reasonCode: "USER_APPROVED" }
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.lastCommand).toMatchObject({
      commandType: "actions.reject",
      payload: { sessionId: M2_SESSION_ID, actionId: proposed.actionId, reasonCode: "USER_REJECTED" }
    });
    expect(applyRequested.status).toBe("APPROVED");
    expect(applyRequested.pendingApplyCommand).toEqual(createApplyActionCommand(proposed.actionId, proposed.idempotencyKey));
    expect(applyRequested.lastCommand?.idempotencyKey).toBe(`idem_m2_apply_${proposed.actionId}`);
    expect(validateHttpCommandRequest(approved.lastCommand)).toMatchObject({ valid: true, issues: [] });
    expect(validateActionDecisionCommandPayload(approved.lastCommand?.payload)).toMatchObject({ valid: true, issues: [] });
    expect(validateHttpCommandRequest(rejected.lastCommand)).toMatchObject({ valid: true, issues: [] });
    expect(validateActionDecisionCommandPayload(rejected.lastCommand?.payload)).toMatchObject({ valid: true, issues: [] });
    expect(validateHttpCommandRequest(applyRequested.pendingApplyCommand)).toMatchObject({ valid: true, issues: [] });
    expect(validateApplyActionCommandPayload(applyRequested.pendingApplyCommand?.payload)).toMatchObject({ valid: true, issues: [] });
  });

  it("transitions to terminal apply states only from mocked backend-shaped results", () => {
    const requested = applyReviewCard(approveReviewCard(mapM1ReviewFixtureToCard(DEMO_REVIEW_FIXTURES[0])));
    const approvedWithoutRequest = approveReviewCard(mapM1ReviewFixtureToCard(DEMO_REVIEW_FIXTURES[1]));
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

  it("handles duplicate approval, rejection, and apply attempts deterministically", () => {
    const proposed = mapM1ReviewFixtureToCard(DEMO_REVIEW_FIXTURES[0]);
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
    const event = createSafeClientLogEvent("m2.chat.submit", {
      prompt: "raw prompt",
      documentText: "raw document",
      message: "raw selected text under a generic key",
      preview: "raw preview",
      actionPayload: { proposedText: "secret" },
      provider: "openai",
      actionId: "action_m1_review",
      durationMs: 12
    });

    expect(event.metadata).toEqual({
      prompt: "[redacted]",
      documentText: "[redacted]",
      message: "[redacted]",
      preview: "[redacted]",
      actionPayload: "[redacted]",
      provider: "openai",
      actionId: "action_m1_review",
      durationMs: 12
    });
    expect(safeLogExcludesForbiddenContent(event)).toBe(true);
    expect(JSON.stringify(event)).not.toContain("raw prompt");
    expect(JSON.stringify(event)).not.toContain("raw document");
  });
});
