import { afterEach, describe, expect, it, vi } from 'vitest';
import { twilioSignature, senderKey, readBoundedBody, readiness, twiml } from '../functions/api/demo/sms/_transport.js';
import { interpretMessage, localDate, validIntent } from '../functions/api/demo/sms/_ai.js';
import { HELP, planReply } from '../functions/api/demo/sms/_workflow.js';
import { onRequestPost } from '../functions/api/demo/sms/inbound.js';
import { onRequestPost as statusCallback } from '../functions/api/demo/sms/status.js';
import { onRequestPost as rehearse, onRequestGet as smsReadiness } from '../functions/api/demo/sms/rehearse.js';

const env = {
  DEMO_MODE: 'true', DEMO_API_SECRET: 'test-demo-secret', DEMO_OPERATOR_TOKEN: 'test-operator-secret',
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-publishable',
  TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'test-twilio-token', TWILIO_PHONE_NUMBER: '+12097094194',
  SMS_PUBLIC_ORIGIN: 'https://res.beareberly.com', SMS_MODE: 'test', SMS_CARRIER_APPROVED: 'true', SMS_TEST_ALLOWLIST: '+12095550101,+12095550102',
  OPENAI_API_KEY: 'test-ai-key', SMS_AI_MODEL: 'test-model', SMS_AI_REHEARSAL_ENABLED: 'true'
};
const sid = `SM${'1'.repeat(32)}`;
const future = '2026-09-15';
const now = new Date('2026-09-13T19:00:00Z');
const criteria = { date: future, time: '19:00', partySize: 2, section: 'indoor' };
const intent = { intent: 'book', ...criteria, ambiguous: false };
const booking = { reference: 'DEMO-TEST1234', manageToken: 'private-management-token', startsAt: '2026-09-16T02:00:00Z', partySize: 2, section: 'indoor', status: 'confirmed' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

async function signed(body = 'hi', extra: Record<string, string> = {}, path = '/api/demo/sms/inbound', config = env) {
  const params = new URLSearchParams({ AccountSid: env.TWILIO_ACCOUNT_SID, MessageSid: sid, From: '+12095550101', To: env.TWILIO_PHONE_NUMBER, Body: body, NumMedia: '0', ...extra });
  const url = `${env.SMS_PUBLIC_ORIGIN}${path}`;
  const signature = await twilioSignature(config.TWILIO_AUTH_TOKEN, url, params);
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature }, body: params });
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Twilio transport boundaries', () => {
  it('matches the official Twilio HMAC-SHA1 example', async () => {
    const params = new URLSearchParams({ CallSid: 'CA1234567890ABCDE', Caller: '+14158675310', Digits: '1234', From: '+14158675310', To: '+18005551212' });
    expect(await twilioSignature('12345', 'https://example.com/myapp.php?foo=1&bar=2', params)).toBe('L/OH5YylLD5NRKLltdqwSvS0BnU=');
  });

  it('rejects a changed body before the database or model is called', async () => {
    const request = await signed('hello');
    const bad = new Request(request.url, { method: 'POST', headers: request.headers, body: (await request.text()).replace('hello', 'YES') });
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    expect((await onRequestPost({ request: bad, env })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects another account and number even with a valid signature', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await onRequestPost({ request: await signed('hi', { AccountSid: `AC${'b'.repeat(32)}` }), env })).status).toBe(403);
    expect((await onRequestPost({ request: await signed('hi', { To: '+18889789730' }), env })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not reply, store or call AI for unknown numbers or disabled carrier gate', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const unknown = await onRequestPost({ request: await signed('hello', { From: '+12095550999' }), env });
    expect(await unknown.text()).not.toContain('<Message');
    const disabled = await onRequestPost({ request: await signed('hello'), env: { ...env, SMS_CARRIER_APPROVED: 'false' } });
    expect(await disabled.text()).not.toContain('<Message');
    expect(fetch).not.toHaveBeenCalled();
    expect(readiness({ ...env, DEMO_MODE: 'false' }).enabled).toBe(false);
    expect(readiness({ ...env, SMS_TEST_ALLOWLIST: '' }).enabled).toBe(false);
  });

  it('separates phone identities and does not include raw numbers in keys', async () => {
    const first = await senderKey(env, '+12095550101', env.TWILIO_PHONE_NUMBER);
    const second = await senderKey(env, '+12095550102', env.TWILIO_PHONE_NUMBER);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain('2095550101');
  });

  it('bounds body streams even without Content-Length and escapes TwiML', async () => {
    await expect(readBoundedBody(new Request('https://test.invalid', { method: 'POST', body: 'x'.repeat(9000) }))).rejects.toThrow('body_too_large');
    expect(await twiml('<script>&"').text()).toContain('&lt;script&gt;&amp;&quot;');
  });
});

describe('structured AI interpretation', () => {
  it('uses Responses structured extraction, no retained transcript and no private state', async () => {
    const fetchMock = vi.fn(async () => json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(intent) }] }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await interpretMessage('two people Tuesday at 7 PM indoors', { criteria: {}, booking }, env, now)).toEqual(intent);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init.body));
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.instructions).toContain('2026-09-13');
    expect(String(init.body)).not.toContain('private-management-token');
    expect(String(init.body)).not.toContain(booking.reference);
    expect(body.tools).toBeUndefined();
    expect(body.max_output_tokens).toBe(300);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects malicious extra fields, invalid dates, arbitrary intent and unsafe values', () => {
    expect(validIntent({ ...intent, sql: 'delete from public.bookings' })).toBe(false);
    expect(validIntent({ ...intent, intent: 'confirm' })).toBe(false);
    expect(validIntent({ ...intent, date: '2026-02-30' })).toBe(false);
    expect(validIntent({ ...intent, partySize: 999 })).toBe(false);
    expect(validIntent({ ...intent, time: '25:00' })).toBe(false);
  });

  it('rejects refusals, incomplete output and network failure without booking', async () => {
    for (const response of [
      { status: 'incomplete', output: [] },
      { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] },
      { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ ...intent, url: 'https://attacker.invalid' }) }] }] }
    ]) {
      vi.stubGlobal('fetch', vi.fn(async () => json(response)));
      await expect(interpretMessage('request', {}, env, now)).rejects.toThrow();
    }
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timeout', 'TimeoutError'); }));
    await expect(interpretMessage('request', {}, env, now)).rejects.toThrow('timeout');
    expect(localDate(new Date('2026-09-14T01:00:00Z'))).toBe('2026-09-13');
  });
});

describe('reservation conversation', () => {
  it('asks missing or ambiguous questions without checking or creating inventory', async () => {
    const action = vi.fn();
    const partial = await planReply({ body: 'two people', state: {}, env, now, action, interpret: async () => ({ ...intent, date: null, time: null, section: null }) });
    expect(partial.replyText).toContain('time with AM/PM');
    const ambiguous = await planReply({ body: 'at seven', state: {}, env, now, action, interpret: async () => ({ ...intent, ambiguous: true }) });
    expect(ambiguous.replyText).toContain('clarify');
    expect(action).not.toHaveBeenCalled();
  });

  it('checks real demo availability, holds exact slot and requires later YES', async () => {
    const action = vi.fn(async (op: string) => op === 'search' ? { ok: true, slots: [{ ...criteria, exact: true, seating: [{ section: 'indoor' }] }] } : { ok: true, expiresAt: '2026-09-13T19:05:00Z' });
    const result = await planReply({ body: 'two Tuesday 7 PM indoors', state: {}, env, now, action, interpret: async () => intent });
    expect(action.mock.calls.map(call => call[0])).toEqual(['search', 'hold']);
    expect(result.replyText).toContain('Reply YES');
    expect(result.replyText).toContain('No real table');
    expect(result.criteria).toEqual(criteria);
    expect(result.offerKind).toBe('hold');
  });

  it('offers only DB returned alternatives and never holds an unavailable requested time', async () => {
    const action = vi.fn(async () => ({ ok: true, slots: [{ ...criteria, time: '19:30', exact: false, seating: [{ section: 'outdoor' }] }] }));
    const result = await planReply({ body: 'request', state: {}, env, now, action, interpret: async () => intent });
    expect(result.replyText).toContain('7:30 PM outdoor');
    expect(result.replyText).toContain('Nothing is booked');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('confirms only an offered hold and formats details only from DB', async () => {
    const action = vi.fn(async () => ({ ok: true, ...booking }));
    const interpret = vi.fn();
    const missing = await planReply({ body: 'YES', state: {}, env, now, action, interpret });
    expect(missing.replyText).toContain('no current offered hold');
    expect(action).not.toHaveBeenCalled();
    const confirmed = await planReply({ body: 'YES', state: { proposal: { offeredAt: '2026-09-13T19:00:00Z' } }, env, now, action, interpret });
    expect(confirmed.replyText).toContain('CONFIRMED DEMO-TEST1234');
    expect(confirmed.replyText).not.toContain('private-management-token');
    expect(action).toHaveBeenCalledWith('confirm', {});
    expect(interpret).not.toHaveBeenCalled();
  });

  it('does not confirm when the DB rejects an expired hold', async () => {
    const result = await planReply({ body: 'YES', state: { proposal: { offeredAt: 'old' } }, env, now, action: async () => ({ ok: false, error: 'hold_expired' }) });
    expect(result.replyText).toContain('could not be confirmed');
    expect(result.replyText).not.toContain('CONFIRMED');
  });

  it('requests a DB owned cancellation proposal before explicit confirmation', async () => {
    const action = vi.fn(async () => ({ ok: true, reservation: booking }));
    const result = await planReply({ body: 'cancel reservation', state: { booking }, env, now, action, interpret: async () => ({ ...intent, intent: 'cancel' }) });
    expect(action).toHaveBeenCalledWith('request_cancel', {});
    expect(result.replyText).toContain('CONFIRM CANCEL');
    expect(result.offerKind).toBe('cancel');
    expect(action).not.toHaveBeenCalledWith('cancel', expect.anything());
  });

  it('treats STATUS as a deterministic owned booking lookup without AI', async () => {
    const action = vi.fn(async () => ({ ok: true, reservation: booking }));
    const interpret = vi.fn();
    const result = await planReply({ body: ' status ', state: { booking }, env, now, action, interpret });
    expect(action).toHaveBeenCalledWith('view', {});
    expect(result.replyText).toContain('Status: confirmed');
    expect(interpret).not.toHaveBeenCalled();
  });

  it('searches either seating without passing a nonexistent any section to DB', async () => {
    const action = vi.fn(async (op: string) => op === 'search' ? { ok: true, slots: [{ ...criteria, exact: true, seating: [{ section: 'outdoor' }] }] } : { ok: true, expiresAt: '2026-09-13T19:05:00Z' });
    const result = await planReply({ body: 'either seating', state: {}, env, now, action, interpret: async () => ({ ...intent, section: 'any' }) });
    expect(action).toHaveBeenCalledWith('search', { ...criteria, section: null });
    expect(action).toHaveBeenCalledWith('hold', { ...criteria, section: 'outdoor' });
    expect(result.replyText).toContain('outdoor');
  });
});

describe('inbound RPC integration contract', () => {
  it('connects signed inbound, AI extraction, search and hold to a persisted offer before replying', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url === 'https://api.openai.com/v1/responses') return json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(intent) }] }] });
      const payload = JSON.parse(String(init.body)).payload; calls.push(payload);
      if (payload.op === 'claim') return json({ ok: true, status: 'claimed', leaseToken: 'lease-a', state: {} });
      if (payload.action === 'search') return json({ ok: true, slots: [{ ...criteria, exact: true, seating: [{ section: 'indoor' }] }] });
      if (payload.action === 'hold') return json({ ok: true, expiresAt: '2026-09-13T19:05:00Z' });
      return json({ ok: true, replyText: payload.replyText });
    }));
    const response = await onRequestPost({ request: await signed('two Tuesday 7 PM indoors'), env });
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml).toContain('Reply YES');
    expect(xml).toContain(`status?inboundMessageSid=${sid}`);
    expect(calls.map(call => call.action || call.op)).toEqual(['claim', 'search', 'hold', 'finish']);
    expect(calls[3]).toMatchObject({ offerKind: 'hold', criteria, leaseToken: 'lease-a' });
    expect(calls.every(call => call.senderKey === calls[0].senderKey)).toBe(true);
  });

  it('finishes a safe HELP reply without the AI and never passes raw phone fields to DB', async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain('/rpc/reservation_demo_sms_api');
      const payload = JSON.parse(String(init.body)).payload; calls.push(payload);
      return json(payload.op === 'claim' ? { ok: true, status: 'claimed', leaseToken: 'lease-a', state: {} } : { ok: true, replyText: payload.replyText });
    }));
    const response = await onRequestPost({ request: await signed('HELP'), env });
    expect(await response.text()).toContain('synthetic bookings only');
    expect(calls.map(item => item.op)).toEqual(['claim', 'finish']);
    expect(calls[0].optOutType).toBe('HELP');
    expect(JSON.stringify(calls)).not.toContain('+12095550101');
    expect(calls[1].replyText).toBe(HELP);
    expect(calls[1].leaseToken).toBe('lease-a');
  });

  it('does not repeat booking or send TwiML messages for completed MessageSid retries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true, status: 'done', replyText: 'Already confirmed' })));
    const result = await onRequestPost({ request: await signed('YES'), env });
    expect(await result.text()).not.toContain('<Message');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('suppresses opted-out senders and returns retryable status for concurrent claims', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true, status: 'blocked' })));
    expect(await (await onRequestPost({ request: await signed('book'), env })).text()).not.toContain('<Message');
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true, status: 'busy' })));
    expect((await onRequestPost({ request: await signed('book'), env })).status).toBe(503);
  });

  it('acknowledges a rate limit without paid replies, AI or retry loops', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true, status: 'rate_limited' })));
    const result = await onRequestPost({ request: await signed('book'), env });
    expect(result.status).toBe(200);
    expect(await result.text()).not.toContain('<Message');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('records STOP while carrier gate is disabled and suppresses Twilio automatic opt-out duplication', async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)).payload; calls.push(payload);
      return json(payload.op === 'claim' ? { ok: true, status: 'claimed', leaseToken: 'lease-a', state: {} } : { ok: true, replyText: payload.replyText });
    }));
    const response = await onRequestPost({ request: await signed('STOP', { OptOutType: 'STOP' }), env: { ...env, SMS_CARRIER_APPROVED: 'false' } });
    expect(calls[0].optOutType).toBe('STOP');
    expect(calls.map(item => item.op)).toEqual(['claim', 'finish']);
    expect(await response.text()).not.toContain('<Message');
  });

  it('stores a safe failure reply after model failure without running a booking action', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('api.openai.com')) throw new Error('upstream timeout');
      const payload = JSON.parse(String(init.body)).payload; calls.push(payload.op);
      return json(payload.op === 'claim' ? { ok: true, status: 'claimed', leaseToken: 'lease-a', state: {} } : { ok: true, replyText: payload.replyText });
    }));
    const response = await onRequestPost({ request: await signed('two people on Tuesday'), env });
    expect(await response.text()).toContain('could not finish');
    expect(calls).toEqual(['claim', 'finish']);
  });

  it('does not emit a message when finish fails or a lease is stale', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)).payload;
      return json(payload.op === 'claim' ? { ok: true, status: 'claimed', leaseToken: 'lease-a', state: {} } : { ok: false, error: 'stale_lease' });
    }));
    const result = await onRequestPost({ request: await signed('HELP'), env });
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('<Message');
  });

  it('honors a database-suppressed reply after a successful finish', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)).payload;
      return json(payload.op === 'claim' ? { ok: true, status: 'claimed', leaseToken: 'lease-a', state: {} } : { ok: true, replyText: '' });
    }));
    const result = await onRequestPost({ request: await signed('HELP'), env });
    expect(result.status).toBe(200);
    expect(await result.text()).not.toContain('<Message');
  });

  it('fails closed for a malformed reply returned by finish', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)).payload;
      return json(payload.op === 'claim' ? { ok: true, status: 'claimed', leaseToken: 'lease-a', state: {} } : { ok: true, replyText: { unsafe: 'reply' } });
    }));
    const result = await onRequestPost({ request: await signed('HELP'), env });
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('<Message');
  });
});

describe('delivery and rehearsal endpoints', () => {
  it('authenticates status callback including correlation query and never sends', async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => { calls.push(JSON.parse(String(init.body)).payload); return json({ ok: true }); }));
    const response = await statusCallback({ request: await signed('', { From: env.TWILIO_PHONE_NUMBER, To: '+12095550101', MessageSid: `SM${'2'.repeat(32)}`, MessageStatus: 'delivered' }, `/api/demo/sms/status?inboundMessageSid=${sid}`), env });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('<Message');
    expect(calls[0]).toMatchObject({ op: 'delivery', inboundMessageSid: sid, deliveryStatus: 'delivered' });
  });

  it('requires operator token and explicit rehearsal flag, makes no DB or SMS calls', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const unauthorized = await smsReadiness({ request: new Request('https://res.beareberly.com/api/demo/sms/rehearse'), env });
    expect(unauthorized.status).toBe(401);
    const request = new Request('https://res.beareberly.com/api/demo/sms/rehearse', { method: 'POST', headers: { 'x-demo-operator-token': env.DEMO_OPERATOR_TOKEN }, body: JSON.stringify({ body: 'STOP' }) });
    const response = await rehearse({ request, env });
    expect(await response.json()).toMatchObject({ ok: true, command: 'STOP', smsSent: false, bookingCreated: false, aiUsed: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
