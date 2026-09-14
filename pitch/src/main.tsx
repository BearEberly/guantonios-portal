import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { cancelReservation, changeReservation, confirmReservation, createHold, operatorList, operatorReset, operatorStatus, searchAvailability, viewReservation } from './api';
import type { AvailabilitySlot, BookingResult, HoldResult, OperatorState, ReservationSummary, SeatingSection } from './types';
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

type OperatorRailSection = 'Book' | 'Floor' | 'Wait' | 'Guests' | 'Reports';

function OperatorPage() {
  const [token, setToken] = useState(sessionStorage.getItem('demoOperatorToken') || '');
  const [state, setState] = useState<OperatorState | null>(null);
  const [status, setStatus] = useState('Enter the protected demo operator passcode.');
  const [busy, setBusy] = useState(false);
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [operatorMode, setOperatorMode] = useState<'floor' | 'timeline' | 'availability'>('floor');
  const [activeRail, setActiveRail] = useState<OperatorRailSection>('Floor');
  const [queueFilter, setQueueFilter] = useState('All');
  const [partySizeFilter, setPartySizeFilter] = useState<number | '7+' | null>(null);
  const [queueSearch, setQueueSearch] = useState('');
  const [bookDate, setBookDate] = useState(nextBookableDate());
  const [bookTime, setBookTime] = useState('19:30');
  const [bookPartySize, setBookPartySize] = useState(2);
  const [bookSection, setBookSection] = useState<SeatingSection | 'either'>('indoor');
  const [bookGuestName, setBookGuestName] = useState('Operator Guest');
  const [bookMobile, setBookMobile] = useState('(209) 555-0100');
  const [bookNote, setBookNote] = useState('Booked from the operator iPad demo.');
  const [bookSlots, setBookSlots] = useState<AvailabilitySlot[]>([]);
  const [bookStatus, setBookStatus] = useState('Search live demo availability before booking from the iPad.');
  const [bookBusy, setBookBusy] = useState(false);

  async function load(event?: FormEvent, loadedStatus = 'Operator view loaded from Supabase demo data.') {
    event?.preventDefault();
    setBusy(true);
    try {
      const result = await operatorList(token);
      if (!result.ok) throw new Error(result.error || 'Unauthorized');
      sessionStorage.setItem('demoOperatorToken', token);
      setState(result);
      setStatus(loadedStatus);
    } catch (error) {
      setStatus(`Operator access failed: ${error instanceof Error ? error.message : 'Check passcode.'}`);
    } finally {
      setBusy(false);
    }
  }

  async function setBookingStatus(reference: string, nextStatus: string, tableCode?: string) {
    setBusy(true);
    try {
      const result = await operatorStatus(token, reference, nextStatus, tableCode);
      if (!result.ok) throw new Error(result.error || 'Operator update failed');
      setSelectedReference(reference);
      if (nextStatus === 'seated') setQueueFilter('Seated');
      if (nextStatus === 'completed') setQueueFilter('Done');
      if (nextStatus === 'cancelled') setQueueFilter('No-show');
      await load(undefined, tableCode ? `Seated ${reference} at table ${tableCode}.` : `Updated ${reference} to ${statusLabel(nextStatus)}.`);
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
      setSelectedReference(null);
      setQueueFilter('All');
      await load(undefined, 'Synthetic demo data reset.');
    } catch (error) {
      setStatus(`Reset failed: ${error instanceof Error ? error.message : 'Try again.'}`);
      setBusy(false);
    }
  }


  async function runOperatorBookSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBookBusy(true);
    setBookStatus('Searching current demo availability...');
    try {
      const result = await searchAvailability({ date: bookDate, time: bookTime, partySize: bookPartySize, ...(bookSection === 'either' ? {} : { section: bookSection }) });
      if (!result.ok) throw new Error(result.error || 'Search failed');
      setBookSlots(result.slots || []);
      const message = result.slots.length
        ? `Found ${result.slots.length} demo time ${result.slots.length === 1 ? 'option' : 'options'} for ${bookPartySize}.`
        : noAvailabilityCopy(result.reason);
      setBookStatus(message);
      setStatus(message);
    } catch (error) {
      const message = `Book search failed: ${error instanceof Error ? error.message : 'Try again.'}`;
      setBookStatus(message);
      setStatus(message);
    } finally {
      setBookBusy(false);
    }
  }

  async function bookOperatorSlot(slot: AvailabilitySlot, section: SeatingSection) {
    setBookBusy(true);
    setStatus(`Holding ${slot.displayTime} ${section} for ${bookPartySize}.`);
    setBookStatus(`Holding ${slot.displayTime} ${section} for ${bookPartySize}.`);
    try {
      const hold = await createHold({ date: slot.date, time: slot.time, partySize: bookPartySize, section, idempotencyKey: makeIdempotencyKey('operator_hold') });
      if (!hold.ok || !hold.holdId || !hold.holdToken) throw new Error(hold.error || 'Hold failed');
      const [firstName, ...lastParts] = bookGuestName.trim().split(/\s+/).filter(Boolean);
      const result = await confirmReservation({
        holdId: hold.holdId,
        holdToken: hold.holdToken,
        idempotencyKey: makeIdempotencyKey('operator_confirm'),
        firstName: firstName || 'Operator',
        lastName: lastParts.join(' ') || 'Guest',
        email: `operator.${Date.now()}@demo.guantonios.local`,
        mobile: normalizeDemoMobile(bookMobile),
        request: bookNote || 'Booked from the operator iPad demo.'
      });
      if (!result.ok || !result.reference) throw new Error(result.error || 'Confirm failed');
      setSelectedReference(result.reference);
      setQueueFilter('Booked');
      setOperatorMode('floor');
      setActiveRail('Floor');
      setBookSlots([]);
      setBookStatus(`Booked ${result.reference} for ${bookPartySize} at ${slot.displayTime}.`);
      await load(undefined, `Booked ${result.reference} for ${bookPartySize} at ${slot.displayTime}.`);
    } catch (error) {
      const message = `Book failed: ${error instanceof Error ? error.message : 'Try again.'}`;
      setBookStatus(message);
      setStatus(message);
    } finally {
      setBookBusy(false);
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
  const selectedBooking = bookings.find(booking => booking.reference === selectedReference) || activeBookings[0] || bookings[0] || null;
  const floorTables = [
    { code: '12', section: 'Dining Room', seats: 2, shape: 'round', x: 11, y: 18, w: 12, h: 17 },
    { code: '14', section: 'Dining Room', seats: 4, shape: 'round', x: 27, y: 18, w: 13, h: 18 },
    { code: '21', section: 'Dining Room', seats: 2, shape: 'square', x: 11, y: 47, w: 12, h: 17 },
    { code: '22', section: 'Dining Room', seats: 2, shape: 'square', x: 27, y: 47, w: 12, h: 17 },
    { code: '31', section: 'Dining Room', seats: 4, shape: 'booth', x: 47, y: 13, w: 14, h: 15 },
    { code: '32', section: 'Dining Room', seats: 4, shape: 'booth', x: 65, y: 13, w: 14, h: 15 },
    { code: '33', section: 'Dining Room', seats: 4, shape: 'booth', x: 47, y: 35, w: 14, h: 15 },
    { code: '34', section: 'Dining Room', seats: 4, shape: 'booth', x: 65, y: 35, w: 14, h: 15 },
    { code: '35', section: 'Dining Room', seats: 4, shape: 'booth', x: 47, y: 58, w: 14, h: 15 },
    { code: '36', section: 'Dining Room', seats: 4, shape: 'booth', x: 65, y: 58, w: 14, h: 15 },
    { code: '37', section: 'Dining Room', seats: 2, shape: 'square', x: 84, y: 20, w: 10, h: 15 },
    { code: '38', section: 'Dining Room', seats: 2, shape: 'square', x: 84, y: 45, w: 10, h: 15 },
    { code: '39', section: 'Dining Room', seats: 2, shape: 'square', x: 84, y: 70, w: 10, h: 15 },
    { code: '40', section: 'Dining Room', seats: 4, shape: 'round', x: 11, y: 73, w: 12, h: 17 },
    { code: '41', section: 'Dining Room', seats: 4, shape: 'round', x: 27, y: 73, w: 12, h: 17 },
    { code: '42', section: 'Dining Room', seats: 6, shape: 'booth', x: 47, y: 80, w: 32, h: 12 },
    { code: 'P1', section: 'Patio', seats: 2, shape: 'round', x: 10, y: 23, w: 12, h: 23 },
    { code: 'P2', section: 'Patio', seats: 2, shape: 'round', x: 28, y: 23, w: 12, h: 23 },
    { code: 'P3', section: 'Patio', seats: 4, shape: 'round', x: 46, y: 23, w: 13, h: 24 },
    { code: 'P4', section: 'Patio', seats: 4, shape: 'round', x: 64, y: 23, w: 13, h: 24 },
    { code: 'P5', section: 'Patio', seats: 4, shape: 'square', x: 20, y: 63, w: 18, h: 22 },
    { code: 'P6', section: 'Patio', seats: 6, shape: 'square', x: 48, y: 63, w: 26, h: 22 },
    { code: 'B1', section: 'Patio', seats: 1, shape: 'bar', x: 82, y: 17, w: 9, h: 31 },
    { code: 'B2', section: 'Patio', seats: 1, shape: 'bar', x: 82, y: 56, w: 9, h: 31 }
  ] as const;
  const bookingsByTable = new Map(activeBookings.filter(booking => booking.tableCode).map(booking => [booking.tableCode!, booking]));
  const queueMatches = (booking: ReservationSummary & { tableCode?: string; createdAt?: string }) => {
    if (queueFilter === 'Notify' || queueFilter === 'Waitlist') return false;
    if (queueFilter === 'Booked') return booking.status === 'confirmed';
    if (queueFilter === 'Seated') return booking.status === 'seated';
    if (queueFilter === 'Done') return booking.status === 'completed';
    if (queueFilter === 'No-show') return booking.status === 'cancelled';
    return true;
  };
  const partyMatches = (booking: ReservationSummary) => {
    if (!partySizeFilter) return true;
    if (partySizeFilter === '7+') return booking.partySize >= 7;
    return booking.partySize === partySizeFilter;
  };
  const searchMatches = (booking: ReservationSummary & { tableCode?: string }) => {
    const query = queueSearch.trim().toLowerCase();
    if (!query) return true;
    return [booking.reference, booking.guestLabel || 'Demo Guest', booking.section, booking.tableCode || '', formatLocalTime(booking.startsAt)]
      .some(value => value.toLowerCase().includes(query));
  };
  const visibleBookings = bookings.filter(booking => queueMatches(booking) && partyMatches(booking) && searchMatches(booking));
  const visibleActiveCovers = visibleBookings.filter(booking => !['cancelled', 'completed'].includes(booking.status)).reduce((total, booking) => total + booking.partySize, 0);
  const openHolds = holds.filter(hold => !['confirmed', 'cancelled', 'expired'].includes(hold.status));
  const visibleHolds = queueFilter === 'Waitlist' ? openHolds : [];
  const visibleNotifications = queueFilter === 'Notify' ? notifications : [];
  const railGroups = [
    { label: 'All', count: bookings.length },
    { label: 'Notify', count: previewCount },
    { label: 'Waitlist', count: openHolds.length },
    { label: 'Booked', count: bookedCount },
    { label: 'Seated', count: seatedCount },
    { label: 'Done', count: bookings.filter(booking => booking.status === 'completed').length },
    { label: 'No-show', count: bookings.filter(booking => booking.status === 'cancelled').length }
  ];
  const timeSlots = ['5:00', '5:30', '6:00', '6:30', '7:00', '7:30', '8:00', '8:30', '9:00'];
  const timeSlotKeys = timeSlots.map((_, index) => `${String(17 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}`);
  const timelineGridTemplate = `96px repeat(${timeSlots.length}, minmax(76px, 1fr))`;
  const railItems: Array<{ icon: string; label: OperatorRailSection; count: number }> = [
    { icon: 'book', label: 'Book', count: bookedCount },
    { icon: 'floor', label: 'Floor', count: activeBookings.length },
    { icon: 'wait', label: 'Wait', count: openHolds.length },
    { icon: 'guest', label: 'Guests', count: bookings.length },
    { icon: 'reports', label: 'Reports', count: previewCount }
  ];
  const sectionNames = ['Dining Room', 'Patio'];
  const timelineBookings = [...visibleBookings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const timelineTableCodes = new Set(floorTables.map(table => table.code));
  const timelineBookingsByTable = new Map<string, typeof timelineBookings>();
  timelineBookings.forEach(booking => {
    const key = booking.tableCode && timelineTableCodes.has(booking.tableCode) ? booking.tableCode : `${booking.section}-unassigned`;
    timelineBookingsByTable.set(key, [...(timelineBookingsByTable.get(key) || []), booking]);
  });
  const timelineLocalKey = (value: string) => new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Los_Angeles'
  }).format(new Date(value));
  const timelineSectionGroups = sectionNames.map(sectionName => ({
    sectionName,
    tables: floorTables.filter(table => table.section === sectionName),
    covers: timelineBookings
      .filter(booking => sectionName === 'Patio' ? booking.section === 'outdoor' : booking.section === 'indoor')
      .reduce((total, booking) => total + booking.partySize, 0)
  }));
  const timelineCoversBySlot = timeSlotKeys.map((slotTime, index) => {
    const covers = timelineBookings
      .filter(booking => !['cancelled', 'completed'].includes(booking.status))
      .filter(booking => timelineLocalKey(booking.startsAt) === slotTime)
      .reduce((total, booking) => total + booking.partySize, 0);
    return { slot: timeSlots[index], covers };
  });
  const capacityBySlot = timeSlots.map((slot, index) => {
    const slotTime = timeSlotKeys[index];
    const covers = bookings
      .filter(booking => !['cancelled', 'completed'].includes(booking.status))
      .filter(booking => timelineLocalKey(booking.startsAt) === slotTime)
      .reduce((total, booking) => total + booking.partySize, 0);
    return { slot, time: slotTime, covers, remaining: Math.max(0, 10 - covers) };
  });
  const timelineGridColumn = (booking: ReservationSummary & { tableCode?: string }) => {
    const startsAt = timelineLocalKey(booking.startsAt);
    const startIndex = Math.max(0, timeSlotKeys.indexOf(startsAt));
    const durationMs = Math.max(30 * 60 * 1000, new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime());
    const durationSlots = Math.max(1, Math.round(durationMs / (30 * 60 * 1000)));
    const span = Math.min(4, durationSlots, timeSlots.length - startIndex);
    return `${startIndex + 2} / span ${span}`;
  };
  function selectOperatorRail(label: OperatorRailSection) {
    setActiveRail(label);
    if (label === 'Book') return;
    if (label === 'Floor') {
      setOperatorMode('floor');
      setQueueFilter('All');
      return;
    }
    if (label === 'Wait') {
      setQueueFilter('Waitlist');
      return;
    }
    if (label === 'Guests') {
      setQueueFilter('All');
      return;
    }
    setQueueFilter('Notify');
  }
  function seedOperatorBook(time: string, section?: SeatingSection, partySize?: number) {
    setActiveRail('Book');
    setBookTime(time);
    if (section) setBookSection(section);
    if (partySize) setBookPartySize(Math.min(Math.max(partySize, 1), 8));
    setBookStatus(`Ready to search ${partySize || bookPartySize} guests at ${time}.`);
  }
  const selectedPartyCanMove = Boolean(selectedBooking && !['cancelled', 'completed'].includes(selectedBooking.status));
  const canSeatAtTable = (table: (typeof floorTables)[number]) => Boolean(selectedBooking && selectedPartyCanMove && selectedBooking.partySize <= table.seats);
  async function seatSelectedAtTable(table: (typeof floorTables)[number]) {
    const tableBooking = bookingsByTable.get(table.code);
    if (tableBooking && tableBooking.reference !== selectedBooking?.reference) {
      setSelectedReference(tableBooking.reference);
      setStatus(`Selected ${tableBooking.reference} at table ${table.code}.`);
      return;
    }
    if (!selectedBooking) {
      seedOperatorBook(bookTime, table.section === 'Patio' ? 'outdoor' : 'indoor', table.seats);
      setStatus(`Started a ${table.seats}-top booking search from open table ${table.code}.`);
      return;
    }
    if (!selectedPartyCanMove) {
      setStatus(`${selectedBooking.reference} is ${statusLabel(selectedBooking.status)} and cannot be seated.`);
      return;
    }
    if (!canSeatAtTable(table)) {
      setStatus(`Table ${table.code} only seats ${table.seats}; select a larger table for ${selectedBooking.partySize} guests.`);
      return;
    }
    await setBookingStatus(selectedBooking.reference, 'seated', table.code);
  }

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
          <nav className="resyos-app-rail" aria-label="Operator sections">
            {railItems.map(item => (
              <button type="button" key={item.label} className={activeRail === item.label ? 'active' : ''} aria-label={item.label} aria-pressed={activeRail === item.label} onClick={() => selectOperatorRail(item.label)}>
                <span aria-hidden="true"><OperatorIcon name={item.icon} /></span>
                <small>{item.label}</small>
                {item.count > 0 && <strong>{item.count}</strong>}
              </button>
            ))}
            <button type="button" className="rail-reset" onClick={resetDemo} disabled={busy} aria-label="Reset demo data">
              <span aria-hidden="true"><OperatorIcon name="reset" /></span>
              <small>Reset</small>
            </button>
          </nav>
          <div className="resyos-main-console">
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
                {(['floor', 'timeline', 'availability'] as const).map(mode => (
                  <button type="button" key={mode} className={operatorMode === mode ? 'active' : ''} aria-pressed={operatorMode === mode} onClick={() => setOperatorMode(mode)}>
                    {mode === 'floor' ? 'Floor' : mode === 'timeline' ? 'Timeline' : 'Availability'}
                  </button>
                ))}
              </div>
              <p className="resyos-live-status" role="status">{status}</p>
            </header>
            <div className="resyos-party-row" aria-label="Party size filters">
              <span>Party Size</span>
              {[1, 2, 3, 4, 5, 6, '7+'].map(size => (
                <button
                  type="button"
                  key={size}
                  className={partySizeFilter === size ? 'active' : ''}
                  aria-pressed={partySizeFilter === size}
                  onClick={() => setPartySizeFilter(partySizeFilter === size ? null : (size as number | '7+'))}
                >
                  {size}
                </button>
              ))}
              <p>{partySizeFilter ? `Showing ${partySizeFilter} tops` : 'Group By'}: <strong>Floor Plan</strong></p>
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
              {activeRail !== 'Book' && (
                <>
                  <label className="queue-search">
                    <span className="sr-only">Search guest or reference</span>
                    <input value={queueSearch} onChange={event => setQueueSearch(event.target.value)} placeholder="Search guest or reference" aria-label="Search guest or reference" />
                  </label>
                  <div className="queue-tabs" aria-label="Reservation queues">
                    {railGroups.map(group => (
                      <button type="button" key={group.label} className={queueFilter === group.label ? 'active' : ''} aria-pressed={queueFilter === group.label} onClick={() => setQueueFilter(group.label)}>
                        <span>{group.label}</span>
                        <strong>{group.count}</strong>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {activeRail === 'Book' ? (
              <div className="operator-book-panel" aria-label="Book from operator iPad">
                <div className="section-heading">
                  <div>
                    <h2>Book a party</h2>
                    <p>Create a synthetic reservation from the internal iPad console.</p>
                  </div>
                </div>
                <form className="operator-book-form" onSubmit={runOperatorBookSearch}>
                  <label>Guest name<input value={bookGuestName} onChange={event => setBookGuestName(event.target.value)} aria-label="Operator guest name" /></label>
                  <label>Mobile<input value={bookMobile} onChange={event => setBookMobile(event.target.value)} aria-label="Operator guest mobile" /></label>
                  <div className="operator-book-inline">
                    <label>Date<input type="date" value={bookDate} onChange={event => setBookDate(event.target.value)} aria-label="Operator booking date" /></label>
                    <label>Time<input type="time" value={bookTime} onChange={event => setBookTime(event.target.value)} aria-label="Operator booking time" /></label>
                  </div>
                  <div className="operator-book-inline">
                    <label>Party<select value={bookPartySize} onChange={event => setBookPartySize(Number(event.target.value))} aria-label="Operator booking party size">{[1, 2, 3, 4, 5, 6, 7, 8].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
                    <label>Area<select value={bookSection} onChange={event => setBookSection(event.target.value as SeatingSection | 'either')} aria-label="Operator booking seating"><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option><option value="either">Either</option></select></label>
                  </div>
                  <label>Note<textarea value={bookNote} onChange={event => setBookNote(event.target.value)} maxLength={160} aria-label="Operator booking note" /></label>
                  <button type="submit" disabled={busy || bookBusy}>{bookBusy ? 'Searching...' : 'Check availability'}</button>
                </form>
                <p className="operator-book-status" role="status">{bookStatus}</p>
                <div className="operator-book-results" aria-label="Operator booking availability">
                  {bookSlots.map(slot => (
                    <article key={slot.slotId}>
                      <span>{slot.displayTime}</span>
                      <strong>{slot.exact ? 'Exact match' : 'Nearby time'}</strong>
                      {slot.seating.map(choice => (
                        <button type="button" key={`${slot.slotId}-${choice.section}`} disabled={busy || bookBusy} onClick={() => bookOperatorSlot(slot, choice.section)} aria-label={`Book ${choice.label} at ${slot.displayTime}`}>Book {choice.label}</button>
                      ))}
                    </article>
                  ))}
                </div>
              </div>
              ) : (
              <div className="operator-list">
                <div className="section-heading">
                  <div>
                    <h2>Reservations</h2>
                    <p>{queueFilter} queue · {visibleBookings.length + visibleHolds.length + visibleNotifications.length} visible · {visibleActiveCovers} active covers.</p>
                  </div>
                </div>
                {bookings.length === 0 && queueFilter !== 'Waitlist' && queueFilter !== 'Notify' && <p>No synthetic bookings yet.</p>}
                {queueFilter === 'Waitlist' && visibleHolds.length === 0 && <p>No open demo holds.</p>}
                {queueFilter === 'Notify' && visibleNotifications.length === 0 && <p>No notification previews yet.</p>}
                {bookings.length > 0 && queueFilter !== 'Waitlist' && queueFilter !== 'Notify' && visibleBookings.length === 0 && <p>No parties match this queue, party size, or search.</p>}
                {visibleHolds.map(hold => (
                  <article key={hold.id} className="operator-row hold-row">
                    <div className="operator-guest">
                      <strong>{hold.partySize} top hold</strong>
                      <span>{hold.id.slice(0, 8)}</span>
                    </div>
                    <div className="operator-time">
                      <strong>{formatLocalTime(hold.startsAt)}</strong>
                      <span>{hold.section} · {statusLabel(hold.status)} · expires {formatLocalTime(hold.expiresAt)}</span>
                    </div>
                    <span className="status-pill">{statusLabel(hold.status)}</span>
                  </article>
                ))}
                {visibleNotifications.map((notification, index) => (
                  <article key={`${notification.createdAt}-${index}`} className="operator-row notification-row">
                    <div className="operator-guest">
                      <strong>{notification.eventType}</strong>
                      <span>{notification.adapter}</span>
                    </div>
                    <div className="operator-time">
                      <strong>{statusLabel(notification.status)}</strong>
                      <span>{formatLocalTime(notification.createdAt)} · preview only</span>
                    </div>
                    <span className="status-pill">{statusLabel(notification.status)}</span>
                  </article>
                ))}
                {visibleBookings.map(booking => (
                  <article key={booking.reference} className={`operator-row ${booking.status} ${selectedBooking?.reference === booking.reference ? 'selected' : ''}`}>
                    <button type="button" className="operator-row-select" onClick={() => setSelectedReference(booking.reference)} aria-label={`Select ${booking.guestLabel || 'Demo Guest'} ${booking.reference}`}>
                      <span className="sr-only">Select reservation</span>
                    </button>
                    <div className="operator-guest">
                      <strong>{booking.guestLabel || 'Demo Guest'}</strong>
                      <span>{booking.reference}</span>
                    </div>
                    <div className="operator-time">
                      <strong>{formatLocalTime(booking.startsAt)}</strong>
                      <span>{booking.partySize} guests · {booking.section} · table {booking.tableCode || 'pending'}</span>
                    </div>
                    <div className="operator-tags" aria-label="Guest service notes">
                      <span>First visit</span>
                      <span>{booking.section}</span>
                      <span>{booking.partySize} top</span>
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
              )}
            </aside>
            <section className="resyos-floor-stage" aria-label="Floor plan timeline">
              <div className="timeline-head" aria-label="Service timeline">
                {timeSlots.map((slot, index) => (
                  <span key={slot} className={index === 5 ? 'now' : ''}>
                    {slot}
                    <small>{index === 5 ? 'active' : `${Math.max(0, activeCount - index)}/10`}</small>
                  </span>
                ))}
              </div>
              <div className={`floor-plan-panel mode-${operatorMode}`}>
                {operatorMode === 'floor' && (
                  <>
                    {sectionNames.map(sectionName => (
                      <section key={sectionName} className="floor-section" aria-label={`${sectionName} table map`}>
                        <div className="floor-section-head">
                          <h2>{sectionName}</h2>
                          <span>{sectionName === 'Dining Room' ? 'Host stand · dining room · bar' : 'Patio rail · counter'}</span>
                        </div>
                        <div className={`floor-map floor-map-${sectionName === 'Dining Room' ? 'dining' : 'patio'}`} aria-label={`${sectionName} synthetic floor map`}>
                          <span className="floor-landmark host">Host</span>
                          <span className="floor-landmark kitchen">{sectionName === 'Dining Room' ? 'Kitchen' : 'Gate'}</span>
                          <span className="floor-landmark bar">{sectionName === 'Dining Room' ? 'Pizza oven' : 'Bar'}</span>
                          {floorTables.filter(table => table.section === sectionName).map(table => {
                            const booking = bookingsByTable.get(table.code);
                            const tileStatus = booking ? booking.status : 'open';
                            const assignable = !booking && canSeatAtTable(table);
                            const tooSmall = !booking && Boolean(selectedBooking && selectedPartyCanMove && selectedBooking.partySize > table.seats);
                            return (
                              <button
                                type="button"
                                key={table.code}
                                className={`floor-table ${table.shape} ${tileStatus} ${assignable ? 'assignable' : ''} ${tooSmall ? 'too-small' : ''} ${booking && selectedBooking?.reference === booking.reference ? 'selected' : ''}`}
                                style={{ left: `${table.x}%`, top: `${table.y}%`, width: `${table.w}%`, height: `${table.h}%` }}
                                onClick={() => seatSelectedAtTable(table)}
                                aria-pressed={Boolean(booking && selectedBooking?.reference === booking.reference)}
                                aria-label={`Table ${table.code}, ${table.seats} seats${booking ? `, ${statusLabel(booking.status)}, ${booking.partySize} guests at ${formatLocalTime(booking.startsAt)}` : assignable ? `, open, tap to seat ${selectedBooking?.reference}` : ', open'}`}
                              >
                                <strong>{table.code}</strong>
                                <span>{booking ? `${booking.partySize} · ${formatLocalTime(booking.startsAt)}` : assignable ? 'Seat here' : `${table.seats}p`}</span>
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
                        <p>{selectedBooking.partySize} guests · {selectedBooking.section} · table {selectedBooking.tableCode || 'pending'} · {statusLabel(selectedBooking.status)}</p>
                      </aside>
                    )}
                  </>
                )}
                {operatorMode === 'timeline' && (
                  <section className="operator-timeline-board" aria-label="Reservation timeline board">
                    <div className="timeline-board-head">
                      <h2>Timeline</h2>
                      <span>{timelineBookings.length} visible parties · 90 min turns</span>
                    </div>
                    {timelineBookings.length === 0 && <p>No parties match the current filters.</p>}
                    {timelineBookings.length > 0 && (
                      <div className="timeline-grid-wrap">
                        <div className="timeline-grid" aria-label="Table lane reservation book">
                          <div className="timeline-grid-header" style={{ gridTemplateColumns: timelineGridTemplate }} role="row">
                            <strong>Table</strong>
                            {timeSlots.map((slot, index) => <span key={slot} className={index === 5 ? 'active' : ''}>{slot}</span>)}
                          </div>
                          {timelineSectionGroups.map(group => (
                            <div key={group.sectionName} className="timeline-section-group">
                              <div className="timeline-section-band">
                                <strong>{group.sectionName}</strong>
                                <span>{group.covers} covers</span>
                              </div>
                              {group.tables.map(table => {
                                const rowBookings = timelineBookingsByTable.get(table.code) || [];
                                const tableBooking = bookingsByTable.get(table.code);
                                const rowCanSeat = !tableBooking && canSeatAtTable(table);
                                return (
                                  <div key={table.code} className={`timeline-table-row ${rowCanSeat ? 'assignable' : ''}`} style={{ gridTemplateColumns: timelineGridTemplate }} role="row">
                                    <button type="button" className={`timeline-table-label ${rowCanSeat ? 'assignable' : ''}`} onClick={() => seatSelectedAtTable(table)} aria-label={`Timeline table ${table.code}, ${table.seats} seats`}>
                                      <strong>{table.code}</strong>
                                      <span>{table.seats}p</span>
                                    </button>
                                    {timeSlots.map((slot, index) => (
                                      <button
                                        type="button"
                                        key={`${table.code}-${slot}`}
                                        className="timeline-cell"
                                        onClick={() => rowCanSeat ? seatSelectedAtTable(table) : seedOperatorBook(timeSlotKeys[index], table.section === 'Patio' ? 'outdoor' : 'indoor', table.seats)}
                                        aria-label={rowCanSeat ? `Seat ${selectedBooking?.reference} at table ${table.code} from ${slot}` : `Book table ${table.code} at ${slot}`}
                                      />
                                    ))}
                                    {rowBookings.map(booking => (
                                      <button
                                        type="button"
                                        key={booking.reference}
                                        className={`timeline-reservation-card ${booking.status} ${selectedBooking?.reference === booking.reference ? 'selected' : ''}`}
                                        style={{ gridColumn: timelineGridColumn(booking) }}
                                        onClick={() => setSelectedReference(booking.reference)}
                                        aria-label={`${booking.guestLabel || 'Demo Guest'} ${booking.reference}, ${booking.partySize} guests at ${formatLocalTime(booking.startsAt)}, table ${booking.tableCode || 'pending'}`}
                                      >
                                        <span>{formatLocalTime(booking.startsAt)}</span>
                                        <strong>{booking.guestLabel || 'Demo Guest'}</strong>
                                        <em>{booking.reference} · {booking.partySize} · {statusLabel(booking.status)}</em>
                                      </button>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                          {(['indoor', 'outdoor'] as SeatingSection[]).map(section => {
                            const rowBookings = timelineBookingsByTable.get(`${section}-unassigned`) || [];
                            if (rowBookings.length === 0) return null;
                            return (
                              <div key={`${section}-pending`} className="timeline-section-group">
                                <div className="timeline-section-band pending">
                                  <strong>{section === 'indoor' ? 'Indoor pending table' : 'Outdoor pending table'}</strong>
                                  <span>{rowBookings.length} parties</span>
                                </div>
                                {rowBookings.map(booking => (
                                  <div key={booking.reference} className="timeline-table-row pending-row" style={{ gridTemplateColumns: timelineGridTemplate }} role="row">
                                    <div className="timeline-table-label">
                                      <strong>Open</strong>
                                      <span>{booking.section}</span>
                                    </div>
                                    {timeSlots.map(slot => <span key={`${booking.reference}-${slot}`} className="timeline-cell" aria-hidden="true" />)}
                                    <button
                                      type="button"
                                      className={`timeline-reservation-card ${booking.status} ${selectedBooking?.reference === booking.reference ? 'selected' : ''}`}
                                      style={{ gridColumn: timelineGridColumn(booking) }}
                                      onClick={() => setSelectedReference(booking.reference)}
                                      aria-label={`${booking.guestLabel || 'Demo Guest'} ${booking.reference}, pending table`}
                                    >
                                      <span>{formatLocalTime(booking.startsAt)}</span>
                                      <strong>{booking.guestLabel || 'Demo Guest'}</strong>
                                      <em>{booking.reference} · {booking.partySize} · {statusLabel(booking.status)}</em>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                          <div className="timeline-covers-row" style={{ gridTemplateColumns: timelineGridTemplate }} aria-label="Cover count by time">
                            <strong>Covers</strong>
                            {timelineCoversBySlot.map(slot => <span key={slot.slot}>{slot.covers}<small>{slot.slot}</small></span>)}
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                )}
                {operatorMode === 'availability' && (
                  <section className="availability-board" aria-label="Availability by service time">
                    <div className="timeline-board-head">
                      <h2>Availability</h2>
                      <span>Demo capacity by half hour</span>
                    </div>
                    <div className="availability-grid">
                      {capacityBySlot.map(slot => (
                        <article key={slot.slot} className={slot.remaining === 0 ? 'full' : ''}>
                          <span>{slot.slot}</span>
                          <strong>{slot.remaining}</strong>
                          <small>{slot.covers}/10 covers</small>
                          <button type="button" disabled={slot.remaining === 0} onClick={() => seedOperatorBook(slot.time)}>Book this time</button>
                        </article>
                      ))}
                    </div>
                  </section>
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
                <p>Spatial map mirrors the service queue: booked, checked in, seated, finished, cancelled, open, or blocked.</p>
                <div className="floor-legend" aria-label="Floor status legend">
                  <span><i className="legend-confirmed"></i>Booked</span>
                  <span><i className="legend-checked"></i>Checked in</span>
                  <span><i className="legend-seated"></i>Seated</span>
                  <span><i className="legend-done"></i>Done</span>
                </div>
              </section>
              {selectedBooking && (
                <section aria-labelledby="selected-party-title" className="selected-party-panel">
                  <h2 id="selected-party-title">Selected party</h2>
                  <strong>{selectedBooking.guestLabel || 'Demo Guest'}</strong>
                  <p>{formatLocalTime(selectedBooking.startsAt)} · {selectedBooking.partySize} guests · {selectedBooking.section} · table {selectedBooking.tableCode || 'pending'} · {statusLabel(selectedBooking.status)}</p>
                  <div className="side-actions">
                    <button disabled={busy} onClick={() => setBookingStatus(selectedBooking.reference, 'checked_in')}>Check in</button>
                    <button disabled={busy} onClick={() => setBookingStatus(selectedBooking.reference, 'seated')}>Seat</button>
                  </div>
                </section>
              )}
              <section aria-labelledby="holds-title">
                <h2 id="holds-title">Recent holds</h2>
                {openHolds.length === 0 ? <p>No open demo holds.</p> : openHolds.slice(0, 4).map(hold => <p key={hold.id}>{formatLocalTime(hold.startsAt)} · {hold.partySize} · {hold.section} · {statusLabel(hold.status)}</p>)}
              </section>
              <section aria-labelledby="notifications-title">
                <h2 id="notifications-title">Disabled notification adapter</h2>
                {notifications.length === 0 ? <p>No previews yet.</p> : notifications.slice(0, 3).map((n, i) => <p key={`${n.createdAt}-${i}`}>{n.eventType}: {n.status}</p>)}
              </section>
            </aside>
            </section>
          </div>
        </section>
      )}
    </main>
  );
}


function normalizeDemoMobile(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 10) return digits;
  return '2095550100';
}

function OperatorIcon({ name }: { name: string }) {
  const shared = { width: 23, height: 23, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', focusable: false };
  if (name === 'book') return <svg {...shared}><path d="M6 5.5h8.5A3.5 3.5 0 0 1 18 9v9.5H8.5A2.5 2.5 0 0 1 6 16V5.5Z" stroke="currentColor" strokeWidth="2"/><path d="M9 9h5M9 13h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
  if (name === 'floor') return <svg {...shared}><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="2"/><path d="M8 9h8M8 15h8M12 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
  if (name === 'wait') return <svg {...shared}><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2"/><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (name === 'guest') return <svg {...shared}><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="2"/><path d="M4.5 19a4.5 4.5 0 0 1 9 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M16 8.5a2.5 2.5 0 1 1-1 4.8M15.5 16.5a4 4 0 0 1 4 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
  if (name === 'reports') return <svg {...shared}><path d="M5 19V5h14v14H5Z" stroke="currentColor" strokeWidth="2"/><path d="M9 16v-4M12 16V8M15 16v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
  return <svg {...shared}><path d="M6.5 7.5A7.5 7.5 0 1 1 5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M5 5v4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
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
