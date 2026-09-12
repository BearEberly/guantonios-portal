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
4. Use `Check in`, `Seat`, `Finish`, or `Cancel` to rehearse service flow.
5. Use `Reset demo data` before a new pitch run.

The reset action clears only synthetic demo rows in the private `reservation_demo` Supabase schema and reseeds sample dates and tables.
