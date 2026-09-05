# VinCue intake: evidence and activation requirements

## Delivery is intentionally disabled

The custom appraisal funnel now calls `POST /api/leads`. The server validates
and normalizes the full appraisal, then calls the server-only VinCue adapter.
The production adapter always returns `503 integration_unavailable`: it sends
nothing to VinCue, stores nothing, and never claims a lead was created. No
configuration setting enables captured-form replay or mock success.

On failure, details and selected files remain in page memory. Refreshing or
closing the page loses them. There is no queue, localStorage, email delivery,
photo upload, or CRM persistence. The existing NHTSA decoder and funnel layout
are preserved. The success screen displays a verified `leadId` only when a
sanctioned adapter is implemented; synthetic tests exercise that path.

## Evidence from the supplied files

Inspected on 2026-09-05: `vincue-contact-submission.har` and
`vincue-endpoint-and-payload.json`, recovered from the referenced conversation's
attachments. Their original `/mnt/data` paths are not local desktop paths.
Neither raw file is included in this repository.

The HAR contains **one entry**, captured at 2026-09-05T21:36:11.486Z. The JSON
contains the same raw POST body. This is not a complete session capture.

| Observation | Meaning and limitation |
| --- | --- |
| POST `https://pro.vincue.com/buyingcenter/contact.aspx` | Widget Web Forms endpoint, not a documented public lead API. |
| Form URL encoding; 42 fields | Stateful postback with proprietary controls. |
| Dealer `did=24831` in query and hidden form | Intended routing; keep dealer configuration server-owned. |
| `__VIEWSTATE` (1,324 characters), `__VIEWSTATEGENERATOR`, event target/argument | No preceding HTML response establishes generation, lifetime, or session binding. |
| 15 hidden control values paired with `__VS` fields; another 1,620-character form `__VS` | Fresh standard VIEWSTATE alone is insufficient. |
| Event target `ctl00$contentMain$ctl03$qryrekey$teLeadFormSubmitLead`; argument `save:` | Observed action, without a stability guarantee. |
| No `__EVENTVALIDATION` | Does not prove other versions or flows omit it. |
| No Cookie, Authorization, or Set-Cookie headers; empty cookie arrays | Cookies were not captured. Sanitization and earlier session requirements remain unknown. |
| Origin `https://pro.vincue.com`, contact-page Referer, iframe navigation headers | Browser context, not proof that specific headers are required. Do not copy browser fingerprint headers as a workaround. |
| HTTP 302; relative Location `/buyingcenter/marketreport.aspx` with `year`, `mmid`, `trimid`, `vn`, `did`, `leadid` | Strong evidence of acceptance and an issued identifier. No following GET or dealer-side record verification was captured. A generic redirect is not success. |

Query keys: `did`, `vn`, `mmid`, `year`, `trimid`, `vin`, `extra`, `wuid`, `r`,
`utm_source`, `utm_medium`, `utm_campaign`, `followdealer`, `lat`, `long`, and
`forceLeadType`. Presence does not establish that every parameter is required.
**VIN and extra are blank** in this capture. A visitor identifier is present,
but its issuance is unknown; never reuse it. A complete VIN-based submission
and mapping to VinCue's vehicle identifiers have not been demonstrated.

Contact controls include first/last name, phone, email, year selector, mileage,
and opt-in. There is no proven mapping for our condition, payoff, or photos.
Appraisal-contact consent must not silently become marketing opt-in.

**Encoding trap:** exported `postData.params` and JSON `formData` names contain
`%24`. Parsing the raw URL-encoded body once yields actual `$`-separated names.
Putting the exported names directly into URLSearchParams double-encodes them.
These exports are evidence, not reusable form templates.

## Minimal request sequence: candidate, not verified

Only the final POST is established. The shortest plausible sequence is:

1. Resolve any required VinCue vehicle identifiers and obtain sanctioned
   visitor/session context. The capture does not show either operation.
2. GET a fresh contact form for that dealer and vehicle.
3. Preserve returned cookies in a per-submission jar. Extract the current form
   action, submit control, all hidden fields, proprietary `__VS` values, split
   VIEWSTATE and event-validation fields if present. Do not synthesize protected
   state or use a shared/global cookie jar.
4. Populate documented controls and POST once with fresh state, correct URL
   encoding, and the same session. Exact required cookies/headers are unknown.
5. Inspect the response with redirects disabled. For this observed flow,
   require the documented redirect status, HTTPS VinCue origin, exact
   market-report path, matching dealer, and one positive numeric `leadid`.
   Reject login/error/cross-origin redirects, duplicate/conflicting query keys,
   and HTTP 200 validation pages. Do not expose the full redirect URL.
6. Reconcile an uncertain POST using a supported lookup before any retry.

Read-only server GETs were attempted with (a) dealer alone and (b) dealer plus
captured non-personal vehicle context and lead type, without captured visitor
IDs, contact data, cookies, or VIN. **Both returned HTTP 403.** No POST or new
lead was created. The status does not establish the reason or prove that every
sanctioned server would fail. Fresh state was not obtainable here. No challenge
bypass, browser-identity spoofing, or captured-token replay was attempted.

Neither bootstrap nor repeatability is verified, so this candidate was not
implemented as production scraping. Tracking proxies, analytics, and market
reports are not lead API operations; their dispensability in this legacy flow
cannot be proved from a single POST.

## Exactly what to request from VinCue for dealer 24831

1. **Sanctioned server-to-server inbound private-party / VBC lead intake**:
   endpoint/version, authentication/scopes, dealer authorization, sandbox,
   hosting/IP access requirements, and rate limits. Ask whether this dealer
   supports a partner API or documented intake such as ADF/XML; neither is
   assumed available. Email-only intake cannot supply a synchronous lead ID
   without an acknowledgement or lookup mechanism.
2. Exact schema/encoding: VIN, VinCue make/model/trim identifiers, year, mileage,
   full name vs. first/last, optional email, phone, condition, payoff, attribution,
   and required fields. Confirm whether NHTSA vehicle data suffices or provide
   the supported identifier lookup API.
3. Consent semantics and evidence/version requirements. Confirm what the
   captured `tebOptIn` means; our current contact statement is not a blanket
   marketing subscription.
4. Supported photo upload/storage, limits, lead-attachment binding, retention,
   and partial-failure handling. A selected photo count is not uploaded media.
5. Definitive success/error schemas and lead-ID type, supported idempotency keys,
   deduplication window, and reconciliation/status lookup for timeouts.
6. If Web Forms is explicitly supported instead: approved bootstrap URLs/order,
   server access enablement, cookie scope/expiration, visitor-ID issuance, source
   of every protected field, field mappings, allowed headers, success redirect
   contract, and compatibility guarantees. A full sanitized HAR with initial
   response bodies can aid analysis but does not replace supported semantics.

VinCue's official [integration overview](https://vincue.com/teamvincue/integration-partners/)
and [inbound VBC description](https://vincue.com/system/inventory-acquisition-vehicle-buying-center-vbc/)
describe integrations and lead routing; the reviewed pages do not supply an
implementable lead-creation API contract.

## Implementation and requirements before activation

- `lib/appraisal.ts` defines our own application contract, not a VinCue API.
  It allowlists fields; no caller-supplied dealer, endpoint, cookie, token, or
  hidden state is forwarded. Descriptive vehicle fields remain user input and
  may require provider verification under the sanctioned contract.
- `lib/vincue.ts` is server-only and deliberately gated. Replace the gate only
  after the above requirements are met. Credentials belong in server deployment
  environment variables, never source, `NEXT_PUBLIC_*`, logs, or responses.
- `/api/leads` enforces origin/content checks and a 16 KiB streamed JSON limit,
  returns no-store responses, and reveals no provider bodies/URLs/exceptions.
  Next.js Node runtime has a 30-second deployment maximum duration.
- Before enabling writes, add bounded upstream timeouts, durable shared
  idempotency and reconciliation, deployment-wide rate limits, and verified
  anti-abuse controls. Origin checks and browser click protection do not replace
  these; an in-memory map would not cover multiple Vercel instances.
- Only report `submission_rejected` if the provider definitively confirms no
  lead was created. Unknown outcomes must never be automatically retried.
- The client requires HTTP 201, `ok: true`, and a positive string lead ID to
  show success. Duplicate clicks are blocked while pending. Unknown/network
  outcomes disable further submission on that page. Refresh is not a substitute
  for durable reconciliation once live delivery is enabled.
- Deliver every required appraisal field and selected photo before claiming
  complete success, or explicitly resolve unsupported fields with the product
  owner and customer flow before activation. Never silently discard data.
- Sandbox checks must cover fresh sessions, multiple vehicles, optional email,
  consent, photos, provider rejection, timeout-after-acceptance, duplicate retries,
  schema changes, and dealer routing. No real customer lead was used for tests.

Raw HAR/JSON, captured contact details, visitor IDs, VIEWSTATE, proprietary state,
and browser headers are excluded from source/tests. `.gitignore` blocks HARs,
the extracted payload filename, and environment files as defense in depth.

## Dependency maintenance

The install flagged the pre-existing Next.js 14.2.21 pin. This change includes
14.2.35, the same-line patch specified in the [Next.js advisory](https://nextjs.org/blog/security-update-2025-12-11).
This is not a claim that an older release line has no other outstanding issues.
