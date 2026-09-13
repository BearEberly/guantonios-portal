// Web Crypto implementation of Twilio's form webhook signature algorithm.
// Includes every received field; tests include Twilio's published signature vector.
const encoder = new TextEncoder();

export class SmsError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}

export async function readBoundedBody(request, limit = 8192) {
  if (Number(request.headers.get('content-length')) > limit) throw new SmsError('body_too_large', 413);
  const reader = request.body?.getReader();
  if (!reader) return '';
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new SmsError('body_too_large', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
}

export async function senderKey(env, from, to) {
  if (!env.DEMO_API_SECRET) throw new SmsError('database_not_configured');
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.DEMO_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const value = await crypto.subtle.sign('HMAC', key, encoder.encode(`reservation-demo-sms-v1|${from}|${to}`));
  return [...new Uint8Array(value)].map(n => n.toString(16).padStart(2, '0')).join('');
}

export async function secretEqual(a, b) {
  const [left, right] = await Promise.all([digest(a || ''), digest(b || '')]);
  let different = 0;
  for (let i = 0; i < left.length; i++) different |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return different === 0 && Boolean(a && b);
}

export async function twilioSignature(token, url, params) {
  let content = url;
  for (const key of [...new Set(params.keys())].sort()) {
    for (const value of [...new Set(params.getAll(key))].sort()) content += key + value;
  }
  const key = await crypto.subtle.importKey('raw', encoder.encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(content)));
  return btoa(String.fromCharCode(...signature));
}

export function publicOrigin(env) {
  const value = env.SMS_PUBLIC_ORIGIN || 'https://res.beareberly.com';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new SmsError('invalid_sms_origin');
  return url.origin;
}

export async function verifiedForm(request, env, path) {
  if (request.method !== 'POST') throw new SmsError('method_not_allowed', 405);
  if (!env.TWILIO_AUTH_TOKEN || !env.TWILIO_ACCOUNT_SID) throw new SmsError('webhook_not_configured');
  const url = new URL(request.url);
  if (url.origin !== publicOrigin(env) || url.pathname !== path) throw new SmsError('invalid_webhook_url', 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) throw new SmsError('unsupported_media_type', 415);
  const params = new URLSearchParams(await readBoundedBody(request));
  // Duplicate security/action fields create parser ambiguity. Include all fields in
  // the signature above, but reject repeats before using any parsed field.
  for (const field of ['AccountSid', 'MessageSid', 'From', 'To', 'Body', 'OptOutType', 'MessageStatus', 'ErrorCode']) {
    if (params.getAll(field).length > 1) throw new SmsError('duplicate_field', 400);
  }
  const expected = await twilioSignature(env.TWILIO_AUTH_TOKEN, url.href, params);
  if (!await secretEqual(expected, request.headers.get('x-twilio-signature'))) throw new SmsError('invalid_signature', 403);
  if (params.get('AccountSid') !== env.TWILIO_ACCOUNT_SID) throw new SmsError('wrong_account', 403);
  return params;
}

export function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
}

export function twiml(reply = '', callback = '', status = 200) {
  const attributes = callback ? ` action="${xmlEscape(callback)}" statusCallback="${xmlEscape(callback)}" method="POST"` : '';
  const message = reply ? `<Message${attributes}><Body>${xmlEscape(reply.slice(0, 1000))}</Body></Message>` : '';
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${message}</Response>`, {
    status, headers: { 'content-type': 'text/xml; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow' }
  });
}

export function allowedPhone(phone, env) {
  return /^\+1\d{10}$/.test(phone || '') && (env.SMS_TEST_ALLOWLIST || '').split(',').map(x => x.trim()).filter(Boolean).includes(phone);
}

export function readiness(env) {
  const database = Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.DEMO_API_SECRET);
  const ai = Boolean(env.OPENAI_API_KEY && env.SMS_AI_MODEL);
  const webhook = Boolean(env.TWILIO_AUTH_TOKEN && env.TWILIO_ACCOUNT_SID && /^\+1\d{10}$/.test(env.TWILIO_PHONE_NUMBER || ''));
  const allowlist = (env.SMS_TEST_ALLOWLIST || '').split(',').some(phone => /^\+1\d{10}$/.test(phone.trim()));
  const carrierApproved = env.SMS_CARRIER_APPROVED === 'true';
  const enabled = env.DEMO_MODE === 'true' && env.SMS_MODE === 'test' && database && ai && webhook && allowlist && carrierApproved;
  return { enabled, mode: env.SMS_MODE === 'test' ? 'test' : 'disabled', demo: true, database, ai, webhook, allowlist, carrierApproved };
}

export async function rpc(env, payload, timeoutMs = 2000) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.DEMO_API_SECRET) throw new SmsError('database_not_configured');
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/reservation_demo_sms_api`, {
    method: 'POST', headers: { 'content-type': 'application/json', apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ payload, secret: env.DEMO_API_SECRET }), signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new SmsError('database_unavailable');
  const data = JSON.parse(await readBoundedBody(response, 32768));
  if (!data || typeof data !== 'object') throw new SmsError('invalid_database_response');
  return data;
}
