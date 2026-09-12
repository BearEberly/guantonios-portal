# Guantonio reservation pitch progress

## Current target

- Demo hostname: `res.beareberly.com`
- Deployment model: separate Cloudflare Pages demo project, independent from `gtonecrew.com`
- Working checkout: `/Users/bearbear/Documents/Codex/worktrees/guantonios-reservation-pitch`
- Branch: `codex/reservation-pitch`
- Source reference checkout: `/Users/bearbear/Documents/Codex/projects/Guantonios Portal`

## Current decision record

The earlier objective file named `res.gtonecrew.com`. The user later changed direction and said the demo should have nothing to do with `gtonecrew.com`; the target is now `res.beareberly.com`. This file records that superseding direction so deployment, evidence, and final reporting use the BearEberly subdomain.

## SMS boundary

SMS remains disabled and deferred. The pitch includes only a disabled notification adapter and unsent preview events.

## September 10, 2026 deployment update

The separate Cloudflare Pages project `res-beareberly` is live at `https://res-beareberly.pages.dev/` from the GitHub Actions workflow. The available Cloudflare token could manage Pages but could not create DNS records, so the DNS record required dashboard access.

## September 12, 2026 custom-domain update

The final demo hostname `https://res.beareberly.com/` is live. Cloudflare DNS now has a proxied CNAME record `res.beareberly.com` to `res-beareberly.pages.dev`, and the `res-beareberly` Pages custom-domain panel shows `res.beareberly.com` as Active with SSL enabled.

Final custom-domain validation passed on `https://res.beareberly.com`: the demo health endpoint returned the deployed Git release, the API regression passed, and the Playwright browser suite passed 15 tests across desktop, iPad sized Chromium, and mobile Chromium. Record the exact current release from `/api/demo/health` during final handoff.

## September 12, 2026 Resy-style interface refresh

The customer reservation page was refreshed toward the requested Resy-style experience while keeping Guantonio branding and demo safety copy. The page now uses a sticky reservation header, grouped guest/date/time/seating search controls, venue tabs, circular date rail, time and seating tiles, and a right-side venue/location/operator rail.

The protected operator route was refreshed toward an iPad service-console model. It now presents service counts, a reservation queue, check-in and seating actions, a floor snapshot, recent holds, and the disabled notification adapter preview.

Local validation passed before deployment: production build, Vitest API wrapper tests, rendered desktop/iPad/mobile checks with no console errors or horizontal overflow, and local Playwright smoke/accessibility tests for public pages and the operator passcode shell. Full transactional booking verification is performed against the deployed Cloudflare Pages functions. A live-console CSP correction also allows Cloudflare Insights hosts so Cloudflare Pages analytics injection does not produce browser console errors.

## September 12, 2026 Cloudflare deploy token repair

The GitHub Actions deployment failure was fixed by replacing the invalid `CLOUDFLARE_API_TOKEN` secret with a new Cloudflare user API token scoped to `Seberly@gmail.com's Account` with `Cloudflare Pages:Edit`. The workflow now passes `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` directly to Wrangler instead of relying on the prior OAuth-style Wrangler config secret.

The repaired workflow rerun succeeded and deployed release `c8da9db25aa15d62bb3025e1be0e13eecb9c3d0c` to `https://res.beareberly.com/`. Final verification passed: health endpoint returned the final release, API regression passed, Playwright passed 15 production browser tests across desktop, iPad, and mobile, demo data was reset, and the Cloudflare Insights CSP console error was gone on the live reservation page.
