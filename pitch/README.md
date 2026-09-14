# Guantonio reservation pitch demo

This package is an isolated reservation demo for `res.beareberly.com`. It mirrors the public Guantonio homepage enough for a pitch, replaces the Resy call to action with a synthetic reservation flow, and includes a protected iPad sized operator view.

All reservation rows are synthetic demo rows stored in the private Supabase `reservation_demo` schema. The optional inbound SMS integration has its production AI and Twilio credentials installed but remains disabled pending campaign approval and a controlled phone test. It is not connected to Resy, payments, email delivery, or live restaurant inventory.

## Routes

- `/` mirrors the Guantonio homepage and links to the demo reservation flow.
- `/reservations` lets a guest search, hold, and confirm a synthetic reservation. When the exact requested time is unavailable, it can add a consented synthetic Notify request for the iPad queue.
- `/manage` lets the guest view, change, or cancel the synthetic booking with the generated management token.
- `/operator` is a protected internal iPad view for check in, seating status changes, timed table availability blocks, manual service-stage tracking, cancellation, floor snapshot, Notify requests, waitlist, Texts readiness, recent holds, and reset.
- `/sms`, `/sms/privacy`, and `/sms/terms` describe the separate Bear Eberly Photos SMS demo and its setup status.
- `/api/demo/notify` creates a protected synthetic Notify request from the public reservation flow.
- `/api/demo/operator/notify` requires the operator token and lists or updates Notify requests for the iPad queue.
- `/api/demo/sms/inbound` accepts signed Twilio form webhooks.
- `/api/demo/sms/status` accepts signed delivery callbacks tied to an inbound MessageSid.
- `/api/demo/sms/rehearse` requires the operator token; GET shows configuration readiness, and separately enabled POST interprets one sample text without bookings or SMS.

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

The API regression covers reset, availability search, Notify creation and operator update, timed table block creation and blocked-table seating rejection, hold retry, confirm retry, wrong-token rejection, view, protected operator table assignment, change, cancel, operator list, one-table concurrency, and direct private schema isolation. The Playwright suite covers desktop, iPad sized, and phone sized booking and operator flows, plus automated accessibility smoke checks.

## Resetting demo data

The protected operator route calls `POST /api/demo/operator/reset`, which invokes `public.reservation_demo_reset(secret text)` in Supabase. The reset clears only synthetic demo tables, including Notify requests, and reseeds sample dates and tables.

## Deployment

Cloudflare Pages project: `res-beareberly`

Production branch: `codex/reservation-pitch`

The GitHub workflow at `.github/workflows/reservations-demo.yml` builds this package and deploys `pitch/dist` to Cloudflare Pages with Wrangler. Runtime values are configured as Cloudflare Pages production secrets, and the GitHub Action uses repository secrets for the Cloudflare account id and API token.

Target hostname: `res.beareberly.com`

## SMS activation handoff

The purchased number is +1 (209) 709-4194. The operating business is Bear Eberly Photos, independent from the restaurant and the existing CSLodi Twilio profile. Preserve demo-only inventory. Do not process the website's old notification previews as a send backlog.

1. The OpenAI Platform connector was reconnected and the approved key `Bear Eberly Reservation SMS` was created in ignored `.dev.vars` as `OPENAI_API_KEY`, then installed in Cloudflare production. Verify presence without printing it; do not create another key. Three local and three live real-API extraction checks passed. Any future key replacement must use the encrypted connector/helper flow and keep plaintext credentials out of output.
2. The Bear Eberly Photos Sole Proprietor brand is approved and its identity is verified (Brand SID BN14e9b9a0408d8bbf95e53dd28493d4cb). The separate campaign CM8d44946c7f70495989a50cad69b9cf3f was rejected with Twilio Error 30896 because the opt-in details were not sufficient for carrier review. The user confirmed no EIN and beareberly.com; the authorized verification/test mobile is saved as SMS_TEST_ALLOWLIST in ignored .dev.vars. Use the confirmed business name; a different transcribed name was a talk-to-text error. The program/consent, privacy, and terms pages now include website checkbox consent proof and public START keyword opt-in proof, but they are still not evidence of carrier approval.
3. The migration `supabase/migrations/20260913071321_reservation_demo_sms.sql` is already applied and its readiness has been verified. Do not reapply it. Later reset guard migrations are also applied: `20260914011207_reservation_demo_reset_sms_truncate_guard.sql`, `20260914011337_reservation_demo_reset_inline_sms_invalidation.sql`, `20260914011500_reservation_demo_reset_skip_sms_conversation_parent_update.sql`, and `20260914011542_reservation_demo_reset_without_sms_updates.sql`. The operator table-assignment migration `20260914015044_operator_table_assignment.sql` is also applied and adds the protected assignment RPC used by the iPad floor workflow. The live migration history also shows a duplicate same-name connector entry at `20260914015152`; do not reapply it just to reconcile that display. These preserve reliable operator reset while SMS remains disabled. The SMS RPC reuses `DEMO_API_SECRET` and stores its data in the private `reservation_demo` schema with RLS. The read-only `health` operation verifies readiness. The operator waitlist migration `20260914033228_operator_waitlist.sql` is applied and adds the protected `reservation_demo_operator_waitlist` RPC used by the iPad Wait rail. The operator pacing migration `20260914072605_operator_pacing_rules.sql` is applied and adds the protected `reservation_demo_operator_pacing` RPC plus private per-slot cap rules used by the iPad Availability and Reports rails. The operator service-stage migrations `20260914075641_operator_service_stages.sql` and `20260914084300_operator_service_stage_invalid_guard.sql` are applied and add the protected `reservation_demo_operator_service` RPC used by the iPad Manual service stage controls. The Supabase connector records those live migrations as `operator_service_stages` and `operator_service_stage_invalid_guard` with connector-generated version timestamps. The operator Notify migration `20260914082500_operator_notify_requests.sql` is applied and adds the private `reservation_demo.notify_requests` table plus server-secret-gated public and operator Notify RPCs.
4. Cloudflare Pages `res-beareberly` already has verified production `OPENAI_API_KEY` and `SMS_TEST_ALLOWLIST` settings. Production `TWILIO_AUTH_TOKEN` and `TWILIO_ACCOUNT_SID` are also installed; authenticated readiness verified webhook=true. Do not recreate or print these credentials. The allowlist contains only the user's approved test mobile. Preserve the existing database and operator secrets. Do not put these in browser JavaScript, git, URLs, or logs. A Twilio API key cannot replace the account Auth Token for inbound signature checks.
5. Non-secret defaults are versioned in `wrangler.toml`. `SMS_MODE=disabled`, `SMS_CARRIER_APPROVED=false`, and `SMS_AI_REHEARSAL_ENABLED=false` are intentional. `SMS_AI_MODEL=gpt-4.1-mini` is a fast non-reasoning Responses model supporting strict Structured Outputs. Validate actual model latency and account access through the protected rehearsal before enabling SMS. See [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
6. Deploy through the existing GitHub Actions workflow on `codex/reservation-pitch`. Check `/api/demo/health` for the deployed commit and `smsDatabaseReady=true`. An unauthenticated POST to the SMS endpoint must not process a message; a missing webhook secret returns 503, and a configured but invalid signature returns 403. The rehearsal endpoint must reject unauthenticated requests with 401.
7. The purchased number is the only sender in dedicated service MG9897218cd0225c713874bc0733f26971. That service is linked to submitted campaign CM8d44946c7f70495989a50cad69b9cf3f and routes incoming messages to `https://res.beareberly.com/api/demo/sms/inbound`, HTTP POST. The service route overrides the number's former default webhook. Preserve voice settings and CSLodi service/number. Replies use TwiML; the application provides the signed status callback URL automatically. Choose explicit Twilio 5xx/timeout retries if needed and validate that retries do not create duplicate bookings.
8. Only after the campaign is VERIFIED, the purchased number is REGISTERED for that exact campaign/service, tester consent is confirmed, and protected AI rehearsal succeeds, change the versioned flags to `SMS_MODE=test` and `SMS_CARRIER_APPROVED=true`, then redeploy. Set the rehearsal flag true only while testing and disable it afterward. No public/open SMS mode or scheduled reminder sender is implemented.
9. On the authorized test phone, text `START`, then a date/time with AM/PM, party size, and indoor/outdoor/either. Confirm the offered synthetic details with `YES`. Verify exactly one reservation in the operator view. Test `VIEW`, `cancel reservation`, `CONFIRM CANCEL`, `STOP`, an opted-out ordinary request, and `START`. Confirm Twilio delivery records and no duplicate booking after a retry. Update public setup copy only when these results are actually observed.
10. Roll back outbound texting by setting `SMS_MODE=disabled` and redeploying. Preserve opt-out/dedup records. Do not reuse this test setup for live restaurant reservations without a separate restaurant-authorized launch.

The existing GitHub deployment token can install named production secrets without new local Cloudflare OAuth. The Twilio setup uses a separate default-false `configure_twilio_secrets` input and temporary encrypted Actions secrets `RESERVATION_SETUP_TWILIO_ACCOUNT_SID` and `RESERVATION_SETUP_TWILIO_AUTH_TOKEN`. Its verified setup run was 34792213415; those temporary secrets were removed after production verification. Do not rerun either setup input without preparing its required secrets. The following AI setup path is retained for an explicitly authorized future replacement: For the explicit manual setup run only, provide encrypted Actions secrets `RESERVATION_SETUP_OPENAI_API_KEY` and `RESERVATION_SETUP_SMS_TEST_ALLOWLIST` through stdin, then dispatch `reservations-demo.yml` on `codex/reservation-pitch` with `configure_sms_secrets=true`. The upload step passes them through stdin to pinned Wrangler and changes only the named production secrets on `res-beareberly`. Remove the temporary GitHub secrets after the Cloudflare copy is verified. Ordinary deployments default to skipping this setup step. Do not expose secrets during the frontend build, in artifacts, or in logs.

The AI extracts intent and criteria only. The server and database determine availability and perform booking actions. Exact `YES` requires a current offered hold; `CONFIRM CANCEL` requires a current offered cancellation of that sender's booking. Plain `CANCEL` is an opt-out keyword. A reply of `VIEW` withdraws a pending cancellation. Raw phone numbers and raw inbound bodies are not persisted in the application database; provider processing is described on the SMS privacy page.

There is a rolling limit of 100 new free-text turns per sender per 24 hours. Above that limit requests receive no paid response, while deterministic safety and recovery commands remain available. Completed MessageSid retries emit empty TwiML to avoid duplicate outbound messages. If Twilio loses the first completed webhook response, its reply can be lost; a new `VIEW` request recovers the saved booking. This does not promise exactly-once delivery. Synchronous requests have bounded timeouts and require measured real-provider latency before activation.

Offline database verification uses actual PostgreSQL through PGlite, no provider keys, and no live data. Install `@electric-sql/pglite@0.5.8` outside tracked files, then run `scripts/sms-database-regression.mjs` with `SMS_TEST_PGLITE_ROOT` pointing to its package directory. It tests lease state transitions but does not simulate simultaneous PostgreSQL backends. `npm test` covers HTTP signatures, provider gates, structured extraction, booking commands, replay suppression and callbacks.

For the complete handler workflow using real OpenAI and the demo database, run `SMS_PROVIDER_SIMULATION=1 node scripts/sms-provider-simulation.mjs` from `pitch/` with Node 22 or newer and the ignored local credentials present. This explicit simulation creates and cancels one synthetic booking, leaves its audit records and opted-out synthetic sender, and checks that existing bookings remain unchanged. It blocks Twilio and all network destinations except the two demo Supabase RPCs and OpenAI Responses endpoint. Production flags remain disabled. It does not prove carrier approval, Cloudflare webhook routing, or phone delivery. All 14 simulation checks passed on September 13, including confirmation, replay suppression, cancellation, and STOP/START.

Activation detail: reserve `YES` for booking confirmation. Twilio Advanced Opt-Out has the saved opt-in list `START, UNSTOP, RESUME` and must not consume `YES` as `OptOutType=START`. Save and verify keyword settings on the dedicated Bear Eberly Photos Reservation Demo service (MG9897218cd0225c713874bc0733f26971), then enable at carrier-ready activation. Twilio keyword auto-replies run independently of application SMS_MODE and its tester allowlist; disabling Advanced Opt-Out later requires Twilio Support. The new console restored YES when the optional keyword field was empty; saving the extra RESUME keyword removed YES, and the persisted list was verified after navigating away and back. RESUME is a provider opt-in keyword forwarded as OptOutType=START; ordinary application commands remain START and UNSTOP. The application supplies the per-reply delivery callback with an inboundMessageSid query parameter, so leave the generic service status callback blank unless a separate compatible endpoint is implemented.

The live consent screenshot for carrier review is https://res.beareberly.com/sms-consent-proof.png, captured from the real program page. Regenerate it after any material consent-page change. Campaign CM8d44946c7f70495989a50cad69b9cf3f was submitted in Twilio One Console under the approved brand and dedicated service, with Via Text selected and the screenshot cited, then rejected with Error 30896 for insufficient opt-in details. Do not create a duplicate campaign or resubmit paid vetting blindly. The $15 vetting fee is non-refundable and the $2 monthly campaign fee is separate from the approved brand registration. The user already approved the original fee plus $2/month with the precheck limitation disclosed. The proof page and screenshot were revised after rejection to make the START keyword opt-in flow explicit, including the website URL, privacy URL, terms URL, hosted screenshot URL, frequency, rates, STOP and HELP. Use the revised URLs and message-flow text when resubmitting the same campaign if Twilio permits edits. A follow-up review-hardening pass printed the full absolute privacy, terms, reservation, program, and hosted screenshot URLs directly in the public proof page body and regenerated the proof image. If Twilio locks required fields, note that a new campaign may be required and can incur another fee.

Recommended resubmission `message_flow`: Approved testers are invited by the Bear Eberly Photos operator to review the public SMS proof and disclosure page at https://res.beareberly.com/sms/. That page identifies the sender as Bear Eberly Photos Reservation Demo, explains that this is a synthetic reservation demo, lists the program number +1 (209) 709-4194, states that SMS participation is optional and not a condition of purchase or web demo use, and links to https://res.beareberly.com/sms/privacy/ and https://res.beareberly.com/sms/terms/. The page displays a public opt-in proof form with a mobile-number field and an unchecked consent checkbox. The checkbox copy states that the tester agrees to receive automated text replies about the requested table, including availability, confirmation, status and cancellation messages, that message frequency varies, that message and data rates may apply, and that STOP opts out and HELP provides help. The same consent language appears in the reservation web flow when a tester requests Notify or optional reservation text updates. A tester can also opt in after reviewing the disclosures by sending START from their own mobile phone to +1 (209) 709-4194. No one is enrolled by default and no marketing subscription is included. Hosted proof screenshot: https://res.beareberly.com/sms-consent-proof.png.

The new campaign Assigned phone numbers tab initially showed no entries while In review, but the exact associated service was independently reloaded and still contained only the purchased demo number. The service Compliance tab showed the same campaign description and In progress status. Do not remove/re-add the number or create another campaign just to change this display. Verify the number registration report after campaign approval; service membership alone does not prove REGISTERED carrier status.
