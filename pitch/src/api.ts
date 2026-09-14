import type { AvailabilitySlot, BookingResult, GuestProfile, HoldResult, OperatorState, ReservationSummary, SeatingSection, TableBlock, WaitlistEntry } from './types';

const jsonHeaders = { 'Content-Type': 'application/json' };

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `Request failed with ${response.status}`);
  }
}

async function request<T>(path: string, body?: unknown, operatorToken?: string): Promise<T> {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...jsonHeaders,
      ...(operatorToken ? { 'x-demo-operator-token': operatorToken } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  const data = await parseJson<T>(response);
  if (!response.ok) {
    const anyData = data as { error?: string };
    throw new Error(anyData.error || `Request failed with ${response.status}`);
  }
  return data;
}

export function searchAvailability(criteria: { date: string; time: string; partySize: number; section?: string }) {
  return request<{ ok: boolean; available: boolean; reason?: string | null; slots: AvailabilitySlot[]; error?: string }>('/api/demo/search', criteria);
}

export function createHold(input: { date: string; time: string; partySize: number; section: SeatingSection; idempotencyKey: string }) {
  return request<HoldResult>('/api/demo/hold', input);
}

export function confirmReservation(input: { holdId: string; holdToken: string; idempotencyKey: string; firstName: string; lastName: string; email: string; mobile: string; request?: string }) {
  return request<BookingResult>('/api/demo/confirm', input);
}

export function viewReservation(input: { reference: string; manageToken: string }) {
  return request<{ ok: boolean; reservation?: ReservationSummary; error?: string }>('/api/demo/view', input);
}

export function changeReservation(input: { reference: string; manageToken: string; date: string; time: string; partySize: number; section: SeatingSection }) {
  return request<BookingResult>('/api/demo/change', input);
}

export function cancelReservation(input: { reference: string; manageToken: string }) {
  return request<BookingResult>('/api/demo/cancel', input);
}

export async function operatorList(token: string) {
  const [state, waitlist, guests, floor] = await Promise.all([
    request<OperatorState>('/api/demo/operator/list', {}, token),
    request<{ ok: boolean; waitlist: WaitlistEntry[]; error?: string }>('/api/demo/operator/waitlist', { op: 'list' }, token),
    request<{ ok: boolean; profiles: GuestProfile[]; error?: string }>('/api/demo/operator/guest', { op: 'list' }, token),
    request<{ ok: boolean; tableBlocks: TableBlock[]; error?: string }>('/api/demo/operator/floor', { op: 'list' }, token)
  ]);
  const profilesByReference = new Map<string, GuestProfile>();
  for (const profile of guests.profiles || []) {
    for (const visit of profile.visits || []) profilesByReference.set(visit.reference, profile);
  }
  const bookings = (state.bookings || []).map(booking => {
    const profile = profilesByReference.get(booking.reference);
    return profile ? {
      ...booking,
      guestProfileId: profile.id,
      guestTags: profile.tags,
      guestPreferences: profile.preferences,
      visitCount: profile.visitCount,
      privateNotePreview: profile.privateNote ? 'Private note' : ''
    } : booking;
  });
  return { ...state, bookings, waitlist: waitlist.waitlist || [], profiles: guests.profiles || [], tableBlocks: floor.tableBlocks || [] };
}

export function operatorStatus(token: string, reference: string, status: string, tableCode?: string) {
  return request<{ ok: boolean; reference: string; status: string; tableCode?: string; error?: string }>('/api/demo/operator/status', { reference, status, ...(tableCode ? { tableCode } : {}) }, token);
}

export function operatorWaitlist(token: string, input: { op: 'create'; guestLabel: string; contact?: string; date: string; time: string; partySize: number; section?: SeatingSection | 'either'; quotedWaitMinutes?: number; note?: string } | { op: 'status'; waitlistId: string; status: 'waiting' | 'notified' | 'cancelled' } | { op: 'seat'; waitlistId: string; tableCode: string }) {
  return request<{ ok: boolean; waitlistId?: string; reference?: string; status?: string; tableCode?: string; entry?: WaitlistEntry; error?: string }>('/api/demo/operator/waitlist', input, token);
}

export function operatorFloor(token: string, input:
  | { op: 'list' }
  | { op: 'block'; tableCode: string; date: string; startTime?: string; endTime?: string; reason?: string }
  | { op: 'clear'; blockId: string }
) {
  return request<{ ok: boolean; tableBlock?: TableBlock; tableBlocks?: TableBlock[]; error?: string }>('/api/demo/operator/floor', input, token);
}

export function operatorGuest(token: string, input:
  | { op: 'list' }
  | { op: 'load'; reference?: string; profileId?: string }
  | { op: 'attach'; reference: string; guestLabel: string; contact?: string; tags?: string[]; preferences?: string[]; privateNote?: string; note?: string }
  | { op: 'update'; profileId: string; guestLabel?: string; contact?: string; tags: string[]; preferences: string[]; privateNote: string }
) {
  return request<{ ok: boolean; profile?: GuestProfile; profiles?: GuestProfile[]; error?: string }>('/api/demo/operator/guest', input, token);
}

export function operatorReset(token: string) {
  return request<{ ok: boolean; reset: boolean; error?: string }>('/api/demo/operator/reset', {}, token);
}
