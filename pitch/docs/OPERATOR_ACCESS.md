# Protected operator access

The operator demo lives at `/operator` on the deployed reservation demo site.

Current operator URL:

- `https://res.beareberly.com/operator`

Pages fallback URL:

- `https://res-beareberly.pages.dev/operator`

## Passcode source

The operator passcode is intentionally not committed to Git and should not be pasted into public notes or chat. It is stored in two trusted places:

- Local development: `pitch/.dev.vars` as `DEMO_OPERATOR_TOKEN`
- Production Cloudflare Pages project: `res-beareberly` production secret `DEMO_OPERATOR_TOKEN`

## Staff demo flow

1. Open the operator URL on the iPad.
2. Enter the operator passcode.
3. Tap `Open operator view`.
4. Use `Check in`, `Seat`, `Move table`, manual service-stage buttons, `Finish`, or `Cancel` to rehearse reservation service flow.
5. Use the `Wait` rail to add a walk-in, notify the party, and seat it from the floor map.
6. Use the `Notify` queue filter to review guest Notify requests created from unavailable public search times, then mark them notified, booked, or cancelled.
7. Use `Reset demo data` before a new pitch run.

The reset action clears only synthetic demo rows in the private `reservation_demo` Supabase schema, including Notify requests, and reseeds sample dates and tables.
