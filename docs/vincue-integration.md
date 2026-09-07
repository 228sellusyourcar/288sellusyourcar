# VinCue lead submission

## Current scope

The owner approved connecting the proven vehicle/contact flow first, without
new storage or photo infrastructure. The custom UI and NHTSA decoder remain.
The active steps are VIN lookup, vehicle confirmation, mileage, contact, receipt.
Email and first/last name are required by the vendor. Condition, payoff, and
photos are explicitly deferred to follow-up; outdated requests containing them
are rejected before any upstream request. No selected file is represented as
uploaded, and no marketing opt-in is checked automatically.

## Capture analysis

The supplied HAR contains only one POST to
`https://pro.vincue.com/buyingcenter/contact.aspx`; the accompanying JSON contains
the same request. Neither file supplies the bootstrap sequence. The original
request has 42 form fields, dealer 24831, dynamic `__VIEWSTATE`, generator,
proprietary per-control `__VS` and form-level state, plus event target/argument.
No cookies or Authorization header were captured; that does not prove cookies
are unnecessary. VIN was blank in that original capture. The HTTP 302 Location
points to `/buyingcenter/marketreport.aspx` with dealer and a numeric lead ID.

Exported parameter names contain `%24`; parse the original form body once to
recover `$` names. Reusing exported names would double-encode them. No captured
state, visitor IDs, contacts, raw HAR, or cookie values belong in source/tests.

## Proven sequence and implemented transport

An explicitly approved synthetic live test on 2026-09-06 America/Chicago sent
one POST and received an accepted redirect and lead ID. Native Node fetch could
load fresh state, despite earlier Python urllib HTTP 403 responses. No challenge
bypass or browser fingerprint spoofing was used.

1. GET `/buyingcenter/aj/vehicleAutoComplete.aspx?q=<VIN>`. The endpoint comes
   from the uploaded widget JavaScript. Require exactly one match with valid
   `mmid`, `trimid`, vehicle name, and the expected year. Ambiguous matches stop
   before submission. This supplements the existing NHTSA decoder.
2. GET `/buyingcenter/contact.aspx` with `did=24831`, VIN, year, vehicle name,
   `mmid`, and `trimid`. Without the identifiers, the expected year option was
   absent in a read-only test. The six parameters sufficed in the accepted test;
   no historical visitor/UTM/location values were needed.
3. Parse the current form with Cheerio. Preserve every enabled hidden input,
   including proprietary state, split VIEWSTATE/event validation if present.
   Validate form method/action, dealer hidden field, VIN, year option, required
   controls, and the known postback shape. Extract rather than execute the
   current `__doPostBack` target/argument. Unexpected markup fails before POST.
4. Keep fresh response cookies in a per-submission tough-cookie jar. The test
   received `LBSERVERID` and `SERVERID`; never share the jar across submissions.
   Fill first/last name, phone, required email, odometer, and year. Submit once
   with URLSearchParams, Content-Type, Accept, Origin, Referer, and scoped fresh
   cookies. Unchecked marketing controls are omitted. The accepted test had
   41 fields. Individual cookie/header necessity was not independently tested.
5. With redirects disabled, require HTTP 302/303, HTTPS `pro.vincue.com`, exact
   `/buyingcenter/marketreport.aspx`, exactly one matching dealer and one positive
   numeric lead ID. Do not follow the report redirect or expose its URL.

No widget rendering, analytics requests, old cookies, hard-coded VIEWSTATE, or
additional infrastructure is needed. The form is an observed Web Forms contract,
not a vendor-guaranteed public API. Form drift fails closed.

## Failure handling and limits

- The entire upstream sequence has a 22-second timeout; GET bodies are capped at
  256 KiB. The API has a 16 KiB streamed JSON limit and a 30-second Vercel limit.
- Failures before POST return 503 and explicitly say nothing was sent. Any
  exception or unverified response after starting POST is unknown, even HTTP
  200/4xx. No automatic retry follows it. No upstream bodies, state, PII, URLs,
  or exceptions are logged or returned.
- HTTP 201 plus a validated lead ID is required for client success. The browser
  prevents concurrent clicks and records pending/confirmed status only in
  sessionStorage before sending. A refresh in that tab does not unlock retries.
  A definitive pre-submit failure clears that marker; an uncertain result does
  not. Contact details remain only in page memory and are lost on refresh.
- This intentionally small integration does **not** guarantee exactly-once
  delivery across tabs/devices, cleared storage, or manually repeated requests.
  There is no shared deduplication database, queue, automatic reconciliation, or
  deployment-wide rate limiter. Origin validation is not bot protection.
  The owner chose to prove the basic connection before adding infrastructure.
- Lead acceptance is verified from the redirect; complete dealer-record contents
  and Vercel-origin POST acceptance still require an explicitly approved hosted
  test and dealer-side inspection. Do not manufacture another test lead as a
  build/deployment health check.

## Verification

Offline transport tests cover fresh synthetic hidden state, encoding, scoped
cookies, exact request sequence, required field/form changes, ambiguous vehicle
lookup, wrong year/dealer, external or malformed redirects, and network loss
following POST. Route tests cover validation, byte limits, origins, receipts,
no error/PII disclosure, and rejection of unsupported appraisal details.

A read-only dry run through the implemented adapter prepared the current live
form successfully and intercepted POST before any network write. The earlier
approved live test used the same sequence. Builds/tests do not send leads.

## Follow-up TODOs when expanding the integration

Ask VinCue for sanctioned inbound VBC API or approved Web Forms compatibility
contract, authentication/dealer scopes, sandbox and hosting requirements;
vehicle identifier lookup guarantees; definitive failure/receipt schemas;
idempotency keys and a lead-status reconciliation lookup. For the deferred
features obtain documented condition/payoff mapping, photo attachment endpoints,
consent semantics, and retention requirements. Do not assume the hidden `extra`
field is a notes field; widget code uses it for search context.

Add shared deduplication/reconciliation and deployment-wide anti-abuse controls
when expanding beyond the basic flow. A process-local map is not durable
protection across Vercel instances.

Raw captures and transient live state remain outside this repository.
`.gitignore` excludes HAR, the extracted payload filename, and environment files.
