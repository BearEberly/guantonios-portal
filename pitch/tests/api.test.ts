import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { searchAvailability, createHold, confirmReservation } from '../src/api';

describe('client API wrapper', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.partySize === 99) {
        return new Response(JSON.stringify({ ok: false, error: 'invalid_search' }), { status: 400 });
      }
      return new Response(JSON.stringify({ ok: true, available: true, slots: [], echo: body }), { status: 200 });
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('posts search criteria without exposing server secrets', async () => {
    await searchAvailability({ date: '2026-09-11', time: '19:30', partySize: 2, section: 'indoor' });
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toBe('/api/demo/search');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('partySize');
    expect(String(init.body)).not.toContain('DEMO_API_SECRET');
    expect(String(init.body)).not.toContain('service_role');
  });

  it('throws clear backend errors', async () => {
    await expect(searchAvailability({ date: '2026-09-11', time: '19:30', partySize: 99 })).rejects.toThrow('invalid_search');
  });

  it('sends hold and confirmation idempotency keys supplied by the app', async () => {
    await createHold({ date: '2026-09-11', time: '19:30', partySize: 2, section: 'indoor', idempotencyKey: 'hold_123456789012' });
    await confirmReservation({ holdId: 'hold-id', holdToken: 'token', idempotencyKey: 'confirm_123456789012', firstName: 'Demo', lastName: 'Guest', email: 'demo@example.invalid', mobile: '(209) 555-0199' });
    const bodies = vi.mocked(fetch).mock.calls.map(call => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies[0].idempotencyKey).toBe('hold_123456789012');
    expect(bodies[1].idempotencyKey).toBe('confirm_123456789012');
  });
});
