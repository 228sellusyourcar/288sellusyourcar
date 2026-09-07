# 288sellusyourcar

Next.js custom appraisal funnel with the existing NHTSA VIN decoder.

## Development

Use Node.js 22+ and pnpm 11.19.0. Run `pnpm install --frozen-lockfile`, then `pnpm dev`.
Verification: `pnpm test`, `pnpm typecheck`, and `pnpm build`.

## VinCue submission status

The contact step calls `POST /api/leads`, but **live VinCue delivery is disabled**.
A controlled Node.js test successfully created a VinCue lead using fresh form
state and cookies. Complete condition/payoff/photo delivery and durable duplicate
handling are still unverified. The production API therefore still returns an
explicit 503 without sending or saving customer leads.
Entered data stays in page memory, and photos remain selected locally; refreshing
or closing the page loses them. No credentials are needed for this partial adapter.

See [the integration analysis](docs/vincue-integration.md) for request/redirect
findings, state/cookie limitations, and exact sanctioned integration requirements.
Synthetic tests exercise success receipts; production has no mock-success mode.
