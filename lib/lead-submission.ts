import "server-only";
import { InvalidAppraisal, isVinCueLeadId, parseAppraisal, type AppraisalLead } from "./appraisal";
import { submitVinCueLead, VinCueSubmissionError, type VinCueReceipt } from "./vincue";

const MAX_BODY_BYTES = 16 * 1024;
class BodyTooLarge extends Error {}

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function failure(code: string, error: string, status: number, retryable = true) {
  return json({ ok: false, code, error, retryable }, status);
}

async function readJson(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && Number(length) > MAX_BODY_BYTES) throw new BodyTooLarge();
  if (!request.body) throw new SyntaxError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new BodyTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// Injection is for unit tests only. The route always uses the gated adapter;
// no environment setting or request parameter can activate a mock success.
export function createLeadSubmissionHandler(
  submit: (lead: AppraisalLead) => Promise<VinCueReceipt> = submitVinCueLead,
) {
  return async function POST(request: Request): Promise<Response> {
    if (request.method !== "POST") return failure("method_not_allowed", "Use POST to submit an appraisal.", 405);
    const origin = request.headers.get("origin");
    // Next.js may use its internal hostname in request.url. Host represents
    // the browser-facing request authority. Do not trust X-Forwarded-Host.
    const requestUrl = new URL(request.url);
    const expectedOrigin = `${requestUrl.protocol}//${request.headers.get("host") || requestUrl.host}`;
    if (origin !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
      return failure("invalid_origin", "Please submit from this website.", 403);
    }
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return failure("unsupported_content_type", "Please submit the appraisal as JSON.", 415);
    }

    let lead: AppraisalLead;
    try {
      lead = parseAppraisal(await readJson(request));
    } catch (error) {
      if (error instanceof BodyTooLarge) return failure("payload_too_large", "The appraisal request is too large.", 413);
      if (error instanceof InvalidAppraisal) return failure("invalid_appraisal", error.message, 400);
      return failure("invalid_json", "We couldn't read your appraisal. Please try again.", 400);
    }

    try {
      const receipt = await submit(lead);
      if (!isVinCueLeadId(receipt?.leadId)) throw new VinCueSubmissionError("submission_unknown");
      return json({ ok: true, leadId: receipt.leadId }, 201);
    } catch (error) {
      // Never return or log upstream bodies, URLs, cookies, credentials, or PII.
      if (error instanceof VinCueSubmissionError && error.code === "integration_unavailable") {
        return failure("integration_unavailable", "Online submission is currently unavailable. Your appraisal has not been sent. Your details remain on this page; please keep it open and try again later.", 503);
      }
      if (error instanceof VinCueSubmissionError && error.code === "submission_rejected") {
        return failure("submission_rejected", "Your appraisal was not accepted. Please check your details before trying again.", 422);
      }
      // An unexpected failure could occur after the provider accepted a lead.
      // A retry must wait for reconciliation instead of risking duplicates.
      return failure("submission_unknown", "We couldn't confirm whether your appraisal was received. Please contact the 228 team before submitting again.", 502, false);
    }
  };
}
