import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { cancelReservation, changeReservation, confirmReservation, createHold, operatorList, operatorReset, operatorStatus, searchAvailability, viewReservation } from './api';
import type { AvailabilitySlot, HoldResult, OperatorState, ReservationSummary, SeatingSection } from './types';
import { formatLocalDate, formatLocalTime, isoDateInLosAngeles, makeIdempotencyKey, nextBookableDate, statusLabel } from './utils';
import './styles.css';
import { SmsInfoPage } from './sms-info';

function App() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/') return <HomePage />;
  if (path === '/reservations') return <ReservationsPage />;
  if (path === '/manage') return <ManagePage />;
  if (path === '/operator') return <OperatorPage />;
  if (path === '/sms' || path === '/sms/privacy' || path === '/sms/terms') return <SmsInfoPage path={path} />;
  return <NotFound />;
}

function HomePage() {
  return (
    <main className="home-page">
      <p className="sr-only">Synthetic reservation pitch demo. The homepage mirrors the public Guantonio site and replaces the Resy action with a demo booking flow.</p>
      <header className="home-header" aria-label="Guantonio home header">
        <nav className="home-nav" aria-label="Primary">
          <a href="/" aria-current="page">Welcome</a>
          <a href="https://www.guantonios.com/menu-2">Menu</a>
          <a href="https://www.guantonios.com/online-store">Gift Card</a>
          <a href="https://www.guantonios.com/features">Features</a>
        </nav>
        <a className="logo-link" href="/" aria-label="Guantonio's Wood Fired home">
          <img src="/assets/official-logo-clean.png" alt="Guantonio's Wood Fired, 600 West Lockeford Street, Lodi, California" />
        </a>
        <span className="cart-copy">Cart (0)</span>
      </header>
      <div className="mobile-topline">
        <span>Cart (0)</span>
        <button type="button" aria-label="Open menu">Menu</button>
      </div>
      <section className="booking-badge" aria-label="Booking call to action">
        <a href="/reservations" className="resy-replacement">Reserve a table <span>Demo</span></a>
      </section>
      <section className="storefront-wrap" aria-label="Guantonio storefront illustration">
        <img src="/assets/storefront-crop.png" alt="Illustrated Guantonio storefront with blue windows, golden patio, and California sky" />
      </section>
      <section className="visit-grid" aria-labelledby="visit-heading">
        <div>
          <h1 id="visit-heading" className="sr-only">Visit Guantonio's</h1>
          <h2>Contact</h2>
          <p>(209) 263-7152</p>
          <p>guantonios@gmail.com</p>
          <h2>Open Hours</h2>
          <p>Tuesday - Thursday 5 pm - 8 pm</p>
          <p>Friday &amp; Saturday 5 pm - 9 pm</p>
          <h2>Location</h2>
          <p>600 West Lockeford Street</p>
          <p>Lodi, Ca 95240</p>
        </div>
        <a className="map-tile" href="https://maps.google.com/?q=600%20W%20Lockeford%20Street%20Lodi%20CA%2095240" aria-label="Open Guantonio's location in Google Maps">
          <span className="map-pin" aria-hidden="true"></span>
        </a>
      </section>
      <section className="story-copy" aria-label="Restaurant story">
        <p>Guantonios is a family owned and operated restaurant. We are focused on, and inspired by, the beauty that is Northern California agriculture. We have catered events all over Northern California for the past 10 years and are excited to open our first restaurant here in Lodi. The medium we chose to introduce our food philosophy, is Pizza. We believe it is the perfect canvas to present the beautiful produce grown in the region, as well as our straightforward approach to food (plus who doesn’t love pizza!). Our dough is naturally leavened, using Organic, Non-GMO flour, which translates to healthier and more flavorful crust! Both the food and wine menu will be influenced by the current season and what is at its peak quality. Our “Family Style” approach to the restaurant applies not only to the way we hope our guests enjoy the food, but the atmosphere that is projected and the basis of how this restaurant came to be. Cheers!</p>
      </section>
      <footer className="home-footer">
        <div className="footer-links">
          <a href="https://www.facebook.com/guantonios">Facebook</a>
          <a href="https://www.instagram.com/guantonios">Instagram</a>
          <a href="https://twitter.com/guantonios">Twitter</a>
        </div>
        <h2>GUANTONIOS WOOD FIRED 209-263-7152</h2>
        <p>600 W. Lockeford Street, Lodi, CA 95240</p>
      </footer>
    </main>
  );
}

function ReservationsPage() {
  const [date, setDate] = useState(nextBookableDate());
  const [time, setTime] = useState('19:30');
  const [partySize, setPartySize] = useState(2);
  const [section, setSection] = useState('');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selected, setSelected] = useState<{ slot: AvailabilitySlot; section: SeatingSection } | null>(null);
  const [hold, setHold] = useState<HoldResult | null>(null);
  const [status, setStatus] = useState('Choose guests, date, and time to search synthetic demo availability.');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<BookingResult | null>(null);
  const dates = useMemo(() => Array.from({ length: 10 }, (_, i) => isoDateInLosAngeles(i)), []);
  const criteriaChangedAfterMount = useRef(false);

  useEffect(() => {
    if (!criteriaChangedAfterMount.current) {
      criteriaChangedAfterMount.current = true;
      return;
    }
    setSlots([]);
    setSelected(null);
    setHold(null);
    setConfirmed(null);
    setStatus('Criteria changed. Search again so a stale slot cannot be booked.');
  }, [date, time, partySize, section]);

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setSelected(null);
    setHold(null);
    setConfirmed(null);
    setStatus('Checking live demo inventory...');
    try {
      const result = await searchAvailability({ date, time, partySize, section });
      if (!result.ok) throw new Error(result.error || 'Search failed');
      setSlots(result.slots || []);
      setStatus(result.available ? 'Choose a demo time and seating area.' : noAvailabilityCopy(result.reason));
    } catch (error) {
      setStatus(`Backend error: ${error instanceof Error ? error.message : 'Availability could not be checked.'}`);
    } finally {
      setBusy(false);
    }
  }

  async function startHold(slot: AvailabilitySlot, choice: SeatingSection) {
    setBusy(true);
    setStatus('Creating a finite demo hold...');
    try {
      const result = await createHold({ date: slot.date, time: slot.time, partySize, section: choice, idempotencyKey: makeIdempotencyKey('hold') });
      if (!result.ok || !result.holdId || !result.holdToken) throw new Error(result.error || 'Slot is no longer available');
      setSelected({ slot, section: choice });
      setHold(result);
      setStatus('Hold created. Complete the demo form before the timer expires.');
      window.setTimeout(() => document.getElementById('firstName')?.focus(), 100);
    } catch (error) {
      setStatus(`Hold failed: ${error instanceof Error ? error.message : 'The selected slot was taken.'}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hold?.holdId || !hold.holdToken) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setStatus('Confirming the demo booking transactionally...');
    try {
      const result = await confirmReservation({
        holdId: hold.holdId,
        holdToken: hold.holdToken,
        idempotencyKey: makeIdempotencyKey('confirm'),
        firstName: String(form.get('firstName') || ''),
        lastName: String(form.get('lastName') || ''),
        email: String(form.get('email') || ''),
        mobile: String(form.get('mobile') || ''),
        request: String(form.get('request') || '')
      });
      if (!result.ok || !result.reference || !result.manageToken) throw new Error(result.error || 'Confirmation failed');
      sessionStorage.setItem(`demoManage:${result.reference}`, result.manageToken);
      setConfirmed(result);
      setStatus('Demo reservation confirmed. No real table, email, or text was created.');
    } catch (error) {
      setStatus(`Confirmation failed: ${error instanceof Error ? error.message : 'Please search again.'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="booking-page">
      <header className="booking-topbar" aria-label="Reservation demo header">
        <a className="brand-mark" href="/" aria-label="Return to Guantonio homepage">Guantonio's</a>
        <nav className="booking-nav" aria-label="Reservation sections">
          <a href="#availability">Book</a>
          <a href="#details">Details</a>
          <a href="/manage">Manage</a>
        </nav>
        <a className="operator-link" href="/operator">iPad operator</a>
      </header>
      <section className="booking-hero" aria-labelledby="reservation-title">
        <div className="hero-copy">
          <p className="demo-tag">Synthetic demo only</p>
          <h1 id="reservation-title">Guantonio's Wood Fired</h1>
          <p className="venue-meta">Pizza · $ · Lodi · 600 W Lockeford St</p>
          <div className="venue-actions" aria-label="Venue quick facts">
            <span>4.9 demo rating</span>
            <span>Indoor and outdoor seating</span>
            <span>Tuesday through Saturday dinner</span>
          </div>
        </div>
        <div className="hero-card" aria-label="Selected search summary">
          <span>Searching for</span>
          <strong>{partySize} {partySize === 1 ? 'guest' : 'guests'} at {time}</strong>
          <p>{new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </section>
      <section className="booking-shell">
        <div className="booking-main">
          <form id="availability" className="search-card" onSubmit={runSearch} aria-label="Search demo reservations">
            <label>
              <span>Guests</span>
              <select value={partySize} onChange={event => setPartySize(Number(event.target.value))}>
                {Array.from({ length: 8 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} {n === 1 ? 'Guest' : 'Guests'}</option>)}
              </select>
            </label>
            <label>
              <span>Date</span>
              <input type="date" value={date} min={isoDateInLosAngeles(0)} max={isoDateInLosAngeles(30)} onChange={event => setDate(event.target.value)} />
            </label>
            <label>
              <span>Time</span>
              <select value={time} onChange={event => setTime(event.target.value)}>
                {['17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              <span>Seating</span>
              <select value={section} onChange={event => setSection(event.target.value)}>
                <option value="">Any</option>
                <option value="indoor">Indoor</option>
                <option value="outdoor">Outdoor</option>
              </select>
            </label>
            <button type="submit" disabled={busy}>{busy ? 'Searching...' : 'Search'}</button>
          </form>
          <div className="booking-tabs" aria-label="Venue navigation">
            <a href="#availability" aria-current="page">Reservations</a>
            <a href="#details">Need to Know</a>
            <a href="#location">Location</a>
          </div>
          <div className="date-ribbon" aria-label="Quick dates">
            {dates.map(d => (
              <button key={d} className={d === date ? 'active' : ''} onClick={() => setDate(d)} type="button">
                <span>{new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <strong>{new Date(`${d}T12:00:00`).getDate()}</strong>
              </button>
            ))}
          </div>
          <p className="status-line" role="status">{status}</p>
          <section className="slot-list" aria-label="Available demo times">
            {slots.map(slot => (
              <article className="slot-card" key={slot.slotId}>
                <div className="slot-time">
                  <strong>{slot.displayTime}</strong>
                  <span>{slot.exact ? 'Matches your search' : 'Nearby demo availability'}</span>
                </div>
                <div className="seat-options">
                  {slot.seating.map(seat => (
                    <button key={`${slot.slotId}-${seat.section}`} aria-label={seat.label} type="button" onClick={() => startHold(slot, seat.section)} disabled={busy}>
                      <span>{seat.label}</span>
                      <small>{seat.section === 'indoor' ? 'Dining room' : 'Patio'}</small>
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </section>
          {hold && selected && !confirmed && (
            <section className="booking-dialog" aria-labelledby="booking-form-title">
              <div className="summary-box">
                <p>Held until {hold.expiresAt ? formatLocalTime(hold.expiresAt) : 'soon'}</p>
                <strong>{selected.slot.displayTime}, {formatLocalDate(selected.slot.startsAt)}</strong>
                <span>{partySize} guests · {selected.section} · table {hold.tableCode}</span>
              </div>
              <form onSubmit={submitBooking} className="guest-form">
                <h2 id="booking-form-title">Confirm demo reservation</h2>
                <p>This form demonstrates proposed fields. Entries are not retained as real guest records.</p>
                <div className="field-row">
                  <label htmlFor="firstName">First name<input id="firstName" name="firstName" required defaultValue="Demo" autoComplete="given-name" /></label>
                  <label htmlFor="lastName">Last name<input id="lastName" name="lastName" required defaultValue="Guest" autoComplete="family-name" /></label>
                </div>
                <label htmlFor="email">Email<input id="email" name="email" required type="email" defaultValue="demo@example.invalid" autoComplete="email" /></label>
                <label htmlFor="mobile">Mobile<input id="mobile" name="mobile" required defaultValue="(209) 555-0199" autoComplete="tel" /></label>
                <label htmlFor="request">Optional request<textarea id="request" name="request" maxLength={160} defaultValue="Demo note, not saved to a real guest profile." /></label>
                <p className="demo-warning">No real reservation, email, text message, payment, or Resy account action will happen.</p>
                <button type="submit" disabled={busy}>{busy ? 'Confirming...' : 'Confirm demo reservation'}</button>
              </form>
            </section>
          )}
          {confirmed?.reference && (
            <Confirmation result={confirmed} />
          )}
          <section id="details" className="info-sections">
            <div>
              <h2>Need to Know</h2>
              <p>This is a synthetic pitch demo using sample Guantonio-style hours and table capacity. It does not create or replace a real restaurant reservation.</p>
              <p><a href="/sms">SMS demo information, consent, and privacy</a></p>
            </div>
            <div>
              <h2>About Guantonio's Wood Fired</h2>
              <p>Family owned, naturally leavened pizza, seasonal Northern California produce, and a warm Lodi dining room.</p>
            </div>
          </section>
        </div>
        <aside className="booking-aside" aria-label="Venue media and location">
          <div className="aside-photo">
            <img src="/assets/storefront-crop.png" alt="Guantonio storefront illustration" />
            <span>Guantonio's Wood Fired</span>
          </div>
          <div id="location" className="aside-map">
            <strong>600 W Lockeford St</strong>
            <span>Lodi, CA 95240</span>
          </div>
          <div className="aside-panel">
            <h2>Demo operations</h2>
            <p>Employees use the protected iPad view to check in, seat, finish, cancel, and reset synthetic bookings.</p>
            <a href="/operator">Protected demo operator view</a>
          </div>
        </aside>
      </section>
    </main>
  );
}

function Confirmation({ result }: { result: BookingResult }) {
  const manageHref = `/manage?ref=${encodeURIComponent(result.reference || '')}`;
  return (
    <section className="confirmation-card" aria-labelledby="confirmation-title">
      <h2 id="confirmation-title">Demo reservation confirmed</h2>
      <p className="reference">{result.reference}</p>
      <p>{result.startsAt ? `${formatLocalDate(result.startsAt)} at ${formatLocalTime(result.startsAt)}` : ''}</p>
      <p>{result.partySize} guests · {result.section}</p>
      <p>No real table, email, or text was created. The management key is stored only in this browser session.</p>
      <a href={manageHref}>View or change this demo reservation</a>
    </section>
  );
}

function ManagePage() {
  const params = new URLSearchParams(window.location.search);
  const initialRef = params.get('ref') || '';
  const [reference, setReference] = useState(initialRef);
  const [token, setToken] = useState(initialRef ? sessionStorage.getItem(`demoManage:${initialRef}`) || '' : '');
  const [reservation, setReservation] = useState<ReservationSummary | null>(null);
  const [date, setDate] = useState(nextBookableDate());
  const [time, setTime] = useState('19:00');
  const [partySize, setPartySize] = useState(2);
  const [section, setSection] = useState<SeatingSection>('indoor');
  const [status, setStatus] = useState('Enter the demo reference and management key.');
  const [busy, setBusy] = useState(false);

  async function load(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    try {
      const result = await viewReservation({ reference, manageToken: token });
      if (!result.ok || !result.reservation) throw new Error(result.error || 'Not found');
      setReservation(result.reservation);
      setPartySize(result.reservation.partySize);
      setSection(result.reservation.section);
      setStatus('Reservation loaded.');
    } catch (error) {
      setStatus(`Unable to load: ${error instanceof Error ? error.message : 'Check the reference and key.'}`);
    } finally {
      setBusy(false);
    }
  }

  async function change(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await changeReservation({ reference, manageToken: token, date, time, partySize, section });
      if (!result.ok || !result.reservation) throw new Error(result.error || 'Change failed');
      setReservation(result.reservation);
      setStatus('Demo reservation changed and capacity reallocated.');
    } catch (error) {
      setStatus(`Change failed: ${error instanceof Error ? error.message : 'Selected slot unavailable.'}`);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm('Cancel this synthetic demo reservation?')) return;
    setBusy(true);
    try {
      const result = await cancelReservation({ reference, manageToken: token });
      if (!result.ok || !result.reservation) throw new Error(result.error || 'Cancel failed');
      setReservation(result.reservation);
      setStatus('Demo reservation cancelled and capacity returned.');
    } catch (error) {
      setStatus(`Cancel failed: ${error instanceof Error ? error.message : 'Try again.'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="manage-page">
      <a className="back-home" href="/reservations">Back to reservations</a>
      <section className="manage-card">
        <h1>Manage demo reservation</h1>
        <p>This route changes only synthetic pitch data.</p>
        <form onSubmit={load} className="manage-form">
          <label>Reference<input value={reference} onChange={e => setReference(e.target.value.toUpperCase())} placeholder="DEMO-1234ABCD" required /></label>
          <label>Management key<input value={token} onChange={e => setToken(e.target.value)} placeholder="Private browser session key" required /></label>
          <button type="submit" disabled={busy}>{busy ? 'Loading...' : 'Load reservation'}</button>
        </form>
        <p role="status">{status}</p>
        {reservation && (
          <article className="reservation-detail">
            <h2>{reservation.reference}</h2>
            <p>{statusLabel(reservation.status)} · {reservation.partySize} guests · {reservation.section}</p>
            <p>{formatLocalDate(reservation.startsAt)} at {formatLocalTime(reservation.startsAt)}</p>
            <form onSubmit={change} className="change-form">
              <label>Date<input type="date" value={date} min={isoDateInLosAngeles(0)} max={isoDateInLosAngeles(30)} onChange={e => setDate(e.target.value)} /></label>
              <label>Time<select value={time} onChange={e => setTime(e.target.value)}>{['17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30'].map(t => <option key={t}>{t}</option>)}</select></label>
              <label>Guests<select value={partySize} onChange={e => setPartySize(Number(e.target.value))}>{Array.from({ length: 8 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></label>
              <label>Seating<select value={section} onChange={e => setSection(e.target.value as SeatingSection)}><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select></label>
              <button type="submit" disabled={busy || reservation.status === 'cancelled'}>Change demo reservation</button>
            </form>
            <button className="danger" type="button" onClick={cancel} disabled={busy || reservation.status === 'cancelled'}>Cancel demo reservation</button>
          </article>
        )}
      </section>
    </main>
  );
}

function OperatorPage() {
  const [token, setToken] = useState(sessionStorage.getItem('demoOperatorToken') || '');
  const [state, setState] = useState<OperatorState | null>(null);
  const [status, setStatus] = useState('Enter the protected demo operator passcode.');
  const [busy, setBusy] = useState(false);

  async function load(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    try {
      const result = await operatorList(token);
      if (!result.ok) throw new Error(result.error || 'Unauthorized');
      sessionStorage.setItem('demoOperatorToken', token);
      setState(result);
      setStatus('Operator view loaded from Supabase demo data.');
    } catch (error) {
      setStatus(`Operator access failed: ${error instanceof Error ? error.message : 'Check passcode.'}`);
    } finally {
      setBusy(false);
    }
  }

  async function setBookingStatus(reference: string, nextStatus: string) {
    setBusy(true);
    try {
      await operatorStatus(token, reference, nextStatus);
      await load();
    } catch (error) {
      setStatus(`Update failed: ${error instanceof Error ? error.message : 'Try again.'}`);
      setBusy(false);
    }
  }

  async function resetDemo() {
    if (!window.confirm('Reset all synthetic demo reservations?')) return;
    setBusy(true);
    try {
      await operatorReset(token);
      await load();
      setStatus('Synthetic demo data reset.');
    } catch (error) {
      setStatus(`Reset failed: ${error instanceof Error ? error.message : 'Try again.'}`);
      setBusy(false);
    }
  }

  const bookings = state?.bookings || [];
  const holds = state?.holds || [];
  const notifications = state?.notifications || [];
  const serviceDate = bookings[0]?.startsAt || holds[0]?.startsAt || new Date().toISOString();
  const activeBookings = bookings.filter(booking => !['cancelled', 'completed'].includes(booking.status));
  const activeCount = activeBookings.reduce((total, booking) => total + booking.partySize, 0);
  const bookedCount = bookings.filter(booking => booking.status === 'confirmed').length;
  const seatedCount = bookings.filter(booking => booking.status === 'seated').length;
  const checkInCount = bookings.filter(booking => booking.status === 'checked_in').length;
  const previewCount = notifications.length;
  const selectedBooking = activeBookings[0] || bookings[0] || null;
  const tableCodes = ['12','14','21','22','31','32','33','34','35','36','37','38','39','40','41','42','P1','P2','P3','P4','P5','P6','B1','B2'];
  const bookingsByTable = new Map(bookings.map((booking, index) => [booking.tableCode || tableCodes[index % tableCodes.length], booking]));
  const railGroups = [
    { label: 'Notify', count: previewCount, active: false },
    { label: 'Waitlist', count: holds.length, active: false },
    { label: 'Booked', count: bookedCount, active: true },
    { label: 'Seated', count: seatedCount, active: false },
    { label: 'Done', count: bookings.filter(booking => booking.status === 'completed').length, active: false },
    { label: 'No-show', count: bookings.filter(booking => booking.status === 'cancelled').length, active: false }
  ];
  const timeSlots = ['5:00', '5:30', '6:00', '6:30', '7:00', '7:30', '8:00', '8:30', '9:00'];
  const sectionNames = ['Dining Room', 'Patio'];

  return (
    <main className="operator-page">
      {!state && (
        <>
          <section className="operator-login">
            <div>
              <p className="demo-tag operator-demo-tag">iPad operator demo</p>
              <h1>Tonight's demo service</h1>
              <p>Protected view for check-in, seating rehearsal, cancellation, waitlist holds, and disabled notification preview.</p>
            </div>
            <form onSubmit={load}>
              <label>Operator passcode<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" /></label>
              <button type="submit" disabled={busy}>{busy ? 'Loading...' : 'Open operator view'}</button>
            </form>
          </section>
          <p className="operator-status" role="status">{status}</p>
        </>
      )}
      {state && (
        <section className="resyos-shell" aria-label="ResyOS style service console">
          <h1 className="sr-only">Tonight's demo service</h1>
          <header className="resyos-topbar">
            <div className="resyos-venue">
              <button type="button" aria-label="Open service menu"><span aria-hidden="true">▦</span></button>
              <strong>Guantonio's</strong>
              <span>Lodi service</span>
            </div>
            <div className="resyos-date-controls" aria-label="Date and shift controls">
              <button type="button" aria-label="Previous service">‹</button>
              <span>{new Date(serviceDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <button type="button" aria-label="Open date picker">▣</button>
              <strong>Dinner</strong>
              <button type="button" aria-label="Next service">›</button>
            </div>
            <div className="resyos-mode-controls" aria-label="View controls">
              <button type="button">Floor</button>
              <button type="button">Timeline</button>
              <button type="button" onClick={resetDemo} disabled={busy}>Reset</button>
            </div>
            <p className="resyos-live-status" role="status">{status}</p>
          </header>
          <div className="resyos-party-row" aria-label="Party size filters">
            <span>Party Size</span>
            {[1, 2, 3, 4, 5, 6, '7+'].map(size => <button type="button" key={size}>{size}</button>)}
            <p>Group By: <strong>Floor Plan</strong></p>
          </div>
          <section className="service-strip" aria-label="Service summary">
            <article><span>Dine-in covers</span><strong>{activeCount}</strong></article>
            <article><span>Booked</span><strong>{bookedCount}</strong></article>
            <article><span>Checked in</span><strong>{checkInCount}</strong></article>
            <article><span>Seated</span><strong>{seatedCount}</strong></article>
            <article><span>Text previews</span><strong>{previewCount}</strong></article>
          </section>
          <section className="resyos-workbench">
            <aside className="resyos-left-rail" aria-label="Guest queues">
              <div className="queue-search" aria-label="Guest search preview">Search guest or reference</div>
              <div className="queue-tabs" aria-label="Reservation queues">
                {railGroups.map(group => (
                  <button type="button" key={group.label} className={group.active ? 'active' : ''}>
                    <span>{group.label}</span>
                    <strong>{group.count}</strong>
                  </button>
                ))}
              </div>
              <div className="operator-list">
                <div className="section-heading">
                  <div>
                    <h2>Reservations</h2>
                    <p>Live synthetic book, change, cancel, and check-in queue.</p>
                  </div>
                </div>
                {bookings.length === 0 && <p>No synthetic bookings yet.</p>}
                {bookings.map(booking => (
                  <article key={booking.reference} className={`operator-row ${booking.status}`}>
                    <div className="operator-guest">
                      <strong>{booking.guestLabel || 'Demo Guest'}</strong>
                      <span>{booking.reference}</span>
                    </div>
                    <div className="operator-time">
                      <strong>{formatLocalTime(booking.startsAt)}</strong>
                      <span>{booking.partySize} guests · {booking.section} · table {booking.tableCode || 'pending'}</span>
                    </div>
                    <span className="status-pill">{statusLabel(booking.status)}</span>
                    <div className="operator-actions">
                      <button disabled={busy} onClick={() => setBookingStatus(booking.reference, 'checked_in')}>Check in</button>
                      <button disabled={busy} onClick={() => setBookingStatus(booking.reference, 'seated')}>Seat</button>
                      <button disabled={busy} onClick={() => setBookingStatus(booking.reference, 'completed')}>Finish</button>
                      <button disabled={busy} onClick={() => setBookingStatus(booking.reference, 'cancelled')}>Cancel</button>
                    </div>
                  </article>
                ))}
              </div>
            </aside>
            <section className="resyos-floor-stage" aria-label="Floor plan timeline">
              <div className="timeline-head" aria-label="Service timeline">
                {timeSlots.map(slot => <span key={slot}>{slot}</span>)}
              </div>
              <div className="floor-plan-panel">
                {sectionNames.map(sectionName => (
                  <section key={sectionName} className="floor-section" aria-label={`${sectionName} table map`}>
                    <h2>{sectionName}</h2>
                    <div className="floor-map" aria-label={`${sectionName} synthetic floor map`}>
                      {tableCodes.slice(sectionName === 'Dining Room' ? 0 : 16, sectionName === 'Dining Room' ? 16 : 24).map((code, index) => {
                        const booking = bookingsByTable.get(code);
                        const tileStatus = booking ? booking.status : index % 7 === 0 ? 'blocked' : 'open';
                        return (
                          <button type="button" key={code} className={`floor-table ${tileStatus}`} aria-label={`Table ${code}${booking ? `, ${statusLabel(booking.status)}` : ', open'}`}>
                            <strong>{code}</strong>
                            <span>{booking ? `${booking.partySize} · ${formatLocalTime(booking.startsAt)}` : '00'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {selectedBooking && (
                  <aside className={`guest-popover ${selectedBooking.status}`} aria-label="Selected reservation preview">
                    <span>{formatLocalTime(selectedBooking.startsAt)}</span>
                    <strong>{selectedBooking.guestLabel || 'Demo Guest'}</strong>
                    <p>{selectedBooking.partySize} guests · table {selectedBooking.tableCode || 'pending'} · {statusLabel(selectedBooking.status)}</p>
                  </aside>
                )}
              </div>
              <footer className="cover-ticker" aria-label="Dine-in cover pacing">
                <strong>{activeCount} DINE-IN COVERS</strong>
                {timeSlots.map((slot, index) => <span key={slot}>{Math.max(0, activeCount - index)}/10<small>{slot}</small></span>)}
              </footer>
            </section>
            <aside className="floor-panel resyos-side-panel" tabIndex={0} aria-label="Service details">
              <section aria-labelledby="floor-title">
                <h2 id="floor-title">Floor snapshot</h2>
                <p>Color states mirror the service queue: booked, checked in, seated, finished, cancelled, open, or blocked.</p>
              </section>
              <section aria-labelledby="holds-title">
                <h2 id="holds-title">Recent holds</h2>
                {holds.length === 0 ? <p>No open demo holds.</p> : holds.slice(0, 4).map(hold => <p key={hold.id}>{formatLocalTime(hold.startsAt)} · {hold.partySize} · {hold.section} · {statusLabel(hold.status)}</p>)}
              </section>
              <section aria-labelledby="notifications-title">
                <h2 id="notifications-title">Disabled notification adapter</h2>
                {notifications.length === 0 ? <p>No previews yet.</p> : notifications.slice(0, 3).map((n, i) => <p key={`${n.createdAt}-${i}`}>{n.eventType}: {n.status}</p>)}
              </section>
            </aside>
          </section>
        </section>
      )}
    </main>
  );
}

function NotFound() {
  return <main className="booking-page"><a href="/">Return home</a><h1>Page not found</h1></main>;
}

function noAvailabilityCopy(reason?: string | null) {
  if (reason === 'closed') return 'The synthetic demo service is closed for that date.';
  if (reason === 'outside_demo_window') return 'That date is outside the 30-day demo window.';
  return 'No demo tables are available for that search. Try another time, party size, or seating area.';
}

createRoot(document.getElementById('root')!).render(<App />);
