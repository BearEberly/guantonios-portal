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

SMS is still disabled in the deployed pitch. On September 12, 2026 the user reopened provider setup and requested a separate local 209-area-code texting number for Guantonio's. This supersedes the earlier deferral of number acquisition. The user previously rejected short-code pricing and chose a separate restaurant number; preserve the existing CSLodi number and registration. Demo bookings remain the current scope.

The initial read-only review found only unsent confirmation previews. The September 13 implementation now adds controlled inbound TwiML replies, signature-validated inbound/status callbacks, AI extraction, private sender state, consent and confirmation checks, deduplication, and daily interpretation limits. No outbound reminder queue is enabled. Acquiring a number does not establish working SMS. Do not send existing preview events or point Twilio at unverified routes.

Provider setup checkpoint, September 13: the user purchased +1 209 709 4194, verified active in Twilio as PN9369ddc0b66f91898a60852e880224c3. The prior +1 209 370 1492 was only an unpurchased search candidate. The new number still uses Twilio's default SMS reply endpoint and requires A2P 10DLC registration. The user identified Bear Eberly Photos as the business operating the demo and authorized connecting incoming texts to AI interpretation, synthetic reservation creation/logging, and replies. Their supplied business address is kept out of tracked source. A separate new customer profile is being prepared; the existing CSLodi profile/service remain separate. EIN classification, mobile verification/test recipient, and public business website are pending user input. A dedicated OpenAI key named Bear Eberly Reservation SMS was approved for the ignored pitch/.dev.vars file, but creation returned reauthentication required and no key was created. User was asked to reconnect OpenAI Platform. Integration implementation is in progress; no new registration submitted, no terms accepted, and no test texts sent.

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

## September 13, 2026 SMS implementation

Implementation passed local integration validation. New SMS information, privacy, and terms routes identify Bear Eberly Photos and remain visibly setup pending. The homepage was preserved. The protected AI rehearsal endpoint does not create bookings or send texts. Versioned runtime defaults keep texting and paid rehearsal disabled. OpenAI GPT-4.1 mini was selected for structured intent extraction without a reasoning step; actual credentials and latency remain unverified.

Local checks passed: 32 application tests, 21 isolated PostgreSQL SMS regression groups, the Vite production build, Cloudflare Pages Functions compilation, and rendered desktop/mobile SMS pages. The SMS migration was applied successfully to Supabase project tcrbfctksulrwudfmxiv. An authenticated REST health call returned HTTP 200 with demo=true, and the wrong-secret check returned unauthorized. Migration SHA256: 24ea76858636df647893402682537fc8ec01ccbeb0cc715c34c82dfd5c600f3e. Simultaneous PostgreSQL backend contention remains untested; local SQL tests validate lease transitions in a single backend. Standalone TypeScript checking has preexisting TS7 configuration/type errors that are outside this change; the production build succeeds. Cloudflare's browser session is signed in, existing production secrets and the expected production branch are verified, but local Wrangler OAuth is expired. Deployment uses the established GitHub Actions token instead. OpenAI connector reauthentication remains unresolved on a later read-only check. No key or test text has been created or sent.


Deployment verification: GitHub Actions run 34769793447 succeeded and deployed release 7f2e47bb8c8de6666372b2008389f5c95225f0b9. Public /api/demo/health returned ok=true, demo=true, backend=ready, smsDatabaseReady=true, smsEnabled=false and the matching commit. All three SMS pages returned HTTP 200 at their canonical trailing-slash routes with assets index-CoDnZQIl.js and index-B_iFfqBy.css; the SMS program page was also inspected in the browser. An unsigned inbound POST returned empty TwiML 503 because Twilio credentials are not configured. Unauthenticated rehearsal returned 401; operator-authenticated readiness returned database=true, ai=false, webhook=false, allowlist=false, carrierApproved=false, mode=disabled. No provider-facing webhook was changed and no live SMS or AI request was sent. The next action is the user's OpenAI Platform reconnection plus EIN classification, test mobile and business website/support contact, then secure runtime credential setup, carrier registration and a controlled phone test. Full activation instructions are in pitch/README.md.


September 13 provider clarification: the user confirmed Bear Eberly Photos is the exact business name, has no EIN, and uses beareberly.com. The alternative business name in the transcript was a talk-to-text error. Preserve the confirmed name when later dictation varies, and clarify only material identity changes. The user supplied and authorized a personal mobile ending 3242 for Twilio verification and controlled live test messages; its full value belongs only in ignored/private configuration, not tracked notes or public pages. Sole-proprietor registration is the intended path. OpenAI reconnection was attempted again and still returned reauthentication required; no key was created. The user must reconnect the provider because computer control cannot operate Codex's own settings. No canonical Brain Hub record was written because routing remains unverified.


Twilio console continuation: the signed-in billing page verified the expected account. A new separate A2P onboarding tab was opened for Bear Eberly Photos, but its content remained blank and repeated browser-control calls timed out. No profile fields were submitted, fees accepted, credentials copied, or Twilio webhook changed. Resume the fresh onboarding form after browser recovery. The existing user-owned billing tab was left unchanged. The exact business name, no-EIN classification, tester and website are now resolved; OpenAI provider reconnection remains the immediate user action.
