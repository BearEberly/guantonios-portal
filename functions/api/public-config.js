export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(context.request) });
  }

  if (context.request.method !== "GET") {
    return json(context.request, { ok: false, error: "Method not allowed" }, 405);
  }

  return onRequestGet(context);
}

export async function onRequestGet(context) {
  const env = context.env || {};
  const requestUrl = new URL(context.request.url);
  const isLocalHost = isLocalDevHost(requestUrl.hostname);
  const allowTemporaryLogins = parseBoolean(env.ALLOW_TEMPORARY_LOGINS, isLocalHost);

  const payload = {
    ok: true,
    appsScriptUrl: String(env.APPS_SCRIPT_URL || "").trim(),
    supabaseUrl: String(env.SUPABASE_URL || "").trim(),
    supabaseAnonKey: String(env.SUPABASE_ANON_KEY || "").trim(),
    oauthRedirectTo: `${requestUrl.origin}/app/dashboard.html`,
    allowTemporaryLogins
  };

  return json(context.request, payload, 200);
}

function isLocalDevHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function parseBoolean(value, fallbackValue) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallbackValue;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function json(request, payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0, must-revalidate",
      ...corsHeaders(request)
    }
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type,authorization"
  };
}
