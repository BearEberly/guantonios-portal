# Guantonio reservation pitch launch report

## Target

- Demo hostname: `res.beareberly.com`
- Cloudflare Pages project: `res-beareberly`
- Git branch: `codex/reservation-pitch`
- Live Pages URL: `https://res-beareberly.pages.dev/`
- GitHub Actions workflow: `https://github.com/BearEberly/guantonios-portal/actions/workflows/reservations-demo.yml`
- Package root: `pitch/`
- Supabase project: restaurant portal project `tcrbfctksulrwudfmxiv`
- Database schema: private `reservation_demo`

## Scope

The demo implements a synthetic, one-restaurant reservation system:

- Public homepage with Guantonio visual style and a replacement reservation CTA.
- Guest search, hold, confirm, manage, change, and cancel flow.
- Protected iPad sized operator view for check in, seating, finishing, cancellation, floor snapshot, recent holds, and reset.
- Disabled notification adapter with preview records only.
- No Resy write, SMS, email, payment, or real reservation side effects.

## Local validation, September 10, 2026

Passing checks:

- `npm run build --prefix pitch`
- `npm test --prefix pitch`
- `npm audit --prefix pitch --audit-level=moderate`
- `node pitch/scripts/demo-api-regression.mjs` against local Cloudflare Pages worker
- `PLAYWRIGHT_BASE_URL=http://localhost:8788 npm run test:e2e --prefix pitch`
- Manual visual inspection of homepage desktop/mobile, booking desktop/mobile, manage mobile, and operator iPad screenshots
- Expired hold validation: expired held slot rejected confirmation with `409 hold_expired_or_unauthorized` and returned capacity to search
- Secret scan: no actual local demo secret values found in trackable source files

## Evidence files

- `docs/demo/evidence/visual-workflow-baseline-2026-09-10T06-07-24Z.md`
- `docs/demo/evidence/screenshots/local-home-1280.png`
- `docs/demo/evidence/screenshots/local-home-390.png`
- `docs/demo/evidence/screenshots/local-reservations-1280.png`
- `docs/demo/evidence/screenshots/local-reservations-390.png`
- `docs/demo/evidence/screenshots/local-manage-390.png`
- `docs/demo/evidence/screenshots/local-operator-ipad.png`
- `docs/demo/evidence/screenshots/local-screenshots.json`

## Operator access

- Working operator URL: `https://res-beareberly.pages.dev/operator`
- Final operator URL after DNS: `https://res.beareberly.com/operator`
- Passcode source: `DEMO_OPERATOR_TOKEN` in trusted local `pitch/.dev.vars` and Cloudflare Pages production secrets. The passcode is not committed or printed in this report.
- Reset: use the operator view `Reset demo data` button or `POST /api/demo/operator/reset` with the operator token.

## Supabase isolation evidence

- Demo data lives in private schema `reservation_demo` in project `tcrbfctksulrwudfmxiv`.
- The migration creates demo-only tables for venue, tables, service days, holds, bookings, allocations, idempotency attempts, notification previews, and audit events.
- Row level security is enabled on demo tables, and direct grants to `public`, `anon`, and `authenticated` are revoked.
- Browser traffic reaches demo data only through Cloudflare Pages Functions calling narrow Supabase RPCs with a server-held demo secret.
- Direct anonymous REST read against `reservation_demo.bookings` was rejected with HTTP `406` during local and live API regression.
- The API regression proved wrong hold token rejection, idempotent hold retry, idempotent confirm retry, last-table concurrency, cancellation, and operator listing.

## Visual comparison evidence

- The homepage screenshots were compared against the current official Guantonio homepage reference captures.
- Desktop homepage major bands align with the reference: header, reservation CTA, storefront hero, contact/map block, story block, and dark footer.
- Mobile homepage uses the same order and artwork with compact spacing for phone review.
- Reservation pages use a Resy-style booking panel and clearly label unknown checkout fields as proposed demo fields.

## Five-minute pitch script

See `pitch/docs/PITCH_SCRIPT.md`.

## Real restaurant launch gap list

Before this can replace Resy in production, the restaurant still needs:

- Real venue schedule, table inventory, party-size rules, turn times, closures, and exceptions.
- Staff authentication and role policy beyond the demo passcode.
- Production guest data retention, privacy policy, audit review, and support workflow.
- SMS provider setup, toll-free or local number registration, consent language, opt-out handling, and inbound cancellation rules.
- Monitoring, alerting, backups, export, and operational runbook.
- Controlled cutover plan so Resy and the replacement do not accept conflicting live reservations.

## Infrastructure status

Completed:

- Created separate Cloudflare Pages project `res-beareberly`.
- Published the demo through GitHub Actions to `https://res-beareberly.pages.dev/`.
- Set production runtime secrets in Cloudflare Pages.
- Added GitHub Actions deployment workflow.
- Added GitHub repository secrets needed by the workflow.
- Excluded branch `codex/reservation-pitch` and `codex/*` from the existing `guantonios-portal` Pages preview deployments so this branch does not publish under the employee project.
- Deleted the stray `guantonios-portal` preview deployment created during the first push; verified it did not contain the reservation demo.
- Attached custom domain `res.beareberly.com` to the `res-beareberly` Pages project.

Remaining before public handoff:

- Create DNS record: `res.beareberly.com` CNAME to `res-beareberly.pages.dev`, preferably proxied in Cloudflare.
- Refresh the `res.beareberly.com` Pages custom domain after DNS exists. Current status is pending with `CNAME record not set`.
- Verify HTTPS and the full booking workflow on `https://res.beareberly.com/`.

The current Cloudflare token has Pages write access but DNS record operations return Cloudflare authentication error `10000`. The Mac was locked during dashboard fallback, so the DNS record could not be added through the Cloudflare UI in this run.
