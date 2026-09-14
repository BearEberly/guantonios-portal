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
4. Use the selected-party detail drawer to edit guest name, mobile, party size, date, time, seating, and host notes, then use `Check in`, `Seat`, `Move table`, manual service-stage buttons, `Finish`, or `Cancel` to rehearse reservation service flow.
5. Use the `Wait` rail to add a walk-in, notify the party, and seat it from the floor map.
6. Use the `Notify` queue filter to review guest Notify requests created from unavailable public search times, then mark them notified, booked, or cancelled.
7. Use `Reset demo data` before a new pitch run.

The reset action clears only synthetic demo rows in the private `reservation_demo` Supabase schema, including Notify requests, and reseeds sample dates and tables.

## Timed table availability blocks

The Floor rail can block one table for a specific service window. Set `Floor time`, `Block from`, `Until`, and `Block note`, tap `Block table`, then tap the open table on the floor. The floor map shows the block for the selected service window, and the Timeline view shows the timed block across the matching table row. Clear active blocks from the `Table blocks` section in the right panel.

## No-show handling

Use the selected-party drawer or queue row `No-show` action when a confirmed or checked-in party does not arrive. The iPad keeps no-shows separate from cancellations in queue filters and reports, releases table capacity, and does not send SMS while carrier approval is pending.
