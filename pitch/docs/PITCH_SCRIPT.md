# Five-minute Guantonio reservation demo pitch script

## 0:00 to 0:30, problem framing

Guantonio currently relies on Resy for guest booking and iPad service operations. The pain point we are solving is reliability. If the reservation surface says there is no availability when availability should exist, guests cannot reserve tables and the staff cannot trust the tool during service.

This pitch demo shows a focused replacement for one restaurant. It is synthetic, but the core mechanics are real: availability is read from shared data, holds expire, confirmations persist, and the iPad operator view sees the same booking state.

## 0:30 to 1:15, homepage handoff

Start at the homepage. The page keeps the current Guantonio look, artwork, layout, contact details, hours, and footer structure. The key change is the reservation call to action. Instead of sending guests to Resy, the button sends them into the restaurant controlled reservation flow.

Point out the demo labels. The pitch is intentionally clear that this is not live inventory and does not create a real reservation yet.

## 1:15 to 2:20, guest booking flow

Open `/reservations`. Search for two guests at 7:30 PM. The app returns indoor and outdoor availability from the restricted Supabase demo schema.

Choose a slot. The app creates a finite hold, which is the important reliability behavior. A held table is removed from availability while the guest completes the form, and the hold can expire safely if the guest abandons the booking.

Confirm the reservation. The app creates a synthetic confirmation reference and stores a management token in the browser session so the guest can view or change the booking without exposing operator access.

## 2:20 to 3:10, guest management

Open the management link from the confirmation card. Load the booking. Change the reservation from indoor to outdoor or change the time. The app reallocates table capacity transactionally and shows a clear success state.

Cancel the booking. The booking status changes to cancelled and the table capacity is returned.

## 3:10 to 4:10, iPad operator view

Open `/operator`. Enter the operator passcode from the trusted local environment or Cloudflare Pages secret. The operator view is designed for iPad use during service.

Show the reservations list, status actions, floor snapshot, recent holds, and disabled notification adapter. Staff can check in, seat, finish, or cancel a demo reservation. The same Supabase-backed data is shared between the guest flow and operator view.

Use the reset button when the demo needs to return to a clean state.

## 4:10 to 5:00, reliability and launch path

Explain the reliability improvements demonstrated here:

- A single source of truth in Supabase for bookings, holds, allocations, and notification previews.
- Restricted database schema with access only through server-held secrets and narrow RPC functions.
- Idempotency keys for hold and confirmation retries.
- Concurrency protection so one last table cannot be double-booked.
- Expired holds automatically return capacity.
- No real SMS, email, payment, Resy write, or live booking side effects in the pitch demo.

For real launch, the remaining work is production hardening: real venue rules, staff authentication, audit policy, SMS provider registration, guest messaging, monitoring, backup/export workflow, and a controlled migration plan away from Resy.
