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

Final custom-domain validation passed on `https://res.beareberly.com`: the demo health endpoint returned release `6f145a3a1b5a95c87c4e1e1389b63447327b38c7`, the API regression passed, and the Playwright browser suite passed 15 tests across desktop, iPad sized Chromium, and mobile Chromium.
