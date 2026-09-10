# Guantonio reservation pitch demo

This package is an isolated reservation demo for `res.beareberly.com`. It mirrors the public Guantonio homepage enough for a pitch, replaces the Resy call to action with a synthetic reservation flow, and includes a protected iPad sized operator view.

It is not connected to Resy, Twilio, payments, email delivery, or live restaurant inventory. All reservation rows are synthetic demo rows stored in the private Supabase `reservation_demo` schema.

## Routes

- `/` mirrors the Guantonio homepage and links to the demo reservation flow.
- `/reservations` lets a guest search, hold, and confirm a synthetic reservation.
- `/manage` lets the guest view, change, or cancel the synthetic booking with the generated management token.
- `/operator` is a protected internal iPad view for check in, seating status changes, cancellation, floor snapshot, recent holds, and disabled notification previews.

## Local setup

Copy the example environment file and fill in the local values:

```bash
cp .dev.vars.example .dev.vars
```

Required local keys:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `DEMO_API_SECRET`
- `DEMO_OPERATOR_TOKEN`
- `DEMO_MODE=true`

Then run:

```bash
npm ci
npm run build
npm run cf:dev
```

Local Pages dev runs at `http://localhost:8788`.

## Validation

```bash
npm test
npm audit --audit-level=moderate
node scripts/demo-api-regression.mjs
PLAYWRIGHT_BASE_URL=http://localhost:8788 DEMO_OPERATOR_TOKEN=<token> npm run test:e2e
```

The API regression covers reset, availability search, hold retry, confirm retry, wrong-token rejection, view, change, cancel, operator list, one-table concurrency, and direct private schema isolation. The Playwright suite covers desktop, iPad sized, and phone sized booking and operator flows, plus automated accessibility smoke checks.

## Resetting demo data

The protected operator route calls `POST /api/demo/operator/reset`, which invokes `public.reservation_demo_reset(secret text)` in Supabase. The reset clears only synthetic demo tables and reseeds sample dates and tables.

## Deployment

Cloudflare Pages project: `res-beareberly`

Production branch: `codex/reservation-pitch`

The GitHub workflow at `.github/workflows/reservations-demo.yml` builds this package and deploys `pitch/dist` to Cloudflare Pages with Wrangler. Runtime values are configured as Cloudflare Pages production secrets, and the GitHub Action uses repository secrets for the Cloudflare account id and API token.

Target hostname: `res.beareberly.com`
