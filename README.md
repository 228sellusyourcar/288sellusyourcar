# 288sellusyourcar

Next.js custom appraisal funnel with the existing NHTSA VIN decoder.

## Development

Use Node.js 22+ and pnpm 11.19.0. Run `pnpm install --frozen-lockfile`, then `pnpm dev`.
Verification: `pnpm test`, `pnpm typecheck`, and `pnpm build`.

## VinCue submission status

The contact step calls `POST /api/leads`, but **live VinCue delivery is disabled**.
The supplied capture lacks the form/session bootstrap, and fresh server GETs
returned 403. The API returns an explicit 503 without sending or saving a lead.
Entered data stays in page memory, and photos remain selected locally; refreshing
or closing the page loses them. No credentials are needed for this partial adapter.

See [the integration analysis](docs/vincue-integration.md) for request/redirect
findings, state/cookie limitations, and exact sanctioned integration requirements.
Synthetic tests exercise success receipts; production has no mock-success mode.
