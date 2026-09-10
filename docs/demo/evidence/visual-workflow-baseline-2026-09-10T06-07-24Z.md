# Guantonio Reservation Pitch Visual And Workflow Baseline

Captured: 2026-09-10T06:07:24Z, 2026-09-09 23:07 PDT

Target: public live sites only.

Safety boundary: no reservation, login, payment, OTP, contact form submission, or booking hold was attempted.

## Scope And Provenance

- Worktree: `/Users/bearbear/Documents/Codex/worktrees/guantonios-reservation-pitch`
- Working branch: `codex/reservation-pitch`
- Branch HEAD: `c4127866abe6cd8b57b22a83d88dd27d05547153`
- `origin/main`: `c4127866abe6cd8b57b22a83d88dd27d05547153`
- Live homepage observed: `https://www.guantonios.com/`
- Live reservation page observed: `https://resy.com/cities/lodi-ca/venues/guantonios-wood-fired?date=2026-09-09&seats=2`
- Browser: Playwright Chromium, headless
- Desktop viewport: 1440 x 1000
- Phone viewport: 390 x 844, mobile user agent, touch enabled

## Markdown Inventory

- `README.md`, sha256 `f9516e57501196c205240fd7ca1b96cad280aaac3f543d0c34488231e28f1ec2`
- Source-only reference read from `/Users/bearbear/Documents/Codex/projects/Guantonios Portal/README.md`, sha256 `39f1ff366e1f5c218491929c3e1a4502a52ae6e1f4e7f62b986898b7cf6f75e8`

No `AGENTS.md`, `ROUTER.md`, or `CONTEXT.md` file was present in the pitch worktree. The parent task supplied the applicable project instructions.

## Homepage Visual Baseline

Observed desktop opening order:

1. Minimal white header with small nav links: Welcome, Menu, Gift Card, Features, Cart.
2. Centered Guantonio's logo and contact line.
3. Red `Book Now` CTA with Resy branding.
4. Large colorful illustrated restaurant exterior.
5. Contact block with phone, email, open hours, and street address next to an embedded Google map.
6. Long restaurant story paragraph beginning with the family-owned restaurant description.
7. Dark footer with Facebook, Instagram, Twitter, large phone number, and address.

Observed phone opening order:

1. Compact header with cart count, centered logo, and hamburger menu.
2. Red `Book Now` CTA with Resy branding over the top of the illustration.
3. Illustrated restaurant exterior.
4. Contact, open hours, location, and embedded map in a single-column layout.
5. Restaurant story paragraph.
6. Dark footer with social links, phone number, and address.

Observed homepage CTA and link behavior:

- `Book Now` links to `https://resy.com/cities/lodi-ca/venues/guantonios-wood-fired`.
- `Menu` links to `https://www.guantonios.com/menu-2`.
- `Gift Card` links to Square gift card ordering.
- `Features` links to `https://www.guantonios.com/features`.
- Social links go to Facebook, Instagram, and Twitter profiles.
- Map opens Google Maps.
- Phone and email are displayed as text in the contact section.

Observed homepage assets:

- Guantonio's wordmark image from Squarespace CDN.
- Color illustrated restaurant exterior/postcard image from Squarespace CDN.
- Google Maps embedded map tiles and marker.
- Footer/social icon styling rendered on dark background.

Visual issue observed on the live homepage:

- On desktop and phone, raw Squarespace button markup text is visibly overlaid across the top of the illustration near the `Book Now` CTA. This appears in the screenshots and DOM text, so it should be treated as a current live-site defect.

## Resy Visual And Workflow Baseline

Observed desktop layout:

1. Resy top bar with location selector, search field, Global Dining Access, For Businesses, and Log in.
2. Venue heading: `Guantonio's Wood Fired`.
3. Rating shown as `4.9 (254) reviews`, category `Pizza`, price marker `$`, and location `Lodi`.
4. Share and Save controls.
5. Booking filter row with Guests, Date, and Time.
6. Availability area showed a loading indicator during capture, with no visible time-slot buttons in the captured initial state.
7. Need to Know section.
8. About Guantonio's Wood Fired section with `Read more`.
9. Right-side venue photo, map card, address, social links, directions, phone, and homepage link.
10. Resy app promotional section and footer.

Observed phone layout:

1. Resy mobile header with logo, Lodi selector, search icon, and menu icon.
2. Venue photo appears first.
3. Venue heading, rating, category, price marker, and location.
4. Share and Save controls.
5. Segmented booking filter row with `2 Guests`, `Today`, and `All Day`.
6. Availability area showed a loading indicator during capture, with no visible time-slot buttons in the captured initial state.
7. Need to Know, About, venue info card, app promo, and footer stack vertically.

Observed Resy visible fields and states:

- Desktop search input placeholder: `Search restaurants, cuisines, etc.`
- Party size select default: `2 Guests`
- Date selector default: `Today`
- Time select default: `All Day`
- Phone shows the same party size, date, and time controls, with search represented by an icon in the header.
- `Log in`, `Share`, `Save`, `Read more`, city selector, date selector, and mobile menu are visible controls.
- `Book Tonight` link is visible and points to Resy's Lodi book-tonight list with the current date and 2 seats.

Observed Resy venue content:

- Need to Know says guests should be mindful of neighbors and not block driveways.
- Need to Know says checks are not separated, with multiple payment types accommodated per table.
- Address shown: 600 W Lockeford St, Lodi, CA 95240.
- Phone link shown: +1 209 263 7152.
- Website link shown: `https://www.guantonios.com/`.
- Social links shown for Facebook and Instagram.

## Evidence Files

- `browser-baseline-2026-09-10T06-07-24-250Z.json`: raw browser observations.
- `browser-baseline-2026-09-10T06-07-24-250Z.md`: generated browser observation log.
- `guantonios-home-desktop-top-2026-09-10T06-07-24-250Z.png`
- `guantonios-home-desktop-scroll1-2026-09-10T06-07-24-250Z.png`
- `guantonios-home-desktop-full-2026-09-10T06-07-24-250Z.png`
- `guantonios-home-phone-top-2026-09-10T06-07-24-250Z.png`
- `guantonios-home-phone-scroll1-2026-09-10T06-07-24-250Z.png`
- `guantonios-home-phone-full-2026-09-10T06-07-24-250Z.png`
- `resy-guantonios-desktop-top-2026-09-10T06-07-24-250Z.png`
- `resy-guantonios-desktop-full-2026-09-10T06-07-24-250Z.png`
- `resy-guantonios-phone-top-2026-09-10T06-07-24-250Z.png`
- `resy-guantonios-phone-full-2026-09-10T06-07-24-250Z.png`

## Proposed Demo Choices

None. This baseline records only observed current behavior and visible state.
