import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { cancelReservation, changeReservation, confirmReservation, createHold, operatorFloor, operatorGuest, operatorList, operatorReset, operatorStatus, operatorWaitlist, searchAvailability, viewReservation } from './api';
import type { AvailabilitySlot, BookingResult, GuestProfile, HoldResult, OperatorState, ReservationSummary, SeatingSection, TableBlock, TableCombination, WaitlistEntry } from './types';
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
type OperatorMode = 'floor' | 'timeline' | 'availability' | 'reports';

function dateKeyFromTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

function dateFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = dateFromDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function serviceDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(dateFromDateKey(dateKey));
}

function OperatorPage() {
  const defaultServiceDate = nextBookableDate();
  const [token, setToken] = useState(sessionStorage.getItem('demoOperatorToken') || '');
  const [state, setState] = useState<OperatorState | null>(null);
  const [status, setStatus] = useState('Enter the protected demo operator passcode.');
  const [busy, setBusy] = useState(false);
  const [selectedServiceDate, setSelectedServiceDate] = useState(defaultServiceDate);
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [movingReference, setMovingReference] = useState<string | null>(null);
  const [dragTargetTable, setDragTargetTable] = useState<string | null>(null);
  const [operatorMode, setOperatorMode] = useState<OperatorMode>('floor');
  const [floorAction, setFloorAction] = useState<'seat' | 'block' | 'combine'>('seat');
  const [tableBlockReason, setTableBlockReason] = useState('Blocked from the iPad floor.');
  const [blockBusy, setBlockBusy] = useState(false);
  const [activeRail, setActiveRail] = useState<OperatorRailSection>('Floor');
  const [queueFilter, setQueueFilter] = useState('All');
  const [partySizeFilter, setPartySizeFilter] = useState<number | '7+' | null>(null);
  const [queueSearch, setQueueSearch] = useState('');
  const [bookDate, setBookDate] = useState(defaultServiceDate);
  const [bookTime, setBookTime] = useState('19:30');
  const [bookPartySize, setBookPartySize] = useState(2);
  const [bookSection, setBookSection] = useState<SeatingSection | 'either'>('indoor');
  const [bookGuestName, setBookGuestName] = useState('Operator Guest');
  const [bookMobile, setBookMobile] = useState('(209) 555-0100');
  const [bookNote, setBookNote] = useState('Booked from the operator iPad demo.');
  const [bookSlots, setBookSlots] = useState<AvailabilitySlot[]>([]);
  const [bookStatus, setBookStatus] = useState('Search live demo availability before booking from the iPad.');
  const [bookBusy, setBookBusy] = useState(false);
  const [selectedWaitlistId, setSelectedWaitlistId] = useState<string | null>(null);
  const [waitGuestName, setWaitGuestName] = useState('Walk-in Guest');
  const [waitContact, setWaitContact] = useState('(209) 555-0101');
  const [waitDate, setWaitDate] = useState(defaultServiceDate);
  const [waitTime, setWaitTime] = useState('19:30');
  const [waitPartySize, setWaitPartySize] = useState(2);
  const [waitSection, setWaitSection] = useState<SeatingSection | 'either'>('either');
  const [waitQuote, setWaitQuote] = useState(25);
  const [waitNote, setWaitNote] = useState('Walk-in from the host stand.');
  const [waitBusy, setWaitBusy] = useState(false);
  const [selectedGuestProfileId, setSelectedGuestProfileId] = useState<string | null>(null);
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [profileContactDraft, setProfileContactDraft] = useState('');
  const [profileTagsDraft, setProfileTagsDraft] = useState('');
  const [profilePreferencesDraft, setProfilePreferencesDraft] = useState('');
  const [profileNoteDraft, setProfileNoteDraft] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileDraftForId, setProfileDraftForId] = useState<string | null>(null);

  async function load(event?: FormEvent, loadedStatus = 'Operator view loaded from Supabase demo data.') {
    event?.preventDefault();
    setBusy(true);
    try {
      let result: OperatorState | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const next = await operatorList(token);
          if (!next.ok) throw new Error(next.error || 'Unauthorized');
          result = next;
          break;
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message.toLowerCase() : '';
          if (!message.includes('deadlock') && !message.includes('timeout')) throw error;
          await new Promise(resolve => window.setTimeout(resolve, 160 * (attempt + 1)));
        }
      }
      if (!result) throw lastError instanceof Error ? lastError : new Error('Operator data unavailable');
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
      selectReservation(reference);
      if (nextStatus === 'seated') setQueueFilter('Seated');
      if (nextStatus === 'completed') setQueueFilter('Done');
      if (nextStatus === 'cancelled') setQueueFilter('No-show');
      await load(undefined, tableCode ? `Seated ${reference} at table ${tableCode}.` : `Updated ${reference} to ${statusLabel(nextStatus)}.`);
      return true;
    } catch (error) {
      setStatus(`Update failed: ${error instanceof Error ? error.message : 'Try again.'}`);
      setBusy(false);
      return false;
    }
  }

  async function resetDemo() {
    if (!window.confirm('Reset all synthetic demo reservations?')) return;
    setBusy(true);
    try {
      await operatorReset(token);
      setSelectedReference(null);
      setSelectedWaitlistId(null);
      setSelectedGuestProfileId(null);
      setProfileDraftForId(null);
      setFloorAction('seat');
      setQueueFilter('All');
      await load(undefined, 'Synthetic demo data reset.');
    } catch (error) {
      setStatus(`Reset failed: ${error instanceof Error ? error.message : 'Try again.'}`);
      setBusy(false);
    }
  }

  function changeServiceDate(nextDate: string) {
    if (!nextDate) return;
    setSelectedServiceDate(nextDate);
    setBookDate(nextDate);
    setWaitDate(nextDate);
    setBookSlots([]);
    setSelectedReference(null);
    setSelectedWaitlistId(null);
    setMovingReference(null);
    setDragTargetTable(null);
    setFloorAction('seat');
    const label = serviceDateLabel(nextDate);
    setStatus(`Viewing ${label} dinner service.`);
    setBookStatus(`Ready to search ${label} dinner availability from the iPad.`);
  }

  function shiftServiceDate(days: number) {
    changeServiceDate(addDaysToDateKey(selectedServiceDate, days));
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
      setSelectedServiceDate(slot.date);
      setBookDate(slot.date);
      setWaitDate(slot.date);
      await operatorGuest(token, {
        op: 'attach',
        reference: result.reference,
        guestLabel: bookGuestName.trim() || 'Operator Guest',
        contact: normalizeDemoMobile(bookMobile),
        tags: ['Operator'],
        preferences: [section],
        privateNote: bookNote || 'Booked from the operator iPad demo.'
      });
      selectReservation(result.reference);
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

  async function createWaitlistEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWaitBusy(true);
    const message = `Adding ${waitPartySize}-top to the waitlist.`;
    setStatus(message);
    try {
      const result = await operatorWaitlist(token, {
        op: 'create',
        guestLabel: waitGuestName,
        contact: normalizeDemoMobile(waitContact),
        date: waitDate,
        time: waitTime,
        partySize: waitPartySize,
        section: waitSection,
        quotedWaitMinutes: waitQuote,
        note: waitNote
      });
      if (!result.ok || !result.waitlistId) throw new Error(result.error || 'Waitlist add failed');
      setSelectedWaitlistId(result.waitlistId);
      setSelectedReference(null);
      setSelectedGuestProfileId(null);
      setQueueFilter('Waitlist');
      setActiveRail('Wait');
      setOperatorMode('floor');
      await load(undefined, `Added ${result.entry?.guestLabel || waitGuestName} to the waitlist for ${waitPartySize}.`);
    } catch (error) {
      setStatus(`Waitlist add failed: ${error instanceof Error ? error.message : 'Try again.'}`);
    } finally {
      setWaitBusy(false);
    }
  }

  async function updateWaitlistStatus(entry: WaitlistEntry, nextStatus: 'waiting' | 'notified' | 'cancelled') {
    setWaitBusy(true);
    try {
      const result = await operatorWaitlist(token, { op: 'status', waitlistId: entry.id, status: nextStatus });
      if (!result.ok) throw new Error(result.error || 'Waitlist update failed');
      if (nextStatus === 'cancelled') setSelectedWaitlistId(null);
      await load(undefined, `${entry.guestLabel} marked ${statusLabel(nextStatus)} on the waitlist.`);
    } catch (error) {
      setStatus(`Waitlist update failed: ${error instanceof Error ? error.message : 'Try again.'}`);
    } finally {
      setWaitBusy(false);
    }
  }

  async function startWaitlistSeating(entry: WaitlistEntry) {
    setSelectedWaitlistId(entry.id);
    setSelectedReference(null);
    setSelectedGuestProfileId(null);
    setMovingReference(null);
    setOperatorMode('floor');
    setActiveRail('Wait');
    setQueueFilter('Waitlist');
    setStatus(`Seat ${entry.guestLabel} by tapping an open compatible table.`);
  }

  async function seatWaitlistAtTable(entry: WaitlistEntry, table: (typeof floorTables)[number]) {
    if (!['waiting', 'notified'].includes(entry.status)) {
      setStatus(`${entry.guestLabel} is ${statusLabel(entry.status)} and cannot be seated.`);
      return;
    }
    if (entry.partySize > table.seats) {
      setStatus(`Table ${table.code} only seats ${table.seats}; choose a larger table for ${entry.partySize}.`);
      return;
    }
    setWaitBusy(true);
    try {
      const result = await operatorWaitlist(token, { op: 'seat', waitlistId: entry.id, tableCode: table.code });
      if (!result.ok || !result.reference) throw new Error(result.error || 'Waitlist seating failed');
      await operatorGuest(token, {
        op: 'attach',
        reference: result.reference,
        guestLabel: entry.guestLabel,
        contact: normalizeDemoMobile(entry.contact || ''),
        tags: ['Walk-in'],
        preferences: [entry.section || 'either'],
        privateNote: entry.note || 'Seated from the iPad waitlist.'
      });
      selectReservation(result.reference);
      setQueueFilter('Seated');
      setActiveRail('Floor');
      await load(undefined, `Seated waitlist party ${result.reference} at table ${table.code}.`);
    } catch (error) {
      setStatus(`Waitlist seating failed: ${error instanceof Error ? error.message : 'Try again.'}`);
    } finally {
      setWaitBusy(false);
    }
  }

  const allBookings = state?.bookings || [];
  const allHolds = state?.holds || [];
  const allWaitlist = state?.waitlist || [];
  const profiles = state?.profiles || [];
  const allTableBlocks = state?.tableBlocks || [];
  const tableCombinations = state?.tableCombinations || [];
  const notifications = state?.notifications || [];
  const bookingIsOnSelectedService = (booking: ReservationSummary) => dateKeyFromTimestamp(booking.startsAt) === selectedServiceDate;
  const holdIsOnSelectedService = (hold: { startsAt: string }) => dateKeyFromTimestamp(hold.startsAt) === selectedServiceDate;
  const waitlistIsOnSelectedService = (entry: WaitlistEntry) => entry.requestedDate === selectedServiceDate || dateKeyFromTimestamp(entry.startsAt) === selectedServiceDate;
  const blockIsOnSelectedService = (block: TableBlock) => block.serviceDate === selectedServiceDate || dateKeyFromTimestamp(block.startsAt) === selectedServiceDate;
  const bookings = allBookings.filter(bookingIsOnSelectedService);
  const holds = allHolds.filter(holdIsOnSelectedService);
  const waitlist = allWaitlist.filter(waitlistIsOnSelectedService);
  const tableBlocks = allTableBlocks.filter(blockIsOnSelectedService);
  const selectedServiceLabel = serviceDateLabel(selectedServiceDate);
  const activeBookings = bookings.filter(booking => !['cancelled', 'completed'].includes(booking.status));
  const activeCount = activeBookings.reduce((total, booking) => total + booking.partySize, 0);
  const bookedCount = bookings.filter(booking => booking.status === 'confirmed').length;
  const seatedCount = bookings.filter(booking => booking.status === 'seated').length;
  const checkInCount = bookings.filter(booking => booking.status === 'checked_in').length;
  const completedCount = bookings.filter(booking => booking.status === 'completed').length;
  const cancelledCount = bookings.filter(booking => booking.status === 'cancelled').length;
  const previewCount = notifications.length;
  const openWaitlist = waitlist.filter(entry => ['waiting', 'notified'].includes(entry.status));
  const waitlistCount = openWaitlist.length;
  const reportAttentionCount = bookedCount + checkInCount + waitlistCount + tableBlocks.length;
  const explicitSelectedBooking = selectedReference ? bookings.find(booking => booking.reference === selectedReference) || null : null;
  const selectedWaitlistEntry = selectedWaitlistId ? waitlist.find(entry => entry.id === selectedWaitlistId) || null : null;
  const selectedBooking = selectedWaitlistEntry ? null : explicitSelectedBooking || activeBookings[0] || bookings[0] || null;
  const selectedGuestProfile = selectedGuestProfileId ? profiles.find(profile => profile.id === selectedGuestProfileId) || null : null;
  const selectedBookingProfile = selectedBooking?.guestProfileId ? profiles.find(profile => profile.id === selectedBooking.guestProfileId) || null : null;
  const activeGuestProfile = selectedGuestProfile || selectedBookingProfile || null;

  useEffect(() => {
    if (!activeGuestProfile) {
      if (profileDraftForId !== null) setProfileDraftForId(null);
      return;
    }
    if (profileDraftForId === activeGuestProfile.id) return;
    setProfileNameDraft(activeGuestProfile.guestLabel);
    setProfileContactDraft(activeGuestProfile.contact || '');
    setProfileTagsDraft(activeGuestProfile.tags.join(', '));
    setProfilePreferencesDraft(activeGuestProfile.preferences.join(', '));
    setProfileNoteDraft(activeGuestProfile.privateNote || '');
    setProfileDraftForId(activeGuestProfile.id);
  }, [activeGuestProfile, profileDraftForId]);
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
  const bookingsByTable = new Map(activeBookings.flatMap(booking => (booking.tableCodes?.length ? booking.tableCodes : booking.tableCode ? [booking.tableCode] : []).map(code => [code, booking] as const)));
  const tableBlocksByTable = new Map(tableBlocks.filter(block => block.status === 'active').map(block => [block.tableCode, block]));
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
    return [booking.reference, booking.guestLabel || 'Demo Guest', booking.section, booking.tableCode || '', ...(booking.tableCodes || []), formatLocalTime(booking.startsAt)]
      .some(value => value.toLowerCase().includes(query));
  };
  const visibleBookings = bookings.filter(booking => queueMatches(booking) && partyMatches(booking) && searchMatches(booking));
  const visibleActiveCovers = visibleBookings.filter(booking => !['cancelled', 'completed'].includes(booking.status)).reduce((total, booking) => total + booking.partySize, 0);
  const openHolds = holds.filter(hold => !['confirmed', 'cancelled', 'expired'].includes(hold.status));
  const waitlistMatches = (entry: WaitlistEntry) => {
    const query = queueSearch.trim().toLowerCase();
    if (!query) return true;
    return [entry.guestLabel, entry.id, entry.section || 'either', entry.requestedTime, entry.reference || '', entry.tableCode || '']
      .some(value => value.toLowerCase().includes(query));
  };
  const waitlistPartyMatches = (entry: WaitlistEntry) => {
    if (!partySizeFilter) return true;
    if (partySizeFilter === '7+') return entry.partySize >= 7;
    return entry.partySize === partySizeFilter;
  };
  const visibleWaitlist = queueFilter === 'Waitlist' ? openWaitlist.filter(entry => waitlistPartyMatches(entry) && waitlistMatches(entry)) : [];
  const visibleHolds = queueFilter === 'Waitlist' ? openHolds : [];
  const visibleNotifications = queueFilter === 'Notify' ? notifications : [];
  const profileMatches = (profile: GuestProfile) => {
    const query = queueSearch.trim().toLowerCase();
    if (!query) return true;
    return [profile.guestLabel, profile.contact || '', ...profile.tags, ...profile.preferences, ...profile.visits.map(visit => visit.reference)]
      .some(value => value.toLowerCase().includes(query));
  };
  const visibleProfiles = profiles.filter(profileMatches);
  const railGroups = [
    { label: 'All', count: bookings.length },
    { label: 'Notify', count: previewCount },
    { label: 'Waitlist', count: waitlistCount },
    { label: 'Booked', count: bookedCount },
    { label: 'Seated', count: seatedCount },
    { label: 'Done', count: completedCount },
    { label: 'No-show', count: cancelledCount }
  ];
  const timeSlots = ['5:00', '5:30', '6:00', '6:30', '7:00', '7:30', '8:00', '8:30', '9:00'];
  const timeSlotKeys = timeSlots.map((_, index) => `${String(17 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}`);
  const timelineGridTemplate = `96px repeat(${timeSlots.length}, minmax(76px, 1fr))`;
  const nonCancelledBookings = bookings.filter(booking => booking.status !== 'cancelled');
  const reportCovers = nonCancelledBookings.reduce((total, booking) => total + booking.partySize, 0);
  const completedCovers = bookings.filter(booking => booking.status === 'completed').reduce((total, booking) => total + booking.partySize, 0);
  const cancelledCovers = bookings.filter(booking => booking.status === 'cancelled').reduce((total, booking) => total + booking.partySize, 0);
  const averagePartySize = nonCancelledBookings.length ? (reportCovers / nonCancelledBookings.length).toFixed(1) : '0.0';
  const statusCoverReport = [
    { label: 'Booked', parties: bookings.filter(booking => booking.status === 'confirmed').length, covers: bookings.filter(booking => booking.status === 'confirmed').reduce((total, booking) => total + booking.partySize, 0) },
    { label: 'Checked in', parties: bookings.filter(booking => booking.status === 'checked_in').length, covers: bookings.filter(booking => booking.status === 'checked_in').reduce((total, booking) => total + booking.partySize, 0) },
    { label: 'Seated', parties: bookings.filter(booking => booking.status === 'seated').length, covers: bookings.filter(booking => booking.status === 'seated').reduce((total, booking) => total + booking.partySize, 0) },
    { label: 'Finished', parties: bookings.filter(booking => booking.status === 'completed').length, covers: completedCovers },
    { label: 'Cancelled', parties: bookings.filter(booking => booking.status === 'cancelled').length, covers: cancelledCovers }
  ];
  const sectionCoverReport = (['indoor', 'outdoor'] as SeatingSection[]).map(section => {
    const sectionBookings = nonCancelledBookings.filter(booking => booking.section === section);
    return {
      section,
      label: section === 'indoor' ? 'Dining room' : 'Patio',
      parties: sectionBookings.length,
      covers: sectionBookings.reduce((total, booking) => total + booking.partySize, 0)
    };
  });
  const reportOccupiedTableCodes = new Set(Array.from(bookingsByTable.keys()));
  const reportTotalSeats = floorTables.reduce((total, table) => total + table.seats, 0);
  const reportOccupiedSeats = floorTables.filter(table => reportOccupiedTableCodes.has(table.code)).reduce((total, table) => total + table.seats, 0);
  const reportBlockedTables = tableBlocks.filter(block => block.status === 'active').length;
  const reportOpenTables = Math.max(0, floorTables.length - reportOccupiedTableCodes.size - reportBlockedTables);
  const reportUtilization = reportTotalSeats ? Math.round((reportOccupiedSeats / reportTotalSeats) * 100) : 0;
  const averageWaitQuote = openWaitlist.length ? Math.round(openWaitlist.reduce((total, entry) => total + entry.quotedWaitMinutes, 0) / openWaitlist.length) : 0;
  const notifiedWaitlist = openWaitlist.filter(entry => entry.status === 'notified').length;
  const railItems: Array<{ icon: string; label: OperatorRailSection; count: number }> = [
    { icon: 'book', label: 'Book', count: bookedCount },
    { icon: 'floor', label: 'Floor', count: activeBookings.length + tableBlocks.length + tableCombinations.length },
    { icon: 'wait', label: 'Wait', count: waitlistCount },
    { icon: 'guest', label: 'Guests', count: profiles.length },
    { icon: 'reports', label: 'Reports', count: reportAttentionCount || reportCovers }
  ];
  const sectionNames = ['Dining Room', 'Patio'];
  const timelineBookings = [...visibleBookings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const timelineTableCodes = new Set(floorTables.map(table => table.code));
  const timelineBookingsByTable = new Map<string, typeof timelineBookings>();
  timelineBookings.forEach(booking => {
    const firstTableCode = (booking.tableCodes || []).find(code => timelineTableCodes.has(code));
    const key = firstTableCode || (booking.tableCode && timelineTableCodes.has(booking.tableCode) ? booking.tableCode : `${booking.section}-unassigned`);
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
  const servicePacingLimit = 10;
  const capacityBySlot = timeSlots.map((slot, index) => {
    const slotTime = timeSlotKeys[index];
    const covers = bookings
      .filter(booking => !['cancelled', 'completed'].includes(booking.status))
      .filter(booking => timelineLocalKey(booking.startsAt) === slotTime)
      .reduce((total, booking) => total + booking.partySize, 0);
    return { slot, time: slotTime, covers, remaining: Math.max(0, servicePacingLimit - covers) };
  });
  const reportPacingRows = timeSlots.map((slot, index) => {
    const slotData = capacityBySlot[index];
    const state = slotData.covers >= 10 ? 'full' : slotData.covers >= 8 ? 'tight' : slotData.covers > 0 ? 'paced' : 'open';
    return { ...slotData, slot, state, fill: Math.min(100, Math.round((slotData.covers / 10) * 100)) };
  });
  const busiestSlot = reportPacingRows.reduce((best, slot) => slot.covers > best.covers ? slot : best, reportPacingRows[0] || { slot: '5:00', covers: 0, remaining: 10, state: 'open', fill: 0, time: '17:00' });
  const pacingAlert = busiestSlot.covers >= 10
    ? `${busiestSlot.slot} is full.`
    : busiestSlot.covers >= 8
      ? `${busiestSlot.slot} is tight with ${busiestSlot.remaining} covers left.`
      : reportCovers > 0
        ? `${busiestSlot.slot} is the busiest slot.`
        : 'No covers are booked yet.';
  const nextTableTurns = activeBookings
    .filter(booking => booking.tableCode)
    .sort((a, b) => a.endsAt.localeCompare(b.endsAt))
    .slice(0, 5);
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
      setFloorAction('seat');
      setQueueFilter('All');
      return;
    }
    if (label === 'Wait') {
      setQueueFilter('Waitlist');
      return;
    }
    if (label === 'Guests') {
      setSelectedReference(null);
      setSelectedWaitlistId(null);
      if (!activeGuestProfile && profiles[0]) selectGuestProfile(profiles[0]);
      return;
    }
    setOperatorMode('reports');
    setQueueFilter('All');
    setSelectedWaitlistId(null);
  }
  function selectReservation(reference: string) {
    setSelectedReference(reference);
    setSelectedWaitlistId(null);
    setSelectedGuestProfileId(null);
    setFloorAction('seat');
  }

  function seedOperatorBook(time: string, section?: SeatingSection, partySize?: number) {
    setActiveRail('Book');
    setBookDate(selectedServiceDate);
    setBookTime(time);
    if (section) setBookSection(section);
    if (partySize) setBookPartySize(Math.min(Math.max(partySize, 1), 8));
    setBookStatus(`Ready to search ${partySize || bookPartySize} guests at ${time}.`);
  }

  function selectGuestProfile(profile: GuestProfile) {
    setSelectedGuestProfileId(profile.id);
    setSelectedReference(null);
    setSelectedWaitlistId(null);
    setProfileNameDraft(profile.guestLabel);
    setProfileContactDraft(profile.contact || '');
    setProfileTagsDraft(profile.tags.join(', '));
    setProfilePreferencesDraft(profile.preferences.join(', '));
    setProfileNoteDraft(profile.privateNote || '');
    setProfileDraftForId(profile.id);
    setActiveRail('Guests');
    setStatus(`Opened ${profile.guestLabel}'s guest profile.`);
  }

  async function saveGuestProfile(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!activeGuestProfile) return;
    setProfileBusy(true);
    try {
      const result = await operatorGuest(token, {
        op: 'update',
        profileId: activeGuestProfile.id,
        guestLabel: profileNameDraft || activeGuestProfile.guestLabel,
        contact: profileContactDraft,
        tags: profileListFromText(profileTagsDraft),
        preferences: profileListFromText(profilePreferencesDraft),
        privateNote: profileNoteDraft
      });
      if (!result.ok) throw new Error(result.error || 'Profile update failed');
      setSelectedGuestProfileId(activeGuestProfile.id);
      await load(undefined, `Updated ${profileNameDraft || activeGuestProfile.guestLabel}'s guest profile.`);
    } catch (error) {
      setStatus(`Profile update failed: ${error instanceof Error ? error.message : 'Try again.'}`);
    } finally {
      setProfileBusy(false);
    }
  }
  const movingBooking = movingReference ? bookings.find(booking => booking.reference === movingReference) || null : null;
  const moveCandidate = movingBooking || explicitSelectedBooking;
  const waitlistSeatCandidate = selectedWaitlistEntry && ['waiting', 'notified'].includes(selectedWaitlistEntry.status) ? selectedWaitlistEntry : null;
  const activeSeatCandidate = moveCandidate || waitlistSeatCandidate;
  const canMoveBooking = (booking?: ReservationSummary | null) => Boolean(booking && !['cancelled', 'completed'].includes(booking.status));
  const canSeatBookingAtTable = (booking: ReservationSummary | null | undefined, table: (typeof floorTables)[number]) => Boolean(booking && canMoveBooking(booking) && booking.partySize <= table.seats);
  const canSeatWaitlistAtTable = (entry: WaitlistEntry | null | undefined, table: (typeof floorTables)[number]) => Boolean(entry && ['waiting', 'notified'].includes(entry.status) && entry.partySize <= table.seats && (!entry.section || entry.section === (table.section === 'Patio' ? 'outdoor' : 'indoor')));
  const canSeatAtTable = (table: (typeof floorTables)[number]) => moveCandidate ? canSeatBookingAtTable(moveCandidate, table) : canSeatWaitlistAtTable(waitlistSeatCandidate, table);
  const canSeatBookingAtCombination = (booking: ReservationSummary | null | undefined, combination: TableCombination) => Boolean(booking && canMoveBooking(booking) && booking.partySize >= combination.minParty && booking.partySize <= combination.maxParty);
  const canSeatWaitlistAtCombination = (entry: WaitlistEntry | null | undefined, combination: TableCombination) => Boolean(entry && ['waiting', 'notified'].includes(entry.status) && entry.partySize >= combination.minParty && entry.partySize <= combination.maxParty && (!entry.section || entry.section === combination.section));
  const canSeatAtCombination = (combination: TableCombination) => moveCandidate ? canSeatBookingAtCombination(moveCandidate, combination) : canSeatWaitlistAtCombination(waitlistSeatCandidate, combination);
  const combinationStatus = (combination: TableCombination) => {
    const blocked = combination.tableCodes.map(code => tableBlocksByTable.get(code)).find(Boolean) || null;
    const occupied = combination.tableCodes.map(code => bookingsByTable.get(code)).find(booking => booking && booking.reference !== moveCandidate?.reference) || null;
    const selectedAlreadyThere = Boolean(moveCandidate && combination.tableCodes.every(code => bookingsByTable.get(code)?.reference === moveCandidate.reference));
    return { blocked, occupied, selectedAlreadyThere, open: !blocked && !occupied };
  };

  function beginMoveMode(booking: ReservationSummary) {
    selectReservation(booking.reference);
    setMovingReference(booking.reference);
    setOperatorMode('floor');
    setActiveRail('Floor');
    setFloorAction('seat');
    setStatus(`Moving ${booking.reference}. Drag or tap a compatible open table.`);
  }

  function beginReservationDrag(event: React.DragEvent<HTMLElement>, booking: ReservationSummary) {
    if (!canMoveBooking(booking)) {
      event.preventDefault();
      return;
    }
    selectReservation(booking.reference);
    setMovingReference(booking.reference);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', booking.reference);
    setStatus(`Dragging ${booking.reference}. Drop on an open compatible table.`);
  }

  function endReservationDrag() {
    setDragTargetTable(null);
  }

  function tableDragOver(event: React.DragEvent<HTMLElement>, table: (typeof floorTables)[number]) {
    const booking = moveCandidate;
    if (!booking || !canSeatBookingAtTable(booking, table)) return;
    const tableBooking = bookingsByTable.get(table.code);
    const tableBlock = tableBlocksByTable.get(table.code);
    if (tableBlock) return;
    if (tableBooking && tableBooking.reference !== booking.reference) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragTargetTable(table.code);
  }

  function tableDragLeave(table: (typeof floorTables)[number]) {
    if (dragTargetTable === table.code) setDragTargetTable(null);
  }

  async function dropBookingAtTable(event: React.DragEvent<HTMLElement>, table: (typeof floorTables)[number]) {
    event.preventDefault();
    const reference = event.dataTransfer.getData('text/plain') || movingReference || selectedReference;
    const booking = bookings.find(item => item.reference === reference) || moveCandidate;
    setDragTargetTable(null);
    if (!booking) return;
    await seatBookingAtTable(booking, table, true);
  }

  async function seatBookingAtTable(booking: ReservationSummary, table: (typeof floorTables)[number], fromDrag = false) {
    const tableBlock = tableBlocksByTable.get(table.code);
    if (tableBlock) {
      setStatus(`Table ${table.code} is blocked: ${tableBlock.reason}. Clear the block before seating.`);
      return;
    }
    const tableBooking = bookingsByTable.get(table.code);
    if (tableBooking && tableBooking.reference !== booking.reference) {
      selectReservation(tableBooking.reference);
      setStatus(`Selected ${tableBooking.reference} at table ${table.code}.`);
      return;
    }
    if (!canMoveBooking(booking)) {
      setStatus(`${booking.reference} is ${statusLabel(booking.status)} and cannot be moved.`);
      return;
    }
    if (!canSeatBookingAtTable(booking, table)) {
      setStatus(`Table ${table.code} only seats ${table.seats}; select a larger table for ${booking.partySize} guests.`);
      return;
    }
    setMovingReference(null);
    const updated = await setBookingStatus(booking.reference, 'seated', table.code);
    if (updated && fromDrag) setStatus(`Dropped ${booking.reference} at table ${table.code}.`);
  }

  async function seatBookingAtCombination(booking: ReservationSummary, combination: TableCombination) {
    const state = combinationStatus(combination);
    if (state.blocked) {
      setStatus(`Table ${state.blocked.tableCode} is blocked: ${state.blocked.reason}. Clear the block before combining.`);
      return;
    }
    if (state.occupied) {
      selectReservation(state.occupied.reference);
      setStatus(`Combination ${combination.code} includes occupied table ${state.occupied.tableCode || combination.code}.`);
      return;
    }
    if (!canSeatBookingAtCombination(booking, combination)) {
      setStatus(`${combination.code} fits ${combination.minParty}-${combination.maxParty}; select a different combination for ${booking.partySize} guests.`);
      return;
    }
    setMovingReference(null);
    const updated = await setBookingStatus(booking.reference, 'seated', combination.code);
    if (updated) setStatus(`Combined tables ${combination.code} for ${booking.reference}.`);
  }

  async function seatWaitlistAtCombination(entry: WaitlistEntry, combination: TableCombination) {
    const state = combinationStatus(combination);
    if (state.blocked) {
      setStatus(`Table ${state.blocked.tableCode} is blocked: ${state.blocked.reason}. Clear the block before combining.`);
      return;
    }
    if (state.occupied) {
      selectReservation(state.occupied.reference);
      setStatus(`Combination ${combination.code} includes an occupied table.`);
      return;
    }
    if (!canSeatWaitlistAtCombination(entry, combination)) {
      setStatus(`${combination.code} fits ${combination.minParty}-${combination.maxParty}; choose a different combination for ${entry.partySize}.`);
      return;
    }
    setWaitBusy(true);
    try {
      const result = await operatorWaitlist(token, { op: 'seat', waitlistId: entry.id, tableCode: combination.code });
      if (!result.ok || !result.reference) throw new Error(result.error || 'Waitlist seating failed');
      await operatorGuest(token, {
        op: 'attach',
        reference: result.reference,
        guestLabel: entry.guestLabel,
        contact: normalizeDemoMobile(entry.contact || ''),
        tags: ['Walk-in'],
        preferences: [combination.section],
        privateNote: entry.note || 'Seated at combined tables from the iPad waitlist.'
      });
      selectReservation(result.reference);
      setQueueFilter('Seated');
      setActiveRail('Floor');
      await load(undefined, `Seated waitlist party ${result.reference} at tables ${combination.code}.`);
    } catch (error) {
      setStatus(`Waitlist seating failed: ${error instanceof Error ? error.message : 'Try again.'}`);
    } finally {
      setWaitBusy(false);
    }
  }

  async function seatSelectedAtCombination(combination: TableCombination) {
    if (moveCandidate) {
      await seatBookingAtCombination(moveCandidate, combination);
      return;
    }
    if (waitlistSeatCandidate) {
      await seatWaitlistAtCombination(waitlistSeatCandidate, combination);
      return;
    }
    setStatus(`Select a booked party or waitlist party before combining ${combination.code}.`);
  }

  async function handleTableTap(table: (typeof floorTables)[number]) {
    const tableBlock = tableBlocksByTable.get(table.code);
    if (floorAction === 'combine') {
      const matches = tableCombinations.filter(combo => combo.tableCodes.includes(table.code));
      if (matches.length === 1) {
        await seatSelectedAtCombination(matches[0]);
        return;
      }
      if (matches.length > 1) {
        setStatus(`Table ${table.code} belongs to ${matches.map(combo => combo.code).join(', ')}. Choose the combination card on the right.`);
        return;
      }
      setStatus(`Table ${table.code} has no configured combination.`);
      return;
    }
    if (floorAction === 'block') {
      if (tableBlock) {
        setStatus(`Table ${table.code} is already blocked: ${tableBlock.reason}.`);
        return;
      }
      await blockTable(table);
      return;
    }
    if (tableBlock) {
      setStatus(`Table ${table.code} is blocked: ${tableBlock.reason}. Clear the block before seating or booking.`);
      return;
    }
    await seatSelectedAtTable(table);
  }

  async function seatSelectedAtTable(table: (typeof floorTables)[number]) {
    if (moveCandidate) {
      await seatBookingAtTable(moveCandidate, table);
      return;
    }
    if (waitlistSeatCandidate) {
      await seatWaitlistAtTable(waitlistSeatCandidate, table);
      return;
    }
    seedOperatorBook(bookTime, table.section === 'Patio' ? 'outdoor' : 'indoor', table.seats);
    setStatus(`Started a ${table.seats}-top booking search from open table ${table.code}.`);
  }

  async function blockTable(table: (typeof floorTables)[number]) {
    const tableBooking = bookingsByTable.get(table.code);
    if (tableBooking) {
      selectReservation(tableBooking.reference);
      setStatus(`Table ${table.code} has ${tableBooking.reference}; finish or move that party before blocking.`);
      return;
    }
    setBlockBusy(true);
    try {
      const result = await operatorFloor(token, { op: 'block', tableCode: table.code, date: selectedServiceDate, reason: tableBlockReason });
      if (!result.ok || !result.tableBlock) throw new Error(result.error || 'Table block failed');
      setFloorAction('seat');
      await load(undefined, `Blocked table ${table.code}: ${result.tableBlock.reason}.`);
    } catch (error) {
      setStatus(`Table block failed: ${error instanceof Error ? error.message : 'Try again.'}`);
    } finally {
      setBlockBusy(false);
    }
  }

  async function clearTableBlock(block: TableBlock) {
    setBlockBusy(true);
    try {
      const result = await operatorFloor(token, { op: 'clear', blockId: block.id });
      if (!result.ok) throw new Error(result.error || 'Clear block failed');
      await load(undefined, `Cleared block on table ${block.tableCode}.`);
    } catch (error) {
      setStatus(`Clear block failed: ${error instanceof Error ? error.message : 'Try again.'}`);
    } finally {
      setBlockBusy(false);
    }
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
                <button type="button" aria-label="Previous service" onClick={() => shiftServiceDate(-1)}>‹</button>
                <label className="resyos-service-date-picker" aria-label="Service date">
                  <span>{selectedServiceLabel}</span>
                  <input id="operator-service-date" type="date" value={selectedServiceDate} onChange={event => changeServiceDate(event.target.value)} aria-label="Choose service date" />
                </label>
                <button type="button" aria-label="Open date picker" onClick={() => document.getElementById('operator-service-date')?.focus()}>▣</button>
                <strong>Dinner</strong>
                <button type="button" aria-label="Next service" onClick={() => shiftServiceDate(1)}>›</button>
              </div>
              <div className="resyos-mode-controls" aria-label="View controls">
                {(['floor', 'timeline', 'availability', 'reports'] as const).map(mode => (
                  <button
                    type="button"
                    key={mode}
                    className={operatorMode === mode ? 'active' : ''}
                    aria-pressed={operatorMode === mode}
                    onClick={() => {
                      if (mode === 'reports') {
                        selectOperatorRail('Reports');
                        return;
                      }
                      setOperatorMode(mode);
                      if (activeRail === 'Reports') setActiveRail('Floor');
                    }}
                  >
                    {mode === 'floor' ? 'Floor' : mode === 'timeline' ? 'Timeline' : mode === 'availability' ? 'Availability' : 'Reports'}
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
              <article><span>Waitlist</span><strong>{waitlistCount}</strong></article>
              <article><span>Profiles</span><strong>{profiles.length}</strong></article>
              <article><span>Blocks</span><strong>{tableBlocks.length}</strong></article>
              <article><span>Combos</span><strong>{tableCombinations.length}</strong></article>
              <article><span>Text previews</span><strong>{previewCount}</strong></article>
            </section>
            <section className="resyos-workbench">
              <aside className="resyos-left-rail" aria-label="Guest queues">
              {activeRail !== 'Book' && activeRail !== 'Reports' && (
                <>
                  <label className="queue-search">
                    <span className="sr-only">Search guest or reference</span>
                    <input value={queueSearch} onChange={event => setQueueSearch(event.target.value)} placeholder={activeRail === 'Guests' ? 'Search guestbook' : 'Search guest or reference'} aria-label={activeRail === 'Guests' ? 'Search guestbook' : 'Search guest or reference'} />
                  </label>
                  {activeRail !== 'Guests' && <div className="queue-tabs" aria-label="Reservation queues">
                    {railGroups.map(group => (
                      <button type="button" key={group.label} className={queueFilter === group.label ? 'active' : ''} aria-pressed={queueFilter === group.label} onClick={() => setQueueFilter(group.label)}>
                        <span>{group.label}</span>
                        <strong>{group.count}</strong>
                      </button>
                    ))}
                  </div>}
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
                    <label>Date<input type="date" value={bookDate} onChange={event => changeServiceDate(event.target.value)} aria-label="Operator booking date" /></label>
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
              ) : activeRail === 'Guests' ? (
              <div className="guestbook-panel" aria-label="Guestbook profiles">
                <div className="section-heading">
                  <div>
                    <h2>Guestbook</h2>
                    <p>{visibleProfiles.length} visible profiles · {profiles.length} synthetic guest records.</p>
                  </div>
                </div>
                {profiles.length === 0 && <p>No guest profiles yet. Book from the iPad or seat a waitlist party to create one.</p>}
                {profiles.length > 0 && visibleProfiles.length === 0 && <p>No profiles match this search.</p>}
                <div className="guest-profile-list">
                  {visibleProfiles.map(profile => (
                    <article key={profile.id} className={`guest-profile-card ${activeGuestProfile?.id === profile.id ? 'selected' : ''}`}>
                      <button type="button" className="guest-profile-select" onClick={() => selectGuestProfile(profile)} aria-label={`Open guest profile ${profile.guestLabel}`}>
                        <strong>{profile.guestLabel}</strong>
                        <span>{profile.contact || 'No mobile'} · {profile.visitCount} {profile.visitCount === 1 ? 'visit' : 'visits'}</span>
                      </button>
                      <div className="guest-profile-meta">
                        <span>{profile.upcomingCount} active</span>
                        {profile.lastVisitAt && <span>Last {formatLocalTime(profile.lastVisitAt)}</span>}
                      </div>
                      <div className="operator-tags" aria-label={`${profile.guestLabel} tags`}>
                        {(profile.tags.length ? profile.tags : ['Guest']).map(tag => <span key={`${profile.id}-tag-${tag}`}>{tag}</span>)}
                        {(profile.preferences.length ? profile.preferences : []).slice(0, 2).map(pref => <span key={`${profile.id}-pref-${pref}`}>{pref}</span>)}
                      </div>
                      {profile.visits[0] && <p>{profile.visits[0].reference} · {profile.visits[0].partySize} guests · {statusLabel(profile.visits[0].status)}</p>}
                    </article>
                  ))}
                </div>
              </div>
              ) : activeRail === 'Reports' ? (
              <div className="reports-summary-panel" aria-label="Reports summary">
                <div className="section-heading">
                  <div>
                    <h2>Reports</h2>
                    <p>Live cover report, pacing, waitlist, and table-turn readout.</p>
                  </div>
                </div>
                <article className="report-mini-card primary">
                  <span>Total covers</span>
                  <strong>{reportCovers}</strong>
                  <small>{nonCancelledBookings.length} parties · avg {averagePartySize}</small>
                </article>
                <article className="report-mini-card">
                  <span>Pacing alert</span>
                  <strong>{busiestSlot.slot}</strong>
                  <small>{pacingAlert}</small>
                </article>
                <article className="report-mini-card">
                  <span>Table utilization</span>
                  <strong>{reportUtilization}%</strong>
                  <small>{reportOccupiedTableCodes.size} occupied · {reportOpenTables} open · {reportBlockedTables} blocked</small>
                </article>
                <article className="report-mini-card">
                  <span>Waitlist health</span>
                  <strong>{waitlistCount}</strong>
                  <small>{notifiedWaitlist} notified · {averageWaitQuote || 0} min avg quote</small>
                </article>
                <button type="button" className="report-open-button" onClick={() => setOperatorMode('reports')}>Open daily report</button>
              </div>
              ) : (
              <div className="operator-list">
                <div className="section-heading">
                  <div>
                    <h2>Reservations</h2>
                    <p>{queueFilter} queue · {visibleBookings.length + visibleWaitlist.length + visibleHolds.length + visibleNotifications.length} visible · {visibleActiveCovers} active covers.</p>
                  </div>
                </div>
                {activeRail === 'Wait' && (
                  <form className="waitlist-form" aria-label="Add walk-in waitlist party" onSubmit={createWaitlistEntry}>
                    <div className="waitlist-form-head">
                      <strong>Add walk-in</strong>
                      <span>Quote, notify, and seat from the floor.</span>
                    </div>
                    <label>Guest<input value={waitGuestName} onChange={event => setWaitGuestName(event.target.value)} aria-label="Waitlist guest name" /></label>
                    <label>Mobile<input value={waitContact} onChange={event => setWaitContact(event.target.value)} aria-label="Waitlist guest mobile" /></label>
                    <div className="operator-book-inline">
                      <label>Date<input type="date" value={waitDate} onChange={event => changeServiceDate(event.target.value)} aria-label="Waitlist requested date" /></label>
                      <label>Time<input type="time" value={waitTime} onChange={event => setWaitTime(event.target.value)} aria-label="Waitlist requested time" /></label>
                    </div>
                    <div className="operator-book-inline">
                      <label>Quote<input type="number" min="0" max="240" value={waitQuote} onChange={event => setWaitQuote(Number(event.target.value))} aria-label="Quoted wait minutes" /></label>
                      <label>Party<select value={waitPartySize} onChange={event => setWaitPartySize(Number(event.target.value))} aria-label="Waitlist party size">{[1, 2, 3, 4, 5, 6, 7, 8].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
                    </div>
                    <div className="operator-book-inline">
                      <label>Area<select value={waitSection} onChange={event => setWaitSection(event.target.value as SeatingSection | 'either')} aria-label="Waitlist seating preference"><option value="either">Either</option><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select></label>
                      <span className="operator-service-note">{selectedServiceLabel} dinner</span>
                    </div>
                    <label>Note<textarea value={waitNote} onChange={event => setWaitNote(event.target.value)} maxLength={180} aria-label="Waitlist note" /></label>
                    <button type="submit" disabled={busy || waitBusy}>{waitBusy ? 'Adding...' : 'Add to waitlist'}</button>
                  </form>
                )}
                {bookings.length === 0 && queueFilter !== 'Waitlist' && queueFilter !== 'Notify' && <p>No synthetic bookings yet.</p>}
                {queueFilter === 'Waitlist' && visibleWaitlist.length === 0 && <p>No active walk-ins on the waitlist.</p>}
                {queueFilter === 'Notify' && visibleNotifications.length === 0 && <p>No notification previews yet.</p>}
                {bookings.length > 0 && queueFilter !== 'Waitlist' && queueFilter !== 'Notify' && visibleBookings.length === 0 && <p>No parties match this queue, party size, or search.</p>}
                {visibleWaitlist.map(entry => (
                  <article key={entry.id} className={`operator-row waitlist-row ${entry.status} ${selectedWaitlistId === entry.id ? 'selected' : ''}`}>
                    <button
                      type="button"
                      className="operator-row-select"
                      onClick={() => { setSelectedWaitlistId(entry.id); setSelectedReference(null); setSelectedGuestProfileId(null); }}
                      aria-label={`Select waitlist ${entry.guestLabel}`}
                    >
                      <span className="sr-only">Select waitlist party</span>
                    </button>
                    <div className="operator-guest">
                      <strong>{entry.guestLabel}</strong>
                      <span>{entry.id.slice(0, 8)} · {entry.quotedWaitMinutes} min quote</span>
                    </div>
                    <div className="operator-time">
                      <strong>{formatLocalTime(entry.startsAt)}</strong>
                      <span>{entry.partySize} guests · {entry.section || 'either'} · {entry.note || 'Walk-in'}</span>
                    </div>
                    <div className="operator-tags" aria-label="Waitlist service notes">
                      <span>Walk-in</span>
                      <span>{entry.section || 'either'}</span>
                      <span>{entry.partySize} top</span>
                    </div>
                    <span className="status-pill">{statusLabel(entry.status)}</span>
                    <div className="operator-actions">
                      <button disabled={busy || waitBusy || entry.status === 'notified'} onClick={() => updateWaitlistStatus(entry, 'notified')}>Notify</button>
                      <button disabled={busy || waitBusy} onClick={() => startWaitlistSeating(entry)}>Seat from floor</button>
                      <button disabled={busy || waitBusy} onClick={() => updateWaitlistStatus(entry, 'cancelled')}>Cancel</button>
                    </div>
                  </article>
                ))}
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
                  <article
                    key={booking.reference}
                    className={`operator-row ${booking.status} ${selectedBooking?.reference === booking.reference ? 'selected' : ''} ${movingReference === booking.reference ? 'moving' : ''}`}
                    draggable={canMoveBooking(booking)}
                    onDragStart={event => beginReservationDrag(event, booking)}
                    onDragEnd={endReservationDrag}
                  >
                    <button
                      type="button"
                      className="operator-row-select"
                      draggable={canMoveBooking(booking)}
                      onDragStart={event => beginReservationDrag(event, booking)}
                      onDragEnd={endReservationDrag}
                      onClick={() => selectReservation(booking.reference)}
                      aria-label={`Select ${booking.guestLabel || 'Demo Guest'} ${booking.reference}`}
                    >
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
                      {(booking.guestTags?.length ? booking.guestTags.slice(0, 2) : [booking.visitCount && booking.visitCount > 1 ? `${booking.visitCount} visits` : 'First visit']).map(tag => <span key={tag}>{tag}</span>)}
                      <span>{booking.section}</span>
                      <span>{booking.partySize} top</span>
                      {booking.privateNotePreview && <span>Private note</span>}
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
              <div className={`floor-plan-panel mode-${activeRail === 'Reports' ? 'reports' : operatorMode}`}>
                {activeRail !== 'Reports' && operatorMode === 'floor' && (
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
                            const tableBlock = tableBlocksByTable.get(table.code);
                            const tileStatus = booking ? booking.status : tableBlock ? 'blocked' : 'open';
                            const assignable = floorAction === 'seat' && !booking && !tableBlock && canSeatAtTable(table);
                            const blockable = !booking && !tableBlock && floorAction === 'block';
                            const dropReady = assignable && Boolean(activeSeatCandidate);
                            const dragOver = dragTargetTable === table.code;
                            const comboMember = floorAction === 'combine' && tableCombinations.some(combo => combo.tableCodes.includes(table.code));
                            const tooSmall = floorAction === 'seat' && !booking && !tableBlock && Boolean(activeSeatCandidate && activeSeatCandidate.partySize > table.seats);
                            return (
                              <button
                                type="button"
                                key={table.code}
                                className={`floor-table ${table.shape} ${tileStatus} ${assignable ? 'assignable' : ''} ${blockable ? 'blockable' : ''} ${dropReady ? 'drop-ready' : ''} ${dragOver ? 'drag-over' : ''} ${tooSmall ? 'too-small' : ''} ${comboMember ? 'combo-member' : ''} ${booking && selectedBooking?.reference === booking.reference ? 'selected' : ''}`}
                                style={{ left: `${table.x}%`, top: `${table.y}%`, width: `${table.w}%`, height: `${table.h}%` }}
                                onClick={() => handleTableTap(table)}
                                onDragOver={event => tableDragOver(event, table)}
                                onDragLeave={() => tableDragLeave(table)}
                                onDrop={event => dropBookingAtTable(event, table)}
                                aria-pressed={Boolean(booking && selectedBooking?.reference === booking.reference)}
                                aria-label={`Table ${table.code}, ${table.seats} seats${booking ? `, ${statusLabel(booking.status)}, ${booking.partySize} guests at ${formatLocalTime(booking.startsAt)}` : tableBlock ? `, blocked, ${tableBlock.reason}` : assignable ? `, open, drop ${moveCandidate?.reference || selectedWaitlistEntry?.guestLabel || 'selected party'} here` : floorAction === 'block' ? ', open, block this table' : ', open'}`}
                              >
                                <strong>{table.code}</strong>
                                <span>{booking ? `${booking.partySize} · ${formatLocalTime(booking.startsAt)}` : tableBlock ? 'Blocked' : assignable ? (movingReference ? 'Drop here' : 'Seat here') : blockable ? 'Block' : comboMember ? 'Combo' : `${table.seats}p`}</span>
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
                    {selectedWaitlistEntry && (
                      <aside className={`guest-popover waitlist ${selectedWaitlistEntry.status}`} aria-label="Selected waitlist preview">
                        <span>{formatLocalTime(selectedWaitlistEntry.startsAt)}</span>
                        <strong>{selectedWaitlistEntry.guestLabel}</strong>
                        <p>{selectedWaitlistEntry.partySize} guests · {selectedWaitlistEntry.section || 'either'} · {selectedWaitlistEntry.quotedWaitMinutes} min quote · {statusLabel(selectedWaitlistEntry.status)}</p>
                      </aside>
                    )}
                  </>
                )}
                {activeRail !== 'Reports' && operatorMode === 'timeline' && (
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
                                const tableBlock = tableBlocksByTable.get(table.code);
                                const rowCanSeat = !tableBooking && !tableBlock && canSeatAtTable(table);
                                return (
                                  <div key={table.code} className={`timeline-table-row ${rowCanSeat ? 'assignable' : ''} ${tableBlock ? 'blocked' : ''}`} style={{ gridTemplateColumns: timelineGridTemplate }} role="row">
                                    <button type="button" className={`timeline-table-label ${rowCanSeat ? 'assignable' : ''} ${tableBlock ? 'blocked' : ''}`} onClick={() => tableBlock ? setStatus(`Table ${table.code} is blocked: ${tableBlock.reason}.`) : seatSelectedAtTable(table)} aria-label={`Timeline table ${table.code}, ${table.seats} seats${tableBlock ? ', blocked' : ''}`}>
                                      <strong>{table.code}</strong>
                                      <span>{tableBlock ? 'Blocked' : `${table.seats}p`}</span>
                                    </button>
                                    {timeSlots.map((slot, index) => (
                                      <button
                                        type="button"
                                        key={`${table.code}-${slot}`}
                                        className="timeline-cell"
                                        onClick={() => tableBlock ? setStatus(`Table ${table.code} is blocked: ${tableBlock.reason}.`) : rowCanSeat ? seatSelectedAtTable(table) : seedOperatorBook(timeSlotKeys[index], table.section === 'Patio' ? 'outdoor' : 'indoor', table.seats)}
                                        aria-label={tableBlock ? `Table ${table.code} blocked at ${slot}` : rowCanSeat ? `Seat ${selectedBooking?.reference} at table ${table.code} from ${slot}` : `Book table ${table.code} at ${slot}`}
                                      />
                                    ))}
                                    {rowBookings.map(booking => (
                                      <button
                                        type="button"
                                        key={booking.reference}
                                        className={`timeline-reservation-card ${booking.status} ${selectedBooking?.reference === booking.reference ? 'selected' : ''}`}
                                        style={{ gridColumn: timelineGridColumn(booking) }}
                                        draggable={canMoveBooking(booking)}
                                        onDragStart={event => beginReservationDrag(event, booking)}
                                        onDragEnd={endReservationDrag}
                                        onClick={() => selectReservation(booking.reference)}
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
                                      draggable={canMoveBooking(booking)}
                                      onDragStart={event => beginReservationDrag(event, booking)}
                                      onDragEnd={endReservationDrag}
                                      onClick={() => selectReservation(booking.reference)}
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
                {activeRail !== 'Reports' && operatorMode === 'availability' && (
                  <section className="availability-board" aria-label="Availability by service time">
                    <div className="timeline-board-head">
                      <h2>Availability</h2>
                      <span>{selectedServiceLabel} dinner capacity by half hour</span>
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
                {operatorMode === 'reports' && (
                  <section className="service-report-board" aria-label="Daily cover report">
                    <div className="timeline-board-head">
                      <h2>Live service report</h2>
                      <span>{selectedServiceLabel} · Dinner</span>
                    </div>
                    <div className="report-hero-grid">
                      <article>
                        <span>Total covers</span>
                        <strong>{reportCovers}</strong>
                        <small>{nonCancelledBookings.length} booked parties</small>
                      </article>
                      <article>
                        <span>Active covers</span>
                        <strong>{activeCount}</strong>
                        <small>{seatedCount} seated · {checkInCount} checked in</small>
                      </article>
                      <article>
                        <span>Avg party</span>
                        <strong>{averagePartySize}</strong>
                        <small>{cancelledCovers} cancelled covers</small>
                      </article>
                      <article>
                        <span>Utilization</span>
                        <strong>{reportUtilization}%</strong>
                        <small>{reportOccupiedSeats}/{reportTotalSeats} seats assigned</small>
                      </article>
                    </div>
                    <div className="report-columns">
                      <section className="report-panel" aria-label="Cover pacing report">
                        <div className="report-panel-head">
                          <h3>Cover pacing</h3>
                          <span>{pacingAlert}</span>
                        </div>
                        <div className="pacing-list">
                          {reportPacingRows.map(row => (
                            <article key={row.slot} className={`pacing-row ${row.state}`}>
                              <div>
                                <strong>{row.slot}</strong>
                                <span>{row.covers}/10 covers · {row.remaining} open</span>
                              </div>
                              <i aria-hidden="true"><b style={{ width: `${row.fill}%` }} /></i>
                              <em>{row.state === 'full' ? 'Full' : row.state === 'tight' ? 'Tight' : row.state === 'paced' ? 'Paced' : 'Open'}</em>
                            </article>
                          ))}
                        </div>
                      </section>
                      <section className="report-panel" aria-label="Live floor status report">
                        <div className="report-panel-head">
                          <h3>Live floor status</h3>
                          <span>{reportOpenTables} open tables</span>
                        </div>
                        <div className="status-report-grid">
                          {statusCoverReport.map(row => (
                            <article key={row.label}>
                              <span>{row.label}</span>
                              <strong>{row.covers}</strong>
                              <small>{row.parties} parties</small>
                            </article>
                          ))}
                        </div>
                        <div className="section-report-list" aria-label="Section cover report">
                          {sectionCoverReport.map(row => (
                            <article key={row.section}>
                              <strong>{row.label}</strong>
                              <span>{row.covers} covers · {row.parties} parties</span>
                            </article>
                          ))}
                        </div>
                      </section>
                    </div>
                    <section className="report-panel table-turn-panel" aria-label="Table turns report">
                      <div className="report-panel-head">
                        <h3>Table turns</h3>
                        <span>{nextTableTurns.length} active assigned parties</span>
                      </div>
                      {nextTableTurns.length === 0 ? <p>No assigned table turns yet.</p> : nextTableTurns.map(booking => (
                        <article key={booking.reference} className="turn-row">
                          <div>
                            <strong>{booking.tableCode || 'Pending'}</strong>
                            <span>{booking.guestLabel || 'Demo Guest'} · {booking.reference} · {booking.partySize} guests</span>
                          </div>
                          <em>{statusLabel(booking.status)}</em>
                          <span>{formatLocalTime(booking.startsAt)} to {formatLocalTime(booking.endsAt)}</span>
                        </article>
                      ))}
                    </section>
                  </section>
                )}
              </div>
              <footer className="cover-ticker" aria-label="Dine-in cover pacing">
                <strong>{activeCount} DINE-IN COVERS</strong>
                {timeSlots.map((slot, index) => <span key={slot}>{Math.max(0, activeCount - index)}/10<small>{slot}</small></span>)}
              </footer>
            </section>
            <aside className="floor-panel resyos-side-panel" tabIndex={0} aria-label="Service details">
              {activeRail === 'Reports' && (
                <section className="report-side-card" aria-label="Report insights">
                  <h2>Report insights</h2>
                  <p>{pacingAlert}</p>
                  <div>
                    <span>{reportCovers} covers</span>
                    <span>{reportUtilization}% seats assigned</span>
                    <span>{waitlistCount} waiting</span>
                  </div>
                </section>
              )}
              <section aria-labelledby="floor-title">
                <h2 id="floor-title">Floor snapshot</h2>
                <p>Spatial map mirrors the service queue: booked, checked in, seated, finished, cancelled, open, or blocked.</p>
                <div className="floor-legend" aria-label="Floor status legend">
                  <span><i className="legend-confirmed"></i>Booked</span>
                  <span><i className="legend-checked"></i>Checked in</span>
                  <span><i className="legend-seated"></i>Seated</span>
                  <span><i className="legend-blocked"></i>Blocked</span>
                </div>
                <div className="floor-control-card" aria-label="Floor table controls">
                  <div className="side-actions floor-control-actions">
                    <button type="button" aria-pressed={floorAction === 'seat'} disabled={blockBusy} onClick={() => setFloorAction('seat')}>Seat mode</button>
                    <button type="button" aria-pressed={floorAction === 'combine'} disabled={blockBusy} onClick={() => { setFloorAction(floorAction === 'combine' ? 'seat' : 'combine'); setMovingReference(null); }}>Combine tables</button>
                    <button type="button" aria-pressed={floorAction === 'block'} disabled={blockBusy} onClick={() => { setFloorAction(floorAction === 'block' ? 'seat' : 'block'); setMovingReference(null); }}>Block table</button>
                  </div>
                  <label>Block note<input value={tableBlockReason} onChange={event => setTableBlockReason(event.target.value)} maxLength={110} aria-label="Table block reason" /></label>
                  {floorAction === 'block' && <p className="move-hint">Tap an open table to block it for this dinner service.</p>}
                  {floorAction === 'combine' && <p className="move-hint">Choose a combination below, or tap a highlighted member table to find its combinations.</p>}
                </div>
              </section>
              {selectedBooking && (
                <section aria-labelledby="selected-party-title" className={`selected-party-panel ${movingReference === selectedBooking.reference ? 'move-mode' : ''}`}>
                  <h2 id="selected-party-title">Selected party</h2>
                  <strong>{selectedBooking.guestLabel || 'Demo Guest'}</strong>
                  <p>{formatLocalTime(selectedBooking.startsAt)} · {selectedBooking.partySize} guests · {selectedBooking.section} · table {selectedBooking.tableCode || 'pending'} · {statusLabel(selectedBooking.status)}</p>
                  <div className="profile-chip-row" aria-label="Selected guest quick tags">
                    {(selectedBooking.guestTags?.length ? selectedBooking.guestTags.slice(0, 3) : [selectedBooking.visitCount && selectedBooking.visitCount > 1 ? `${selectedBooking.visitCount} visits` : 'First visit']).map(tag => <span key={tag}>{tag}</span>)}
                  </div>
                  {selectedBookingProfile && (
                    <div className="profile-mini-card">
                      <span>{selectedBookingProfile.visitCount} {selectedBookingProfile.visitCount === 1 ? 'visit' : 'visits'}</span>
                      <strong>{selectedBookingProfile.tags.join(', ') || 'Guest profile'}</strong>
                      {selectedBookingProfile.privateNote && <p>{selectedBookingProfile.privateNote}</p>}
                    </div>
                  )}
                  <div className="side-actions">
                    <button disabled={busy} onClick={() => setBookingStatus(selectedBooking.reference, 'checked_in')}>Check in</button>
                    <button disabled={busy} onClick={() => setBookingStatus(selectedBooking.reference, 'seated')}>Seat</button>
                    <button disabled={busy || !canMoveBooking(selectedBooking)} onClick={() => beginMoveMode(selectedBooking)}>{movingReference === selectedBooking.reference ? 'Moving' : 'Move table'}</button>
                    <button disabled={!selectedBookingProfile} onClick={() => selectedBookingProfile && selectGuestProfile(selectedBookingProfile)}>Open profile</button>
                  </div>
                  {movingReference === selectedBooking.reference && <p className="move-hint">Drag this party or tap an open highlighted table.</p>}
                </section>
              )}

              {selectedWaitlistEntry && (
                <section aria-labelledby="selected-waitlist-title" className="selected-party-panel waitlist-selected move-mode">
                  <h2 id="selected-waitlist-title">Selected waitlist</h2>
                  <strong>{selectedWaitlistEntry.guestLabel}</strong>
                  <p>{formatLocalTime(selectedWaitlistEntry.startsAt)} · {selectedWaitlistEntry.partySize} guests · {selectedWaitlistEntry.section || 'either'} · {selectedWaitlistEntry.quotedWaitMinutes} min quote · {statusLabel(selectedWaitlistEntry.status)}</p>
                  <div className="side-actions">
                    <button disabled={busy || waitBusy || selectedWaitlistEntry.status === 'notified'} onClick={() => updateWaitlistStatus(selectedWaitlistEntry, 'notified')}>Notify</button>
                    <button disabled={busy || waitBusy} onClick={() => startWaitlistSeating(selectedWaitlistEntry)}>Seat from floor</button>
                    <button disabled={busy || waitBusy} onClick={() => updateWaitlistStatus(selectedWaitlistEntry, 'cancelled')}>Cancel</button>
                  </div>
                  <p className="move-hint">Tap an open highlighted table to seat this walk-in.</p>
                </section>
              )}
              {activeGuestProfile && (
                <section aria-label="Guestbook profile" className="guest-profile-editor">
                  <h2 id="guest-profile-title">Guest profile</h2>
                  <strong>{activeGuestProfile.guestLabel}</strong>
                  <p>{activeGuestProfile.contact || 'No mobile'} · {activeGuestProfile.visitCount} {activeGuestProfile.visitCount === 1 ? 'visit' : 'visits'} · {activeGuestProfile.upcomingCount} active</p>
                  <form onSubmit={saveGuestProfile}>
                    <label>Name<input value={profileNameDraft} onChange={event => setProfileNameDraft(event.target.value)} aria-label="Guest profile name" /></label>
                    <label>Mobile<input value={profileContactDraft} onChange={event => setProfileContactDraft(event.target.value)} aria-label="Guest profile mobile" /></label>
                    <label>Tags<input value={profileTagsDraft} onChange={event => setProfileTagsDraft(event.target.value)} aria-label="Guest profile tags" /></label>
                    <label>Preferences<input value={profilePreferencesDraft} onChange={event => setProfilePreferencesDraft(event.target.value)} aria-label="Guest profile preferences" /></label>
                    <label>Private note<textarea value={profileNoteDraft} onChange={event => setProfileNoteDraft(event.target.value)} maxLength={400} aria-label="Guest profile private note" /></label>
                    <button type="submit" disabled={profileBusy}>{profileBusy ? 'Saving...' : 'Save profile'}</button>
                  </form>
                  <div className="guest-visit-history" aria-label="Guest visit history">
                    <strong>Recent visits</strong>
                    {activeGuestProfile.visits.length === 0 ? <p>No visits attached yet.</p> : activeGuestProfile.visits.map(visit => (
                      <p key={visit.reference}>{visit.reference} · {formatLocalTime(visit.startsAt)} · {visit.partySize} guests · {visit.tableCode || 'pending'} · {statusLabel(visit.status)}</p>
                    ))}
                  </div>
                </section>
              )}
              <section aria-labelledby="table-combinations-title" className="table-combo-list" aria-label="Table combinations">
                <h2 id="table-combinations-title">Table combinations</h2>
                {tableCombinations.length === 0 ? <p>No table combinations configured.</p> : tableCombinations.map(combo => {
                  const state = combinationStatus(combo);
                  const fits = canSeatAtCombination(combo);
                  const disabled = busy || waitBusy || !activeSeatCandidate || !fits || !state.open;
                  const reason = state.blocked ? `Blocked by table ${state.blocked.tableCode}` : state.occupied ? `Occupied by ${state.occupied.reference}` : !activeSeatCandidate ? 'Select a party first' : !fits ? `Fits ${combo.minParty}-${combo.maxParty}` : 'Ready';
                  return (
                    <article key={combo.id} className={`combo-card ${state.open ? 'open' : 'unavailable'} ${fits ? 'fits' : ''}`}>
                      <div>
                        <strong>{combo.code}</strong>
                        <span>{combo.section} · {combo.minParty}-{combo.maxParty} guests</span>
                        <p>{combo.tableCodes.join(' + ')}</p>
                      </div>
                      <button type="button" disabled={disabled} onClick={() => seatSelectedAtCombination(combo)} aria-label={`Seat selected party at combined tables ${combo.code}`}>{reason === 'Ready' ? 'Seat combo' : reason}</button>
                    </article>
                  );
                })}
              </section>
              <section aria-labelledby="table-blocks-title" className="table-block-list">
                <h2 id="table-blocks-title">Table blocks</h2>
                {tableBlocks.length === 0 ? <p>No active table blocks.</p> : tableBlocks.map(block => (
                  <article key={block.id}>
                    <strong>Table {block.tableCode}</strong>
                    <p>{formatLocalTime(block.startsAt)} to {formatLocalTime(block.endsAt)} · {block.reason}</p>
                    <button type="button" disabled={busy || blockBusy} onClick={() => clearTableBlock(block)} aria-label={`Clear block on table ${block.tableCode}`}>Clear block</button>
                  </article>
                ))}
              </section>
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


function profileListFromText(value: string) {
  return Array.from(new Set(value.split(',').map(item => item.trim()).filter(Boolean))).slice(0, 8);
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
