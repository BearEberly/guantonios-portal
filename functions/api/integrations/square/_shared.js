export function corsHeaders(request, methods) {
  const origin = request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": methods || "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    vary: "origin"
  };
}

export function json(request, payload, status, methods) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request, methods)
    }
  });
}

export function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      location
    }
  });
}

export async function parseJson(request) {
  try {
    return await request.json();
  } catch (_error) {
    return {};
  }
}

export async function tryJson(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

export function extractError(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  return payload.error || payload.message || payload.msg || payload.error_description || "";
}

export function readBearerToken(authorization) {
  const value = String(authorization || "").trim();
  if (!value.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return value.slice(7).trim();
}

export function readEnv(context, options) {
  const config = options || {};
  const supabaseUrl = String(context.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(context.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = String(context.env.SUPABASE_ANON_KEY || "").trim();
  const squareEnvironment = String(context.env.SQUARE_ENVIRONMENT || "production").trim().toLowerCase();
  const squareAccessToken = String(context.env.SQUARE_ACCESS_TOKEN || "").trim();
  const squareOauthClientId = String(context.env.SQUARE_OAUTH_CLIENT_ID || "").trim();
  const squareOauthClientSecret = String(context.env.SQUARE_OAUTH_CLIENT_SECRET || "").trim();
  const squareOauthRedirectUri = String(context.env.SQUARE_OAUTH_REDIRECT_URI || "").trim();
  const squareOauthScopes = String(context.env.SQUARE_OAUTH_SCOPES || "PAYMENTS_READ MERCHANT_PROFILE_READ").trim();
  const squareBusinessTimeZone = String(context.env.SQUARE_BUSINESS_TIMEZONE || "America/Los_Angeles").trim();
  const squareLocationId = String(context.env.SQUARE_LOCATION_ID || "").trim();
  const squareOauthStateTtl = normalizePositiveInteger(context.env.SQUARE_OAUTH_STATE_TTL, 900);
  const squareAdminRedirectPath = normalizePath(context.env.SQUARE_ADMIN_REDIRECT_PATH || "/app/admin.html");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const squareBaseUrl = squareEnvironment === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

  if (config.requireOAuthCredentials && (!squareOauthClientId || !squareOauthClientSecret)) {
    throw new Error("Missing SQUARE_OAUTH_CLIENT_ID or SQUARE_OAUTH_CLIENT_SECRET");
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    anonOrServiceKey: anonKey || serviceRoleKey,
    squareBaseUrl,
    squareEnvironment,
    squareAccessToken,
    squareOauthClientId,
    squareOauthClientSecret,
    squareOauthRedirectUri,
    squareOauthScopes,
    squareBusinessTimeZone,
    squareLocationId,
    squareOauthStateTtl,
    squareAdminRedirectPath
  };
}

function normalizePath(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "/app/admin.html";
  }
  if (text.startsWith("/")) {
    return text;
  }
  return `/${text}`;
}

function normalizePositiveInteger(input, fallback) {
  const parsed = Number(String(input || "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function resolveOauthRedirectUri(request, env) {
  if (env.squareOauthRedirectUri) {
    return env.squareOauthRedirectUri;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/integrations/square/callback`;
}

export function resolveAdminRedirectUri(request, env, params) {
  const baseUrl = new URL(request.url);
  const redirectUrl = new URL(`${baseUrl.protocol}//${baseUrl.host}${env.squareAdminRedirectPath}`);
  const entries = params && typeof params === "object" ? Object.entries(params) : [];
  entries.forEach(function appendPair(pair) {
    const key = pair[0];
    const value = pair[1];
    if (value === null || value === undefined || value === "") {
      return;
    }
    redirectUrl.searchParams.set(String(key), String(value));
  });
  return redirectUrl.toString();
}

export function normalizeIsoDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return "";
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return text;
}

export function normalizeString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export function roundCurrency(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100) / 100;
}

export async function requireAdminSession(request, env) {
  const accessToken = readBearerToken(request.headers.get("authorization"));
  if (!accessToken) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }

  const caller = await fetchCallerUser(env.supabaseUrl, env.anonOrServiceKey, accessToken);
  if (!caller.ok) {
    return { ok: false, status: 401, error: "Invalid or expired session" };
  }

  const callerRole = await fetchCallerRole(env.supabaseUrl, env.serviceRoleKey, caller.user.id);
  if (!callerRole.ok) {
    return { ok: false, status: 403, error: callerRole.error || "Could not validate caller role" };
  }

  if (callerRole.role !== "admin") {
    return { ok: false, status: 403, error: "Admin role required" };
  }

  return {
    ok: true,
    accessToken,
    user: caller.user,
    role: callerRole.role
  };
}

async function fetchCallerUser(supabaseUrl, anonOrServiceKey, accessToken) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonOrServiceKey,
      authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await tryJson(response);
  if (!response.ok || !payload || !payload.id) {
    return { ok: false };
  }

  return { ok: true, user: payload };
}

async function fetchCallerRole(supabaseUrl, serviceRoleKey, userId) {
  const endpoint = `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`
    }
  });

  const payload = await tryJson(response);
  if (!response.ok) {
    return { ok: false, error: extractError(payload) || "Could not validate caller role" };
  }

  const first = Array.isArray(payload) ? payload[0] : null;
  if (!first || !first.role) {
    return { ok: false, error: "Caller profile not found" };
  }

  return { ok: true, role: first.role };
}

async function supabaseRest(env, method, path, body, options) {
  const config = options || {};
  const endpoint = `${env.supabaseUrl}/rest/v1/${path}`;
  const headers = {
    apikey: env.serviceRoleKey,
    authorization: `Bearer ${env.serviceRoleKey}`
  };

  if (config.prefer) {
    headers.prefer = config.prefer;
  }

  let requestBody;
  if (body !== undefined && body !== null) {
    headers["content-type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(endpoint, {
    method,
    headers,
    body: requestBody
  });

  const payload = await tryJson(response);
  return {
    ok: response.ok,
    status: response.status,
    data: payload,
    error: extractError(payload)
  };
}

export async function createOauthStateRecord(env, input) {
  const state = randomToken(42);
  const expiresAt = new Date(Date.now() + (env.squareOauthStateTtl * 1000)).toISOString();
  const row = {
    state,
    provider: "square",
    admin_user_id: input.adminUserId,
    location_id: input.locationId || null,
    location_name: input.locationName || null,
    expires_at: expiresAt
  };

  const inserted = await supabaseRest(
    env,
    "POST",
    "integration_oauth_states",
    [row],
    { prefer: "return=representation" }
  );

  if (!inserted.ok) {
    return { ok: false, status: inserted.status, error: inserted.error || "Could not store OAuth state" };
  }

  const first = Array.isArray(inserted.data) ? inserted.data[0] : null;
  if (!first || !first.state) {
    return { ok: false, status: 500, error: "Invalid OAuth state response" };
  }

  return {
    ok: true,
    state: first.state,
    expiresAt: first.expires_at
  };
}

export async function getOauthStateRecord(env, state) {
  const response = await supabaseRest(
    env,
    "GET",
    `integration_oauth_states?state=eq.${encodeURIComponent(state)}&provider=eq.square&select=state,admin_user_id,location_id,location_name,expires_at&limit=1`
  );

  if (!response.ok) {
    return { ok: false, status: response.status, error: response.error || "Could not load OAuth state" };
  }

  const first = Array.isArray(response.data) ? response.data[0] : null;
  if (!first) {
    return { ok: false, status: 404, error: "OAuth state not found or expired" };
  }

  const expiresAt = String(first.expires_at || "");
  if (!expiresAt || Number.isNaN(new Date(expiresAt).getTime()) || new Date(expiresAt).getTime() < Date.now()) {
    return { ok: false, status: 410, error: "OAuth state expired" };
  }

  return {
    ok: true,
    record: first
  };
}

export async function deleteOauthStateRecord(env, state) {
  const response = await supabaseRest(
    env,
    "DELETE",
    `integration_oauth_states?state=eq.${encodeURIComponent(state)}`
  );

  if (!response.ok) {
    return { ok: false, status: response.status, error: response.error || "Could not clear OAuth state" };
  }

  return { ok: true };
}

export async function getActiveSquareConnection(env) {
  const response = await supabaseRest(
    env,
    "GET",
    "integration_square_connections?active=is.true&select=id,active,merchant_id,expires_at,scope,location_id,location_name,last_sync_at,last_sync_date,last_sync_tip_amount,connected_at,updated_at,access_token,refresh_token&order=updated_at.desc&limit=1"
  );

  if (!response.ok) {
    return { ok: false, status: response.status, error: response.error || "Could not load Square connection" };
  }

  const first = Array.isArray(response.data) ? response.data[0] : null;
  return { ok: true, connection: first || null };
}

export async function deactivateActiveSquareConnections(env, revokedAt) {
  const body = {
    active: false,
    revoked_at: revokedAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const response = await supabaseRest(
    env,
    "PATCH",
    "integration_square_connections?active=is.true",
    body
  );

  if (!response.ok) {
    return { ok: false, status: response.status, error: response.error || "Could not deactivate Square connection" };
  }

  return { ok: true };
}

export async function insertSquareConnection(env, row) {
  const inserted = await supabaseRest(
    env,
    "POST",
    "integration_square_connections",
    [row],
    { prefer: "return=representation" }
  );

  if (!inserted.ok) {
    return { ok: false, status: inserted.status, error: inserted.error || "Could not store Square connection" };
  }

  const first = Array.isArray(inserted.data) ? inserted.data[0] : null;
  if (!first || !first.id) {
    return { ok: false, status: 500, error: "Invalid Square connection response" };
  }

  return { ok: true, connection: first };
}

export async function updateSquareConnectionById(env, id, patch) {
  const response = await supabaseRest(
    env,
    "PATCH",
    `integration_square_connections?id=eq.${encodeURIComponent(id)}`,
    patch,
    { prefer: "return=representation" }
  );

  if (!response.ok) {
    return { ok: false, status: response.status, error: response.error || "Could not update Square connection" };
  }

  const first = Array.isArray(response.data) ? response.data[0] : null;
  return { ok: true, connection: first || null };
}

export async function exchangeSquareAuthCode(env, input) {
  const response = await fetch(`${env.squareBaseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_id: env.squareOauthClientId,
      client_secret: env.squareOauthClientSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri
    })
  });

  const payload = await tryJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: extractSquareError(payload) || `Square token exchange failed (${response.status})`
    };
  }

  return { ok: true, token: payload };
}

export async function refreshSquareAccessToken(env, refreshToken) {
  const response = await fetch(`${env.squareBaseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_id: env.squareOauthClientId,
      client_secret: env.squareOauthClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  const payload = await tryJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: extractSquareError(payload) || `Square token refresh failed (${response.status})`
    };
  }

  return { ok: true, token: payload };
}

export async function revokeSquareAccessToken(env, accessToken) {
  const response = await fetch(`${env.squareBaseUrl}/oauth2/revoke`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Client ${env.squareOauthClientSecret}`
    },
    body: JSON.stringify({
      client_id: env.squareOauthClientId,
      access_token: accessToken
    })
  });

  const payload = await tryJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: extractSquareError(payload) || `Square token revoke failed (${response.status})`
    };
  }

  return { ok: true };
}

export function buildSquareAuthorizeUrl(env, input) {
  const url = new URL("/oauth2/authorize", env.squareBaseUrl);
  url.searchParams.set("client_id", env.squareOauthClientId);
  url.searchParams.set("scope", env.squareOauthScopes);
  url.searchParams.set("session", "false");
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", input.redirectUri);
  return url.toString();
}

export function tokenExpiresSoon(expiresAt, bufferMs) {
  const value = String(expiresAt || "").trim();
  if (!value) {
    return false;
  }
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    return false;
  }
  const buffer = Number.isFinite(bufferMs) ? bufferMs : (5 * 60 * 1000);
  return parsed <= (Date.now() + buffer);
}

function randomToken(size) {
  const bytes = new Uint8Array(size || 32);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let index = 0; index < bytes.length; index += 1) {
    output += alphabet[bytes[index] % alphabet.length];
  }
  return output;
}

function extractSquareError(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if (Array.isArray(payload.errors) && payload.errors.length) {
    return payload.errors.map(function mapError(item) {
      if (!item || typeof item !== "object") {
        return "";
      }
      return String(item.detail || item.code || item.category || "").trim();
    }).filter(Boolean).join(" | ");
  }

  return extractError(payload);
}
