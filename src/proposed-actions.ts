export const PROPOSED_ACTION_STATUSES = Object.freeze({
  PROPOSED: "PROPOSED",
  APPROVED: "APPROVED",
  APPLIED: "APPLIED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  CONFLICTED: "CONFLICTED",
  FAILED: "FAILED"
});

export type ProposedActionStatus = (typeof PROPOSED_ACTION_STATUSES)[keyof typeof PROPOSED_ACTION_STATUSES];

export type ProposedActionInput = {
  actionId?: string;
  status?: string;
};

export type ProposedActionState = {
  actionId: string | null;
  status: string;
  isTerminal: boolean;
  requiresConflictReview: boolean;
  canApprove: boolean;
  canReject: boolean;
  canApply: boolean;
  label: string;
};

const TERMINAL_STATUSES = new Set<string>([
  PROPOSED_ACTION_STATUSES.APPLIED,
  PROPOSED_ACTION_STATUSES.REJECTED,
  PROPOSED_ACTION_STATUSES.EXPIRED,
  PROPOSED_ACTION_STATUSES.CONFLICTED,
  PROPOSED_ACTION_STATUSES.FAILED
]);

export function getProposedActionState(action: ProposedActionInput = {}): ProposedActionState {
  const status = action.status ?? PROPOSED_ACTION_STATUSES.PROPOSED;
  const isTerminal = TERMINAL_STATUSES.has(status);
  const requiresConflictReview = status === PROPOSED_ACTION_STATUSES.CONFLICTED;

  return {
    actionId: action.actionId ?? null,
    status,
    isTerminal,
    requiresConflictReview,
    canApprove: status === PROPOSED_ACTION_STATUSES.PROPOSED,
    canReject: status === PROPOSED_ACTION_STATUSES.PROPOSED || status === PROPOSED_ACTION_STATUSES.APPROVED,
    canApply: status === PROPOSED_ACTION_STATUSES.APPROVED,
    label: getActionStatusLabel(status)
  };
}

export function getActionStatusLabel(status: string): string {
  switch (status) {
    case PROPOSED_ACTION_STATUSES.PROPOSED:
      return "Needs review";
    case PROPOSED_ACTION_STATUSES.APPROVED:
      return "Approved";
    case PROPOSED_ACTION_STATUSES.APPLIED:
      return "Applied";
    case PROPOSED_ACTION_STATUSES.REJECTED:
      return "Rejected";
    case PROPOSED_ACTION_STATUSES.EXPIRED:
      return "Expired";
    case PROPOSED_ACTION_STATUSES.CONFLICTED:
      return "Conflict";
    case PROPOSED_ACTION_STATUSES.FAILED:
      return "Failed";
    default:
      return "Unknown";
  }
}
