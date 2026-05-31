import { describe, expect, it } from "vitest";
import { getActionStatusLabel, getProposedActionState } from "../src/proposed-actions";

describe("proposed action helpers", () => {
  it("allows approve and reject while action is proposed", () => {
    const state = getProposedActionState({ actionId: "action-1", status: "PROPOSED" });

    expect(state.canApprove).toBe(true);
    expect(state.canReject).toBe(true);
    expect(state.canApply).toBe(false);
    expect(state.isTerminal).toBe(false);
  });

  it("allows apply only after approval", () => {
    const state = getProposedActionState({ actionId: "action-1", status: "APPROVED" });

    expect(state.canApprove).toBe(false);
    expect(state.canReject).toBe(true);
    expect(state.canApply).toBe(true);
  });

  it("marks conflict as terminal and review-required", () => {
    const state = getProposedActionState({ actionId: "action-1", status: "CONFLICTED" });

    expect(state.isTerminal).toBe(true);
    expect(state.requiresConflictReview).toBe(true);
    expect(state.label).toBe("Conflict");
  });

  it("labels every terminal and unknown status", () => {
    expect(getActionStatusLabel("APPLIED")).toBe("Applied");
    expect(getActionStatusLabel("REJECTED")).toBe("Rejected");
    expect(getActionStatusLabel("EXPIRED")).toBe("Expired");
    expect(getActionStatusLabel("FAILED")).toBe("Failed");
    expect(getActionStatusLabel("BAD_STATUS")).toBe("Unknown");
  });
});
