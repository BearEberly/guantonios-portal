# Guantonio's Portal

Static-first employee hub for Guantonio's staff.

## Stack

- Frontend: plain HTML/CSS/vanilla JS
- Hosting: Cloudflare Pages
- Auth + data + storage: Supabase
- Optional public form capture: Google Apps Script -> Google Sheets
- Optional admin backend endpoints: Cloudflare Pages Functions

## Project Structure

- `/index.html` public landing page
- `/resources.html` public resources + optional signup form
- `/app/*.html` staff pages
- `/partials/*.html` shared header + app nav
- `/styles.css` global design system
- `/js/*.js` modular frontend logic
- `/functions/api/admin/invite.js` admin invite endpoint
- `/functions/api/integrations/square/connect.js` starts Square OAuth connect flow
- `/functions/api/integrations/square/callback.js` OAuth callback handler
- `/functions/api/integrations/square/status.js` returns current Square integration status
- `/functions/api/integrations/square/disconnect.js` disconnects/revokes Square connection
- `/functions/api/integrations/square/sync-day.js` Square daily tip sync endpoint
- `/functions/api/sops/signed-upload.js` SOP signed upload token endpoint
- `/functions/api/sops/signed-download.js` SOP signed download endpoint
- `/db/supabase.schema.sql` starter schema + RLS policies
- `/db/migrations/*.sql` incremental migrations
- `/scripts/seed-demo.mjs` demo users/data seeding script
- `/backend/google-apps-script.gs` public form Apps Script
- `/assets/*` brand assets

## Quick Start

1. Edit `/js/config.js` with your Supabase project URL and anon key.
2. In Supabase SQL editor, run `/db/supabase.schema.sql`.
   - If your database was already initialized with an older version, run `/db/migrations/2026-03-03-hardening.sql` after.
   - Then run `/db/migrations/2026-03-04-sops-storage-and-shifts.sql` for SOP upload/storage enhancements.
   - Then run `/db/migrations/2026-03-05-square-oauth-integrations.sql` for Square OAuth self-service integration tables.
   - Then run `/db/migrations/2026-03-08-portal-shared-state.sql` for cross-device sync of staff/schedule/tips/menu local modules.
3. In Supabase Auth settings:
   - add `http://localhost:8788/app/dashboard.html` and your production URL as redirect URLs.
   - configure Google provider.
   - configure Apple later if needed.
4. Set Cloudflare Pages Function environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ALLOW_TEMPORARY_LOGINS` (`false` in production, optional `true` for localhost dev)
   - `APPS_SCRIPT_URL` (optional public signup endpoint for `/api/public-config`)
   - `INVITE_REDIRECT_TO` (optional, example: `https://your-domain.com/app/reset.html`)
   - `SOPS_BUCKET` (recommended: `staff-sops`)
   - `SOP_DOWNLOAD_TTL` (seconds, default: `900`)
   - `SQUARE_ENVIRONMENT` (`production` or `sandbox`)
   - `SQUARE_OAUTH_CLIENT_ID` (required for admin self-service OAuth)
   - `SQUARE_OAUTH_CLIENT_SECRET` (required for admin self-service OAuth)
   - `SQUARE_OAUTH_REDIRECT_URI` (optional; defaults to `https://<your-domain>/api/integrations/square/callback`)
   - `SQUARE_OAUTH_SCOPES` (optional; default: `PAYMENTS_READ ORDERS_READ MERCHANT_PROFILE_READ`)
   - `SQUARE_OAUTH_STATE_TTL` (optional seconds; default: `900`)
   - `SQUARE_ADMIN_REDIRECT_PATH` (optional; default: `/app/admin.html`)
   - `SQUARE_ACCESS_TOKEN` (optional legacy fallback token if no OAuth connection exists)
   - `SQUARE_LOCATION_ID` (optional default location)
   - `SQUARE_BUSINESS_TIMEZONE` (optional, default: `America/Los_Angeles`)
5. Serve locally with any static server, for example:
   - `npx serve .`
   - open `http://localhost:3000` (or server output URL).
6. Deploy to Cloudflare Pages from GitHub.

## Seed Demo Data

1. Ensure your schema/migrations are applied and service-role key is available.
2. Run:
   - `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo.mjs`
3. Optional env vars:
   - `DEMO_PASSWORD` (default: `DemoPass!2026`)
   - `DEMO_EMAIL_DOMAIN` (default: `demo.guantonios.local`)
   - `DRY_RUN=true` (preview without writing data)

The script creates/reuses 12 demo accounts, upserts profiles, and seeds:
- announcements
- shifts
- training assignments
- requests
- tip statements (only for demo users with no existing tips)

## Brand Assets Used

- `/assets/restaurant-illustration.png`
- `/assets/g-mark.jpg`
- `/assets/wordmark.png`

## Notes

- Keep employee auth invite-only.
- `/index.html` redirects to `/app/login.html` so login is always the first page.
- Temporary preview login (`bear/1234`, `admin/1234`) is available on `localhost` only when `allowTemporaryLogins` is true in `js/config.js`.
- Production domains require Supabase-authenticated logins for shared cross-device data.
- Frontend runtime config is served from `/api/public-config` so production keys come from Cloudflare env vars instead of hardcoded JS.
- Do not expose admin/service keys in browser JS.
- Use Pages Functions for privileged admin actions.
- Admin invite flow calls `/api/admin/invite` and requires an admin session token.
- Invite redirect URLs are restricted to the current portal origin unless `INVITE_REDIRECT_TO` is set.
- SOP uploads use signed upload tokens from `/api/sops/signed-upload`.
- SOP document opens use `/api/sops/signed-download` and enforce visibility (`all`, `manager`, `admin`).
- Manager page includes a shift planner with create/edit/delete.
- Manager requests page supports approve/deny actions on pending requests.
- Manager page includes announcement composer + recent announcement list.
- Admin page includes self-service Square OAuth connect/disconnect and daily tip sync into the Tips workbook.
