import "server-only";
import type { AppraisalLead } from "./appraisal";

export type VinCueReceipt = { leadId: string };
export type VinCueFailure = "integration_unavailable" | "submission_rejected" | "submission_unknown";

export class VinCueSubmissionError extends Error {
  constructor(public readonly code: VinCueFailure) {
    super(code);
  }
}

/**
 * A controlled Node.js test proved fresh-form contact/vehicle submission.
 * Full appraisal mapping and durable duplicate handling remain unverified.
 * See docs/vincue-integration.md for evidence and activation requirements.
 */
export async function submitVinCueLead(lead: AppraisalLead): Promise<VinCueReceipt> {
  // TODO(VINCUE): implement the production transport after verifying the full
  // intake contract. Keep dealer routing and any credentials server-side.
  // TODO(VINCUE): map every field, including condition, payoff, consent, and
  // uploaded photos. Never treat selectedCount as delivered attachments.
  // TODO(VINCUE): add durable idempotency/reconciliation and abuse controls
  // before enabling writes; never retry a POST whose outcome is unknown.
  void lead;
  throw new VinCueSubmissionError("integration_unavailable");
}
