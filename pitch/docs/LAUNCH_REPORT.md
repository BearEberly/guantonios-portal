# Guantonio reservation pitch launch report

## Target

- Demo hostname: `res.beareberly.com`
- Cloudflare Pages project: `res-beareberly`
- Git branch: `codex/reservation-pitch`
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

## Infrastructure status

Completed:

- Created separate Cloudflare Pages project `res-beareberly`.
- Set production runtime secrets in Cloudflare Pages.
- Added GitHub Actions deployment workflow.
- Added GitHub repository secrets needed by the workflow.
- Excluded branch `codex/reservation-pitch` from the existing `guantonios-portal` Pages preview deployments so this branch does not publish under the employee project.

Remaining before public handoff:

- Push branch `codex/reservation-pitch`.
- Verify GitHub Actions deployment completes.
- Attach `res.beareberly.com` to the `res-beareberly` Pages project.
- Verify DNS and HTTPS on the final hostname.
