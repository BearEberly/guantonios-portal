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

The separate Cloudflare Pages project `res-beareberly` is live at `https://res-beareberly.pages.dev/` from the GitHub Actions workflow. The custom domain `res.beareberly.com` is attached in Pages but waiting on the DNS CNAME record to `res-beareberly.pages.dev`. The available Cloudflare token cannot create DNS records; Cloudflare returns authentication error `10000` for DNS operations.
