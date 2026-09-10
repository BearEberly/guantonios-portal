const SECURITY_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow'
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: SECURITY_HEADERS });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function requirePost(request) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  return null;
}

export function checkOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const own = new URL(request.url).origin;
  if (origin === own || origin === 'http://127.0.0.1:8788' || origin.startsWith('http://127.0.0.1:')) return null;
  return json({ ok: false, error: 'bad_origin' }, 403);
}

export function envReady(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.DEMO_API_SECRET);
}

async function callSupabaseRpc(env, rpcName, body) {
  if (!envReady(env)) return { ok: false, error: 'demo_environment_missing' };
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { ok: false, error: 'bad_supabase_response' };
  }
  if (!response.ok) return { ok: false, error: data.message || data.error || 'supabase_rpc_failed' };
  return data;
}

export async function callDemoRpc(env, payload) {
  return callSupabaseRpc(env, 'reservation_demo_api', { payload, secret: env.DEMO_API_SECRET });
}

export async function callResetRpc(env) {
  return callSupabaseRpc(env, 'reservation_demo_reset', { secret: env.DEMO_API_SECRET });
}

export function operatorAllowed(request, env) {
  const token = request.headers.get('x-demo-operator-token') || '';
  return Boolean(env.DEMO_OPERATOR_TOKEN && token && token === env.DEMO_OPERATOR_TOKEN);
}

export async function handleOperation(request, env, op, operator = false) {
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const originError = checkOrigin(request);
  if (originError) return originError;
  if (operator && !operatorAllowed(request, env)) return json({ ok: false, error: 'operator_unauthorized' }, 401);
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid_json' }, 400);
  const result = await callDemoRpc(env, { ...body, op, operator });
  return json(result, result.ok ? 200 : mapStatus(result.error));
}

function mapStatus(error) {
  if (error === 'unauthorized' || error === 'operator_unauthorized' || error === 'not_found_or_unauthorized') return 401;
  if (error === 'demo_environment_missing') return 503;
  if (error === 'slot_unavailable' || error === 'hold_expired_or_unauthorized') return 409;
  return 400;
}
