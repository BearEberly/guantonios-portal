# Guantonio reservation pitch launch report

## Target

- Demo hostname: `res.beareberly.com`
- Cloudflare Pages project: `res-beareberly`
- Git branch: `codex/reservation-pitch`
- Live custom-domain URL: `https://res.beareberly.com/`
- Live Pages fallback URL: `https://res-beareberly.pages.dev/`
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

## Final custom-domain validation, September 12, 2026

Passing checks on `https://res.beareberly.com`:

- DNS: proxied CNAME `res.beareberly.com` to `res-beareberly.pages.dev`; public DNS returns Cloudflare A and AAAA records.
- Cloudflare Pages custom domain: dashboard shows `res.beareberly.com` as Active with SSL enabled.
- Health endpoint: `GET /api/demo/health` returned HTTP 200 with the deployed Git release, `demo: true`, `smsEnabled: false`, and backend `ready`. Record the exact current release from that endpoint during final handoff.
- API regression: reset, availability search, hold retry, confirm retry, view, change, cancel, operator list, last-table concurrency, and blocked direct private schema read all passed.
- Browser suite: `PLAYWRIGHT_BASE_URL=https://res.beareberly.com node node_modules/@playwright/test/cli.js test` passed 15 tests across desktop, iPad sized Chromium, and mobile Chromium.

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

- Operator URL: `https://res.beareberly.com/operator`
- Pages fallback operator URL: `https://res-beareberly.pages.dev/operator`
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
- Created Cloudflare DNS record `res.beareberly.com` as a proxied CNAME to `res-beareberly.pages.dev`.
- Triggered Cloudflare Pages DNS recheck and verified the custom domain is Active with SSL enabled.
- Verified HTTPS and the full booking workflow on `https://res.beareberly.com/`.

No public handoff blockers remain for the demo. The current GitHub Actions deployment path works, but the saved Cloudflare credential used by the workflow is an OAuth-style token and should be replaced with a scoped long-lived Cloudflare API token before relying on unattended CI for future production operations.
