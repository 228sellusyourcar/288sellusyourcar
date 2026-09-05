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
 * Safety gate: the supplied HAR contains one POST, no bootstrap response, and
 * fresh server GETs returned 403. Do not enable replay of the captured form.
 * See docs/vincue-integration.md for evidence and activation requirements.
 */
export async function submitVinCueLead(lead: AppraisalLead): Promise<VinCueReceipt> {
  // TODO(VINCUE): implement only after receiving the sanctioned intake contract
  // and dealer credentials. Keep credentials and dealer routing server-side.
  // TODO(VINCUE): map every field, including condition, payoff, consent, and
  // uploaded photos. Never treat selectedCount as delivered attachments.
  // TODO(VINCUE): add durable idempotency/reconciliation and abuse controls
  // before enabling writes; never retry a POST whose outcome is unknown.
  void lead;
  throw new VinCueSubmissionError("integration_unavailable");
}
