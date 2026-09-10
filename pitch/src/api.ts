import type { AvailabilitySlot, BookingResult, HoldResult, OperatorState, ReservationSummary, SeatingSection } from './types';

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

export function operatorList(token: string) {
  return request<OperatorState>('/api/demo/operator/list', {}, token);
}

export function operatorStatus(token: string, reference: string, status: string) {
  return request<{ ok: boolean; reference: string; status: string; error?: string }>('/api/demo/operator/status', { reference, status }, token);
}

export function operatorReset(token: string) {
  return request<{ ok: boolean; reset: boolean; error?: string }>('/api/demo/operator/reset', {}, token);
}
