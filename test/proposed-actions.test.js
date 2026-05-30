import test from "node:test";
import assert from "node:assert/strict";
import { getProposedActionState } from "../src/proposed-actions.js";

test("allows approve and reject while action is proposed", () => {
  const state = getProposedActionState({ actionId: "action-1", status: "PROPOSED" });

  assert.equal(state.canApprove, true);
  assert.equal(state.canReject, true);
  assert.equal(state.canApply, false);
  assert.equal(state.isTerminal, false);
});

test("allows apply only after approval", () => {
  const state = getProposedActionState({ actionId: "action-1", status: "APPROVED" });

  assert.equal(state.canApprove, false);
  assert.equal(state.canReject, true);
  assert.equal(state.canApply, true);
});

test("marks conflict as terminal and review-required", () => {
  const state = getProposedActionState({ actionId: "action-1", status: "CONFLICTED" });

  assert.equal(state.isTerminal, true);
  assert.equal(state.requiresConflictReview, true);
  assert.equal(state.label, "Conflict");
});
