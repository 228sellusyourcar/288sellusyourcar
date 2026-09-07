# 288sellusyourcar

Next.js custom appraisal funnel with the existing NHTSA VIN decoder.

## Development

Use Node.js 22+ and pnpm 11.19.0. Run `pnpm install --frozen-lockfile`, then `pnpm dev`.
Verification: `pnpm test`, `pnpm typecheck`, and `pnpm build`.

## VinCue submission

The contact step calls `POST /api/leads`. The server resolves VinCue vehicle
identifiers, asks the customer to select a trim when the VIN has multiple matches, obtains fresh Web Forms state and cookies, and posts once for dealer
24831. Only a verified success redirect produces a success screen with a lead ID.
No widget, saved cookies, captured tokens, or additional storage service is used.

The current flow collects VIN, mileage, first/last name, phone, and required
email. Condition, payoff, and photos are collected by the team during follow-up,
as agreed with the product owner. Old full-appraisal requests are rejected rather
than silently dropping those fields.

The browser blocks duplicate clicks and stores only pending/confirmed submission
status in sessionStorage to prevent accidental retries after refresh. Unknown
outcomes require contacting the team. This is not durable cross-device or
cross-instance deduplication. No automatic POST retries occur.

See [the integration analysis](docs/vincue-integration.md) for evidence, validation,
and remaining provider-contract limitations. Tests use synthetic data and mocked
fetch; running tests never creates real leads.
