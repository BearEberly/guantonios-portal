import { interpretMessage, localDate } from './_ai.js';

export const BRAND = 'Bear Eberly Photos reservation demo';
export const HELP = `${BRAND}: synthetic bookings only, no real restaurant table. Text a date, time with AM/PM, party size and indoor/outdoor. VIEW shows your demo booking. STOP opts out; START resumes. Help: https://res.beareberly.com/sms`;
export const FAILURE = `${BRAND}: I could not finish that request safely. Reply VIEW to check any existing demo booking, or send your request again. No real restaurant reservation is made.`;

export function commandFor(body, optOutType) {
  if (['STOP', 'START', 'HELP'].includes(optOutType)) return optOutType;
  const text = body.trim().toUpperCase();
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'].includes(text)) return 'STOP';
  if (['START', 'UNSTOP'].includes(text)) return 'START';
  if (['HELP', 'INFO'].includes(text)) return 'HELP';
  return '';
}

function displayTime(time) {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function bookingSummary(booking) {
  if (!booking?.reference || !booking?.startsAt || !Number.isInteger(booking.partySize) || !['indoor', 'outdoor'].includes(booking.section)) return null;
  const date = new Date(booking.startsAt);
  if (!Number.isFinite(date.getTime())) return null;
  const when = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  return `${booking.reference}: ${booking.partySize} guests, ${when} Pacific, ${booking.section}`;
}

export async function planReply({ body, command, state, action, env, now = new Date(), interpret = interpretMessage }) {
  let criteria = { ...(state.criteria || {}) };
  const text = body.trim().toUpperCase();
  if (command === 'STOP') return { replyText: `${BRAND}: you are opted out. No more automated replies. Text START to resume.` };
  if (command === 'START') return { replyText: `${BRAND}: welcome. Replies resumed for your requests. Synthetic bookings only. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. https://res.beareberly.com/sms` };
  if (command === 'HELP') return { replyText: HELP };

  // The model cannot confirm a reservation or choose which booking to cancel.
  if (text === 'YES') {
    if (!state.proposal || !state.proposal.offeredAt) return { replyText: `${BRAND}: there is no current offered hold. Send a date, time with AM/PM, party size and seating to start.` };
    const result = await action('confirm', {});
    const summary = result.ok ? bookingSummary(result.reservation || result) : null;
    return { replyText: summary ? `${BRAND}: CONFIRMED ${summary}. This is a demo only, no real table reserved. Reply VIEW to check it or "cancel reservation" to cancel. STOP opts out.` : `${BRAND}: that hold could not be confirmed or has expired. Send your date, time and party size again to check fresh demo availability.` };
  }
  if (text === 'CONFIRM CANCEL') {
    const result = await action('cancel', {});
    return { replyText: result.ok ? `${BRAND}: your demo booking is cancelled. No real restaurant booking was changed. STOP opts out.` : `${BRAND}: I could not cancel a demo booking for this conversation. Reply VIEW to check its current status.` };
  }

  let intent;
  if (text === 'VIEW' || text === 'STATUS') intent = { intent: 'view' };
  else if (text === 'RESET' || text === 'NEW') intent = { intent: 'reset' };
  else intent = await interpret(body, state, env, now);

  if (intent.intent === 'view' || intent.intent === 'cancel') {
    const result = await action(intent.intent === 'cancel' ? 'request_cancel' : 'view', {});
    const booking = result.reservation || result;
    const summary = result.ok ? bookingSummary(booking) : null;
    if (!summary) return { ...(intent.intent === 'cancel' ? { criteria: {} } : {}), replyText: `${BRAND}: no saved demo booking was found for this text conversation. Send your date, time with AM/PM, party size and seating to start.` };
    if (intent.intent === 'cancel' && booking.status !== 'cancelled') return { offerKind: 'cancel', replyText: `${BRAND}: ${summary}. Reply CONFIRM CANCEL to cancel this demo booking. Reply VIEW to keep it and check its status.` };
    return { replyText: `${BRAND}: ${summary}. Status: ${booking.status}. Demo only, no real table reserved. STOP opts out.` };
  }
  if (intent.intent === 'reset') return { criteria: {}, replyText: `${BRAND}: let's start a new request. Existing confirmed bookings stay saved. What date, time with AM/PM, party size and indoor/outdoor seating would you like?` };
  if (intent.intent === 'unknown' || intent.ambiguous) return { ...(state.proposal ? { criteria: {} } : {}), replyText: `${BRAND}: please clarify the date, time with AM/PM, number of guests and indoor/outdoor seating. I can make a new demo booking, VIEW your latest booking or cancel it. No real restaurant bookings.` };

  for (const field of ['date', 'time', 'partySize', 'section']) if (intent[field] !== null && intent[field] !== undefined) criteria[field] = intent[field];
  const missing = [];
  if (!criteria.date) missing.push('date');
  if (!criteria.time) missing.push('time with AM/PM');
  if (!criteria.partySize) missing.push('number of guests (1 to 8)');
  if (!criteria.section) missing.push('indoor or outdoor seating (or either)');
  if (missing.length) return { criteria, replyText: `${BRAND}: what ${missing.join(', ')} would you like? Synthetic bookings only. STOP opts out.` };
  const today = localDate(now);
  const lastDay = new Date(`${today}T12:00:00Z`); lastDay.setUTCDate(lastDay.getUTCDate() + 30);
  if (criteria.date < today || criteria.date > lastDay.toISOString().slice(0, 10)) return { criteria, replyText: `${BRAND}: please choose a date from ${today} through ${lastDay.toISOString().slice(0, 10)}. Those are this demo's dates.` };
  const nowParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  if (criteria.date === today && criteria.time <= nowParts) return { criteria, replyText: `${BRAND}: that time has already passed in Lodi. Please choose a later time or another date.` };

  const result = await action('search', { ...criteria, section: criteria.section === 'any' ? null : criteria.section });
  if (!result.ok) return { criteria, replyText: FAILURE };
  const slots = Array.isArray(result.slots) ? result.slots : [];
  const exact = slots.find(slot => slot.date === criteria.date && slot.time === criteria.time && slot.partySize === criteria.partySize && slot.exact === true);
  if (!exact) {
    const alternatives = slots.slice(0, 3).map(slot => `${displayTime(slot.time)} ${(slot.seating || []).map(item => item.section).join('/')}`).join('; ');
    return { criteria, replyText: alternatives ? `${BRAND}: ${displayTime(criteria.time)} is unavailable for ${criteria.partySize} on ${criteria.date}. Demo alternatives: ${alternatives}. Reply with the time and seating you want. Nothing is booked yet.` : `${BRAND}: no demo availability for those details. Try another date, time or party size. Nothing is booked yet.` };
  }
  const sections = (exact.seating || []).map(item => item.section).filter(section => ['indoor', 'outdoor'].includes(section));
  const section = criteria.section === 'any' ? sections[0] : sections.includes(criteria.section) ? criteria.section : null;
  if (!section) return { criteria, replyText: `${BRAND}: that seating is unavailable. Please choose another time or seating area.` };
  criteria = { ...criteria, section };
  const hold = await action('hold', criteria);
  if (!hold.ok && hold.state?.booking && hold.state.booking.status !== 'cancelled') return { criteria, replyText: `${BRAND}: this conversation already has a demo booking. Reply VIEW to check it or "cancel reservation" before starting another.` };
  if (!hold.ok) return { criteria, replyText: `${BRAND}: that demo table was just taken or could not be held. Send your request again for fresh availability. Nothing was confirmed.` };
  const expiry = hold.expiresAt || hold.proposal?.expiresAt || hold.state?.proposal?.expiresAt;
  const until = expiry && Number.isFinite(Date.parse(expiry)) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }).format(new Date(expiry)) : 'the hold expires';
  return { criteria, offerKind: 'hold', replyText: `${BRAND}: held ${criteria.partySize} guests, ${criteria.date} at ${displayTime(criteria.time)} Pacific, ${section}. Reply YES before ${until} to confirm this synthetic booking. No real table is reserved. STOP opts out.` };
}
