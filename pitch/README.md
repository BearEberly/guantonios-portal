# Guantonio reservation pitch demo

This package is an isolated reservation demo for `res.beareberly.com`. It mirrors the public Guantonio homepage enough for a pitch, replaces the Resy call to action with a synthetic reservation flow, and includes a protected iPad sized operator view.

All reservation rows are synthetic demo rows stored in the private Supabase `reservation_demo` schema. The optional inbound SMS integration is implemented but remains disabled pending provider credentials, carrier approval and a controlled phone test. It is not connected to Resy, payments, email delivery, or live restaurant inventory.

## Routes

- `/` mirrors the Guantonio homepage and links to the demo reservation flow.
- `/reservations` lets a guest search, hold, and confirm a synthetic reservation.
- `/manage` lets the guest view, change, or cancel the synthetic booking with the generated management token.
- `/operator` is a protected internal iPad view for check in, seating status changes, cancellation, floor snapshot, recent holds, and disabled notification previews.
- `/sms`, `/sms/privacy`, and `/sms/terms` describe the separate Bear Eberly Photos SMS demo and its setup status.
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

The API regression covers reset, availability search, hold retry, confirm retry, wrong-token rejection, view, change, cancel, operator list, one-table concurrency, and direct private schema isolation. The Playwright suite covers desktop, iPad sized, and phone sized booking and operator flows, plus automated accessibility smoke checks.

## Resetting demo data

The protected operator route calls `POST /api/demo/operator/reset`, which invokes `public.reservation_demo_reset(secret text)` in Supabase. The reset clears only synthetic demo tables and reseeds sample dates and tables.

## Deployment

Cloudflare Pages project: `res-beareberly`

Production branch: `codex/reservation-pitch`

The GitHub workflow at `.github/workflows/reservations-demo.yml` builds this package and deploys `pitch/dist` to Cloudflare Pages with Wrangler. Runtime values are configured as Cloudflare Pages production secrets, and the GitHub Action uses repository secrets for the Cloudflare account id and API token.

Target hostname: `res.beareberly.com`

## SMS activation handoff

The purchased number is +1 (209) 709-4194. The operating business is Bear Eberly Photos, independent from the restaurant and the existing CSLodi Twilio profile. Preserve demo-only inventory. Do not process the website's old notification previews as a send backlog.

1. Reconnect the OpenAI Platform connector. The user approved creating `Bear Eberly Reservation SMS` in ignored `.dev.vars` as `OPENAI_API_KEY`. Creation failed with reauthentication required; no key was created. Use the encrypted connector/helper flow and never print plaintext credentials.
2. Complete the correct Twilio business profile after the user confirms EIN classification, a non-Twilio verification/test mobile number, and the business website/support contact. Prepare the carrier form for review with exact current fees and terms before submission. The program/consent, privacy, and terms pages are public draft setup disclosures, not evidence of carrier approval.
3. Apply `supabase/migrations/20260913071321_reservation_demo_sms.sql` after the original demo schema. Verify the migration record first to avoid reapplying it. The SMS RPC reuses `DEMO_API_SECRET` and stores its data in the private `reservation_demo` schema with RLS. The read-only `health` operation verifies readiness.
4. Configure production secrets only on Cloudflare Pages `res-beareberly`: `OPENAI_API_KEY`, `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, and `SMS_TEST_ALLOWLIST` (comma-separated approved E.164 mobile numbers). Preserve the existing database and operator secrets. Do not put these in browser JavaScript, git, URLs, or logs. An encrypted Twilio API key cannot replace the account Auth Token for inbound signature checks.
5. Non-secret defaults are versioned in `wrangler.toml`. `SMS_MODE=disabled`, `SMS_CARRIER_APPROVED=false`, and `SMS_AI_REHEARSAL_ENABLED=false` are intentional. `SMS_AI_MODEL=gpt-4.1-mini` is a fast non-reasoning Responses model supporting strict Structured Outputs. Validate actual model latency and account access through the protected rehearsal before enabling SMS. See [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
6. Deploy through the existing GitHub Actions workflow on `codex/reservation-pitch`. Check `/api/demo/health` for the deployed commit and `smsDatabaseReady=true`. An unauthenticated POST to the SMS endpoint must not process a message; a missing webhook secret returns 503, and a configured but invalid signature returns 403. The rehearsal endpoint must reject unauthenticated requests with 401.
7. Once credentials and the deployed endpoint are verified, set the purchased number's incoming message webhook to `https://res.beareberly.com/api/demo/sms/inbound`, HTTP POST. Preserve the voice settings and CSLodi service/number. Replies use TwiML; the application provides the signed status callback URL automatically. Choose explicit Twilio 5xx/timeout retries if needed and validate that retries do not create duplicate bookings.
8. Only after Twilio carrier approval, tester consent, and protected AI rehearsal succeeds, change the versioned flags to `SMS_MODE=test` and `SMS_CARRIER_APPROVED=true`, then redeploy. Set the rehearsal flag true only while testing and disable it afterward. No public/open SMS mode or scheduled reminder sender is implemented.
9. On the authorized test phone, text `START`, then a date/time with AM/PM, party size, and indoor/outdoor/either. Confirm the offered synthetic details with `YES`. Verify exactly one reservation in the operator view. Test `VIEW`, `cancel reservation`, `CONFIRM CANCEL`, `STOP`, an opted-out ordinary request, and `START`. Confirm Twilio delivery records and no duplicate booking after a retry. Update public setup copy only when these results are actually observed.
10. Roll back outbound texting by setting `SMS_MODE=disabled` and redeploying. Preserve opt-out/dedup records. Do not reuse this test setup for live restaurant reservations without a separate restaurant-authorized launch.

The AI extracts intent and criteria only. The server and database determine availability and perform booking actions. Exact `YES` requires a current offered hold; `CONFIRM CANCEL` requires a current offered cancellation of that sender's booking. Plain `CANCEL` is an opt-out keyword. A reply of `VIEW` withdraws a pending cancellation. Raw phone numbers and raw inbound bodies are not persisted in the application database; provider processing is described on the SMS privacy page.

There is a rolling limit of 100 new free-text turns per sender per 24 hours. Above that limit requests receive no paid response, while deterministic safety and recovery commands remain available. Completed MessageSid retries emit empty TwiML to avoid duplicate outbound messages. If Twilio loses the first completed webhook response, its reply can be lost; a new `VIEW` request recovers the saved booking. This does not promise exactly-once delivery. Synchronous requests have bounded timeouts and require measured real-provider latency before activation.

Offline database verification uses actual PostgreSQL through PGlite, no provider keys, and no live data. Install `@electric-sql/pglite@0.5.8` outside tracked files, then run `scripts/sms-database-regression.mjs` with `SMS_TEST_PGLITE_ROOT` pointing to its package directory. It tests lease state transitions but does not simulate simultaneous PostgreSQL backends. `npm test` covers HTTP signatures, provider gates, structured extraction, booking commands, replay suppression and callbacks.
