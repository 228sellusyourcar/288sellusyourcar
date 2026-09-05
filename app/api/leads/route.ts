import { createLeadSubmissionHandler } from "../../../lib/lead-submission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = createLeadSubmissionHandler();
