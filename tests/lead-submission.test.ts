import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../app/api/leads/route";
import { parseAppraisal, isVinCueLeadId } from "../lib/appraisal";
import { createLeadSubmissionHandler } from "../lib/lead-submission";
import { VinCueSubmissionError } from "../lib/vincue";

// Synthetic examples only. Never use browser captures as fixtures.
const example = () => ({
  vehicle: {
    vin: "1HGCM82633A004352", year: "2003", make: "Honda", model: "Accord",
    trim: "EX", bodyStyle: "Sedan", drivetrain: "FWD", engine: "3.0L",
  },
  mileage: 120000,
  contact: { fullName: "Example Seller", phone: "(202) 555-0100", email: "seller@example.com" },
  appraisalContactConsent: true,
});

function request(body: unknown = example(), headers: Record<string, string> = {}) {
  return new Request("https://app.example/api/leads", {
    method: "POST",
    headers: { origin: "https://app.example", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("lookup failure returns 503 without posting a lead", async () => {
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches++; throw new Error("No upstream calls allowed"); };
  try {
    const response = await POST(request());
    const result = await response.json();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(result.code, "integration_unavailable");
    assert.equal(result.ok, false);
    assert.equal(result.leadId, undefined);
    assert.equal(fetches, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("normalizes all appraisal fields and strips untrusted routing/state", () => {
  const input = example();
  input.contact.fullName = "  Example Seller  ";
  input.vehicle.vin = input.vehicle.vin.toLowerCase();
  const result = parseAppraisal({ ...input, dealerId: "untrusted", endpoint: "https://other.example", cookies: "fake-cookie" });
  assert.equal(result.contact.fullName, "Example Seller");
  assert.equal(result.contact.phone, "+12025550100");
  assert.equal(result.contact.email, "seller@example.com");
  assert.deepEqual(result.vehicle, example().vehicle);
  for (const key of ["dealerId", "endpoint", "cookies"]) assert.equal(key in result, false);
});

test("malformed or incomplete inputs never reach the adapter", async () => {
  const invalid: unknown[] = [
    null, [], {}, "{broken", { ...example(), vehicle: null },
    { ...example(), vehicle: { ...example().vehicle, vin: "I".repeat(17) } },
    { ...example(), vehicle: { ...example().vehicle, year: "1000" } },
    { ...example(), vehicle: { ...example().vehicle, make: "" } },
    ...["120000", 0, -1, 1.5, 10000000].map(mileage => ({ ...example(), mileage })),
    { ...example(), condition: "unknown" }, { ...example(), payoff: "unknown" },
    { ...example(), appraisalContactConsent: false },
    { ...example(), contact: { ...example().contact, fullName: "X" } },
    { ...example(), contact: { ...example().contact, fullName: "X\nY" } },
    { ...example(), contact: { ...example().contact, phone: "2025550100 ext 123" } },
    { ...example(), contact: { ...example().contact, phone: "000000000000000" } },
    { ...example(), contact: { ...example().contact, email: "invalid" } },
    ...[-1, 1.5, 101].map(selectedCount => ({ ...example(), photos: { selectedCount } })),
  ];
  let submissions = 0;
  const handler = createLeadSubmissionHandler(async () => { submissions++; return { leadId: "123456" }; });
  for (const body of invalid) {
    const response = await handler(request(body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).ok, false);
  }
  assert.equal(submissions, 0);
});

test("enforces origin and JSON content type", async () => {
  let submissions = 0;
  const handler = createLeadSubmissionHandler(async () => { submissions++; return { leadId: "123456" }; });
  for (const origin of ["https://other.example", "null", ""]) {
    assert.equal((await handler(request(example(), { origin }))).status, 403);
  }
  assert.equal((await handler(request(example(), { "sec-fetch-site": "cross-site" }))).status, 403);
  for (const contentType of ["text/plain", "application/json-fake"]) {
    assert.equal((await handler(request(example(), { "content-type": contentType }))).status, 415);
  }
  assert.equal(submissions, 0);
  assert.equal((await handler(request(example(), { "content-type": "application/json; charset=utf-8" }))).status, 201);
});

test("enforces byte limit with declared, undeclared, and dishonest lengths", async () => {
  const headers: Record<string, string>[] = [{}, { "content-length": "1" }, { "content-length": "20000" }];
  for (const header of headers) {
    const response = await POST(request(JSON.stringify({ data: "é".repeat(9000) }), header));
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, "payload_too_large");
  }
});

test("accepts the public Host when Next.js rewrites the internal URL", async () => {
  const handler = createLeadSubmissionHandler(async () => { throw new VinCueSubmissionError("integration_unavailable"); });
  const response = await handler(new Request("https://internal-next.example/api/leads", {
    method: "POST",
    headers: { host: "app.example", origin: "https://app.example", "content-type": "application/json" },
    body: JSON.stringify(example()),
  }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "integration_unavailable");
  // An untrusted forwarded host never makes a cross-origin request valid.
  const rejected = await POST(request(example(), {
    host: "app.example", origin: "https://other.example", "x-forwarded-host": "other.example",
  }));
  assert.equal(rejected.status, 403);
});

test("verified receipt returns only the lead ID", async () => {
  const handler = createLeadSubmissionHandler(async lead => {
    assert.deepEqual(lead, parseAppraisal(example()));
    return { leadId: "123456", cookie: "fake-secret", raw: "private-provider-data" };
  });
  const response = await handler(request());
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, leadId: "123456" });
});

test("invalid receipts never count as successful submissions", async () => {
  for (const id of ["", "0", "-1", "1.5", "abc", "https://other.example/?leadid=123", "1".repeat(21)]) {
    assert.equal(isVinCueLeadId(id), false);
    const handler = createLeadSubmissionHandler(async () => ({ leadId: id }));
    const response = await handler(request());
    assert.equal(response.status, 502);
    const result = await response.json();
    assert.equal(result.code, "submission_unknown");
    assert.equal(result.retryable, false);
  }
});

test("uncertain failures never retry or disclose provider data", async () => {
  for (const error of [new Error("fake-cookie seller@example.com private-provider-url"), new VinCueSubmissionError("submission_unknown")]) {
    let submissions = 0;
    const handler = createLeadSubmissionHandler(async () => { submissions++; throw error; });
    const response = await handler(request());
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.retryable, false);
    assert.equal(JSON.stringify(body).includes("fake-cookie"), false);
    assert.equal(JSON.stringify(body).includes("seller@example.com"), false);
    assert.equal(submissions, 1);
  }
});

test("definitive rejection allows correction and resubmission", async () => {
  const handler = createLeadSubmissionHandler(async () => { throw new VinCueSubmissionError("submission_rejected"); });
  const response = await handler(request());
  assert.equal(response.status, 422);
  const result = await response.json();
  assert.equal(result.retryable, true);
  assert.equal(result.code, "submission_rejected");
});

test("selected photos never activate delivery or claim success", async () => {
  const input = example();
  const withPhotos = { ...input, photos: { selectedCount: 3 } };
  const response = await POST(request(withPhotos));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).ok, false);
});
