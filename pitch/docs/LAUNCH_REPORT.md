# Guantonio reservation pitch launch report

## Target

- Demo hostname: `res.beareberly.com`
- Cloudflare Pages project: `res-beareberly`
- Git branch: `codex/reservation-pitch`
- Commit: `f98cc8a9e6700074051cfd9b28be6bbf81b9b3b8`
- Live Pages URL: `https://res-beareberly.pages.dev/`
- Deployment URL: `https://83d65ea7.res-beareberly.pages.dev/`
- GitHub Actions run: `https://github.com/BearEberly/guantonios-portal/actions/runs/34448742996`
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
