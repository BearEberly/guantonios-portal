var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/pages-Uk5jMP/functionsWorker-0.74943165365907.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
function corsHeaders(request, methods) {
  const origin = request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": methods || "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    vary: "origin"
  };
}
__name(corsHeaders, "corsHeaders");
__name2(corsHeaders, "corsHeaders");
function json(request, payload, status, methods) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request, methods)
    }
  });
}
__name(json, "json");
__name2(json, "json");
function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      location
    }
  });
}
__name(redirect, "redirect");
__name2(redirect, "redirect");
async function parseJson(request) {
  try {
    return await request.json();
  } catch (_error) {
    return {};
  }
}
__name(parseJson, "parseJson");
__name2(parseJson, "parseJson");
async function tryJson(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}
__name(tryJson, "tryJson");
__name2(tryJson, "tryJson");
function extractError(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  return payload.error || payload.message || payload.msg || payload.error_description || "";
}
__name(extractError, "extractError");
__name2(extractError, "extractError");
function readBearerToken(authorization) {
  const value = String(authorization || "").trim();
  if (!value.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return value.slice(7).trim();
}
__name(readBearerToken, "readBearerToken");
__name2(readBearerToken, "readBearerToken");
function readEnv(context, options) {
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
  const squareBaseUrl = squareEnvironment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
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
__name(readEnv, "readEnv");
__name2(readEnv, "readEnv");
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
__name(normalizePath, "normalizePath");
__name2(normalizePath, "normalizePath");
function normalizePositiveInteger(input, fallback) {
  const parsed = Number(String(input || "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
__name(normalizePositiveInteger, "normalizePositiveInteger");
__name2(normalizePositiveInteger, "normalizePositiveInteger");
function resolveOauthRedirectUri(request, env) {
  if (env.squareOauthRedirectUri) {
    return env.squareOauthRedirectUri;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/integrations/square/callback`;
}
__name(resolveOauthRedirectUri, "resolveOauthRedirectUri");
__name2(resolveOauthRedirectUri, "resolveOauthRedirectUri");
function resolveAdminRedirectUri(request, env, params) {
  const baseUrl = new URL(request.url);
  const redirectUrl = new URL(`${baseUrl.protocol}//${baseUrl.host}${env.squareAdminRedirectPath}`);
  const entries = params && typeof params === "object" ? Object.entries(params) : [];
  entries.forEach(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function appendPair(pair) {
    const key = pair[0];
    const value = pair[1];
    if (value === null || value === void 0 || value === "") {
      return;
    }
    redirectUrl.searchParams.set(String(key), String(value));
  }, "appendPair"), "appendPair"));
  return redirectUrl.toString();
}
__name(resolveAdminRedirectUri, "resolveAdminRedirectUri");
__name2(resolveAdminRedirectUri, "resolveAdminRedirectUri");
function normalizeIsoDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return "";
  }
  const parsed = /* @__PURE__ */ new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return text;
}
__name(normalizeIsoDate, "normalizeIsoDate");
__name2(normalizeIsoDate, "normalizeIsoDate");
function normalizeString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}
__name(normalizeString, "normalizeString");
__name2(normalizeString, "normalizeString");
function roundCurrency(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100) / 100;
}
__name(roundCurrency, "roundCurrency");
__name2(roundCurrency, "roundCurrency");
async function requireAdminSession(request, env) {
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
__name(requireAdminSession, "requireAdminSession");
__name2(requireAdminSession, "requireAdminSession");
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
__name(fetchCallerUser, "fetchCallerUser");
__name2(fetchCallerUser, "fetchCallerUser");
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
__name(fetchCallerRole, "fetchCallerRole");
__name2(fetchCallerRole, "fetchCallerRole");
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
  if (body !== void 0 && body !== null) {
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
__name(supabaseRest, "supabaseRest");
__name2(supabaseRest, "supabaseRest");
async function createOauthStateRecord(env, input) {
  const state = randomToken(42);
  const expiresAt = new Date(Date.now() + env.squareOauthStateTtl * 1e3).toISOString();
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
__name(createOauthStateRecord, "createOauthStateRecord");
__name2(createOauthStateRecord, "createOauthStateRecord");
async function getOauthStateRecord(env, state) {
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
__name(getOauthStateRecord, "getOauthStateRecord");
__name2(getOauthStateRecord, "getOauthStateRecord");
async function deleteOauthStateRecord(env, state) {
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
__name(deleteOauthStateRecord, "deleteOauthStateRecord");
__name2(deleteOauthStateRecord, "deleteOauthStateRecord");
async function getActiveSquareConnection(env) {
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
__name(getActiveSquareConnection, "getActiveSquareConnection");
__name2(getActiveSquareConnection, "getActiveSquareConnection");
async function deactivateActiveSquareConnections(env, revokedAt) {
  const body = {
    active: false,
    revoked_at: revokedAt || (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
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
__name(deactivateActiveSquareConnections, "deactivateActiveSquareConnections");
__name2(deactivateActiveSquareConnections, "deactivateActiveSquareConnections");
async function insertSquareConnection(env, row) {
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
__name(insertSquareConnection, "insertSquareConnection");
__name2(insertSquareConnection, "insertSquareConnection");
async function updateSquareConnectionById(env, id, patch) {
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
__name(updateSquareConnectionById, "updateSquareConnectionById");
__name2(updateSquareConnectionById, "updateSquareConnectionById");
async function exchangeSquareAuthCode(env, input) {
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
__name(exchangeSquareAuthCode, "exchangeSquareAuthCode");
__name2(exchangeSquareAuthCode, "exchangeSquareAuthCode");
async function refreshSquareAccessToken(env, refreshToken) {
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
__name(refreshSquareAccessToken, "refreshSquareAccessToken");
__name2(refreshSquareAccessToken, "refreshSquareAccessToken");
async function revokeSquareAccessToken(env, accessToken) {
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
__name(revokeSquareAccessToken, "revokeSquareAccessToken");
__name2(revokeSquareAccessToken, "revokeSquareAccessToken");
function buildSquareAuthorizeUrl(env, input) {
  const url = new URL("/oauth2/authorize", env.squareBaseUrl);
  url.searchParams.set("client_id", env.squareOauthClientId);
  url.searchParams.set("scope", env.squareOauthScopes);
  url.searchParams.set("session", "false");
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", input.redirectUri);
  return url.toString();
}
__name(buildSquareAuthorizeUrl, "buildSquareAuthorizeUrl");
__name2(buildSquareAuthorizeUrl, "buildSquareAuthorizeUrl");
function tokenExpiresSoon(expiresAt, bufferMs) {
  const value = String(expiresAt || "").trim();
  if (!value) {
    return false;
  }
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    return false;
  }
  const buffer = Number.isFinite(bufferMs) ? bufferMs : 5 * 60 * 1e3;
  return parsed <= Date.now() + buffer;
}
__name(tokenExpiresSoon, "tokenExpiresSoon");
__name2(tokenExpiresSoon, "tokenExpiresSoon");
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
__name(randomToken, "randomToken");
__name2(randomToken, "randomToken");
function extractSquareError(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  if (Array.isArray(payload.errors) && payload.errors.length) {
    return payload.errors.map(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function mapError(item) {
      if (!item || typeof item !== "object") {
        return "";
      }
      return String(item.detail || item.code || item.category || "").trim();
    }, "mapError"), "mapError")).filter(Boolean).join(" | ");
  }
  return extractError(payload);
}
__name(extractSquareError, "extractSquareError");
__name2(extractSquareError, "extractSquareError");
async function onRequest(context) {
  if (context.request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  return onRequestGet(context);
}
__name(onRequest, "onRequest");
__name2(onRequest, "onRequest");
async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  try {
    const env = readEnv(context, { requireOAuthCredentials: true });
    const squareError = String(requestUrl.searchParams.get("error") || "").trim();
    if (squareError) {
      const detail = String(requestUrl.searchParams.get("error_description") || squareError).trim();
      return redirect(resolveAdminRedirectUri(context.request, env, { square_error: detail }));
    }
    const code = String(requestUrl.searchParams.get("code") || "").trim();
    const state = String(requestUrl.searchParams.get("state") || "").trim();
    if (!code || !state) {
      return redirect(resolveAdminRedirectUri(context.request, env, { square_error: "Missing code or state" }));
    }
    const stateRecord = await getOauthStateRecord(env, state);
    if (!stateRecord.ok) {
      return redirect(resolveAdminRedirectUri(context.request, env, { square_error: stateRecord.error }));
    }
    const redirectUri = resolveOauthRedirectUri(context.request, env);
    const tokenResponse = await exchangeSquareAuthCode(env, { code, redirectUri });
    if (!tokenResponse.ok || !tokenResponse.token) {
      await deleteOauthStateRecord(env, state);
      return redirect(resolveAdminRedirectUri(context.request, env, { square_error: tokenResponse.error || "Square token exchange failed" }));
    }
    const token = tokenResponse.token;
    if (!token.access_token) {
      await deleteOauthStateRecord(env, state);
      return redirect(resolveAdminRedirectUri(context.request, env, { square_error: "Square did not return an access token" }));
    }
    const deactivated = await deactivateActiveSquareConnections(env, (/* @__PURE__ */ new Date()).toISOString());
    if (!deactivated.ok) {
      await deleteOauthStateRecord(env, state);
      return redirect(resolveAdminRedirectUri(context.request, env, { square_error: deactivated.error || "Could not deactivate previous connection" }));
    }
    const inserted = await insertSquareConnection(env, {
      active: true,
      merchant_id: normalizeString(token.merchant_id, 120) || null,
      access_token: String(token.access_token || ""),
      refresh_token: normalizeString(token.refresh_token, 300) || null,
      expires_at: normalizeTimestamp(token.expires_at),
      scope: normalizeScopes(token.scopes) || null,
      location_id: normalizeString(stateRecord.record.location_id, 80) || null,
      location_name: normalizeString(stateRecord.record.location_name, 80) || null,
      connected_by: stateRecord.record.admin_user_id,
      connected_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    await deleteOauthStateRecord(env, state);
    if (!inserted.ok) {
      return redirect(resolveAdminRedirectUri(context.request, env, { square_error: inserted.error || "Could not save Square connection" }));
    }
    return redirect(resolveAdminRedirectUri(context.request, env, { square_connected: "1" }));
  } catch (error) {
    const fallbackUrl = new URL(context.request.url);
    fallbackUrl.pathname = "/app/admin.html";
    fallbackUrl.search = "";
    fallbackUrl.searchParams.set("square_error", String(error));
    return redirect(fallbackUrl.toString());
  }
}
__name(onRequestGet, "onRequestGet");
__name2(onRequestGet, "onRequestGet");
function normalizeScopes(scopes) {
  if (Array.isArray(scopes)) {
    return scopes.map(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function mapScope(item) {
      return String(item || "").trim();
    }, "mapScope"), "mapScope")).filter(Boolean).join(" ");
  }
  return String(scopes || "").trim();
}
__name(normalizeScopes, "normalizeScopes");
__name2(normalizeScopes, "normalizeScopes");
function normalizeTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}
__name(normalizeTimestamp, "normalizeTimestamp");
__name2(normalizeTimestamp, "normalizeTimestamp");
async function onRequest2(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(context.request, "POST, OPTIONS") });
  }
  if (context.request.method !== "POST") {
    return json(context.request, { ok: false, error: "Method not allowed" }, 405, "POST, OPTIONS");
  }
  return onRequestPost(context);
}
__name(onRequest2, "onRequest2");
__name2(onRequest2, "onRequest");
async function onRequestPost(context) {
  try {
    const env = readEnv(context, { requireOAuthCredentials: true });
    const adminSession = await requireAdminSession(context.request, env);
    if (!adminSession.ok) {
      return json(context.request, { ok: false, error: adminSession.error }, adminSession.status || 401, "POST, OPTIONS");
    }
    const body = await parseJson(context.request);
    const locationId = normalizeString(body.locationId, 80);
    const locationName = normalizeString(body.locationName, 80);
    const stateRecord = await createOauthStateRecord(env, {
      adminUserId: adminSession.user.id,
      locationId,
      locationName
    });
    if (!stateRecord.ok) {
      return json(context.request, { ok: false, error: stateRecord.error }, stateRecord.status || 500, "POST, OPTIONS");
    }
    const redirectUri = resolveOauthRedirectUri(context.request, env);
    const authUrl = buildSquareAuthorizeUrl(env, {
      state: stateRecord.state,
      redirectUri
    });
    return json(context.request, {
      ok: true,
      provider: "square",
      auth_url: authUrl,
      state_expires_at: stateRecord.expiresAt
    }, 200, "POST, OPTIONS");
  } catch (error) {
    return json(context.request, { ok: false, error: String(error) }, 500, "POST, OPTIONS");
  }
}
__name(onRequestPost, "onRequestPost");
__name2(onRequestPost, "onRequestPost");
async function onRequest3(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(context.request, "POST, OPTIONS") });
  }
  if (context.request.method !== "POST") {
    return json(context.request, { ok: false, error: "Method not allowed" }, 405, "POST, OPTIONS");
  }
  return onRequestPost2(context);
}
__name(onRequest3, "onRequest3");
__name2(onRequest3, "onRequest");
async function onRequestPost2(context) {
  try {
    const env = readEnv(context, { requireOAuthCredentials: false });
    const adminSession = await requireAdminSession(context.request, env);
    if (!adminSession.ok) {
      return json(context.request, { ok: false, error: adminSession.error }, adminSession.status || 401, "POST, OPTIONS");
    }
    const connectionResult = await getActiveSquareConnection(env);
    if (!connectionResult.ok) {
      return json(context.request, { ok: false, error: connectionResult.error }, connectionResult.status || 500, "POST, OPTIONS");
    }
    const connection = connectionResult.connection;
    if (!connection) {
      return json(context.request, {
        ok: true,
        disconnected: true,
        message: "Square already disconnected."
      }, 200, "POST, OPTIONS");
    }
    let revokeWarning = "";
    if (env.squareOauthClientId && env.squareOauthClientSecret && connection.access_token) {
      const revoked = await revokeSquareAccessToken(env, String(connection.access_token || ""));
      if (!revoked.ok) {
        revokeWarning = revoked.error || "Square revoke failed, but local connection was removed.";
      }
    }
    const deactivated = await deactivateActiveSquareConnections(env, (/* @__PURE__ */ new Date()).toISOString());
    if (!deactivated.ok) {
      return json(context.request, { ok: false, error: deactivated.error }, deactivated.status || 500, "POST, OPTIONS");
    }
    return json(context.request, {
      ok: true,
      disconnected: true,
      warning: revokeWarning || null
    }, 200, "POST, OPTIONS");
  } catch (error) {
    return json(context.request, { ok: false, error: String(error) }, 500, "POST, OPTIONS");
  }
}
__name(onRequestPost2, "onRequestPost2");
__name2(onRequestPost2, "onRequestPost");
async function onRequest4(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(context.request, "GET, OPTIONS") });
  }
  if (context.request.method !== "GET") {
    return json(context.request, { ok: false, error: "Method not allowed" }, 405, "GET, OPTIONS");
  }
  return onRequestGet2(context);
}
__name(onRequest4, "onRequest4");
__name2(onRequest4, "onRequest");
async function onRequestGet2(context) {
  try {
    const env = readEnv(context, { requireOAuthCredentials: false });
    const adminSession = await requireAdminSession(context.request, env);
    if (!adminSession.ok) {
      return json(context.request, { ok: false, error: adminSession.error }, adminSession.status || 401, "GET, OPTIONS");
    }
    const connectionResult = await getActiveSquareConnection(env);
    if (!connectionResult.ok) {
      return json(context.request, { ok: false, error: connectionResult.error }, connectionResult.status || 500, "GET, OPTIONS");
    }
    const connection = connectionResult.connection;
    if (connection) {
      return json(context.request, {
        ok: true,
        connected: true,
        source: "oauth",
        merchant_id: connection.merchant_id || null,
        location_id: connection.location_id || null,
        location_name: connection.location_name || null,
        connected_at: connection.connected_at || connection.created_at || null,
        expires_at: connection.expires_at || null,
        last_sync_at: connection.last_sync_at || null,
        last_sync_date: connection.last_sync_date || null,
        last_sync_tip_amount: Number(connection.last_sync_tip_amount || 0)
      }, 200, "GET, OPTIONS");
    }
    if (env.squareAccessToken) {
      return json(context.request, {
        ok: true,
        connected: true,
        source: "env",
        merchant_id: null,
        location_id: env.squareLocationId || null,
        location_name: null,
        connected_at: null,
        expires_at: null,
        last_sync_at: null,
        last_sync_date: null,
        last_sync_tip_amount: 0
      }, 200, "GET, OPTIONS");
    }
    return json(context.request, {
      ok: true,
      connected: false,
      source: "none"
    }, 200, "GET, OPTIONS");
  } catch (error) {
    return json(context.request, { ok: false, error: String(error) }, 500, "GET, OPTIONS");
  }
}
__name(onRequestGet2, "onRequestGet2");
__name2(onRequestGet2, "onRequestGet");
async function onRequest5(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(context.request, "POST, OPTIONS") });
  }
  if (context.request.method !== "POST") {
    return json(context.request, { ok: false, error: "Method not allowed" }, 405, "POST, OPTIONS");
  }
  return onRequestPost3(context);
}
__name(onRequest5, "onRequest5");
__name2(onRequest5, "onRequest");
async function onRequestPost3(context) {
  try {
    const env = readEnv(context, { requireOAuthCredentials: false });
    const adminSession = await requireAdminSession(context.request, env);
    if (!adminSession.ok) {
      return json(context.request, { ok: false, error: adminSession.error }, adminSession.status || 401, "POST, OPTIONS");
    }
    const body = await parseJson(context.request);
    const dateIso = normalizeIsoDate(body.date);
    if (!dateIso) {
      return json(context.request, { ok: false, error: "Valid date is required (YYYY-MM-DD)" }, 400, "POST, OPTIONS");
    }
    const requestedLocationId = normalizeString(body.locationId, 80);
    const requestedLocationName = normalizeString(body.locationName, 80);
    const range = dateRangeForBusinessDay(dateIso, env.squareBusinessTimeZone);
    const connectionResult = await getActiveSquareConnection(env);
    if (!connectionResult.ok) {
      return json(context.request, { ok: false, error: connectionResult.error }, connectionResult.status || 500, "POST, OPTIONS");
    }
    const connection = connectionResult.connection;
    let source = "none";
    let accessToken = "";
    let connectionId = "";
    let connectionLocationId = "";
    if (connection && connection.access_token) {
      source = "oauth";
      accessToken = String(connection.access_token || "");
      connectionId = String(connection.id || "");
      connectionLocationId = String(connection.location_id || "");
      if (tokenExpiresSoon(connection.expires_at) && connection.refresh_token && env.squareOauthClientId && env.squareOauthClientSecret) {
        const refreshed = await refreshSquareAccessToken(env, String(connection.refresh_token || ""));
        if (refreshed.ok && refreshed.token && refreshed.token.access_token) {
          accessToken = String(refreshed.token.access_token || "");
          const refreshPatch = {
            access_token: accessToken,
            refresh_token: String(refreshed.token.refresh_token || connection.refresh_token || ""),
            expires_at: String(refreshed.token.expires_at || connection.expires_at || ""),
            scope: normalizeScope(refreshed.token.scopes),
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          };
          await updateSquareConnectionById(env, connectionId, refreshPatch);
        }
      }
    } else if (env.squareAccessToken) {
      source = "env";
      accessToken = env.squareAccessToken;
    }
    if (!accessToken) {
      return json(
        context.request,
        { ok: false, error: "Square is not connected. Connect Square on Admin > Integrations first." },
        400,
        "POST, OPTIONS"
      );
    }
    const resolvedLocationId = requestedLocationId || connectionLocationId || env.squareLocationId || "";
    const sync = await fetchSquareTips({
      baseUrl: env.squareBaseUrl,
      squareAccessToken: accessToken,
      locationId: resolvedLocationId,
      beginTimeIso: range.start.toISOString(),
      endTimeIso: range.end.toISOString()
    });
    if (!sync.ok) {
      return json(context.request, { ok: false, error: sync.error }, sync.status || 502, "POST, OPTIONS");
    }
    let orderMetrics = {
      ok: true,
      totalDiscountCents: 0,
      serviceChargeCents: 0,
      autoGratuityCents: 0,
      orderCount: 0,
      warning: ""
    };
    if (sync.orderIds.length) {
      const ordersResult = await fetchSquareOrderMetrics({
        baseUrl: env.squareBaseUrl,
        squareAccessToken: accessToken,
        locationId: resolvedLocationId,
        orderIds: sync.orderIds
      });
      if (ordersResult.ok) {
        orderMetrics = ordersResult;
      } else {
        orderMetrics.warning = ordersResult.error || "Order-level metrics unavailable for this sync.";
      }
    }
    const squareTipsAmount = roundCurrency(sync.totalTipCents / 100);
    const grossSalesAmount = roundCurrency(sync.totalCollectedCents / 100);
    const cashSalesAmount = roundCurrency(sync.cashCollectedCents / 100);
    const cardSalesAmount = roundCurrency(sync.cardCollectedCents / 100);
    const refundAmount = roundCurrency(sync.totalRefundCents / 100);
    const discountAmount = roundCurrency(orderMetrics.totalDiscountCents / 100);
    const autoGratuityAmount = roundCurrency(orderMetrics.autoGratuityCents / 100);
    const netSalesAmount = roundCurrency((sync.totalCollectedCents - sync.totalRefundCents) / 100);
    const suggestedInputs = {
      square_tips: squareTipsAmount,
      large_party_tips: autoGratuityAmount,
      cash_on_hand: cashSalesAmount,
      cash_due: null
    };
    if (source === "oauth" && connectionId) {
      await updateSquareConnectionById(env, connectionId, {
        last_sync_at: (/* @__PURE__ */ new Date()).toISOString(),
        last_sync_date: dateIso,
        last_sync_tip_amount: squareTipsAmount,
        location_id: resolvedLocationId || null,
        location_name: requestedLocationName || String(connection.location_name || "") || null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return json(context.request, {
      ok: true,
      provider: "square",
      source,
      date: dateIso,
      timezone: env.squareBusinessTimeZone,
      location_id: resolvedLocationId || null,
      payment_count: sync.paymentCount,
      order_count: orderMetrics.orderCount,
      currency: sync.currency || "USD",
      square_tips: squareTipsAmount,
      large_party_tips: autoGratuityAmount,
      gross_sales: grossSalesAmount,
      net_sales: netSalesAmount,
      card_sales: cardSalesAmount,
      cash_sales: cashSalesAmount,
      refunds: refundAmount,
      discounts: discountAmount,
      suggested_inputs: suggestedInputs,
      warning: orderMetrics.warning || null,
      window_start: range.start.toISOString(),
      window_end: range.end.toISOString()
    }, 200, "POST, OPTIONS");
  } catch (error) {
    return json(context.request, { ok: false, error: String(error) }, 500, "POST, OPTIONS");
  }
}
__name(onRequestPost3, "onRequestPost3");
__name2(onRequestPost3, "onRequestPost");
function normalizeScope(scopes) {
  if (Array.isArray(scopes)) {
    return scopes.map(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function mapScope(scope) {
      return String(scope || "").trim();
    }, "mapScope"), "mapScope")).filter(Boolean).join(" ");
  }
  return String(scopes || "").trim();
}
__name(normalizeScope, "normalizeScope");
__name2(normalizeScope, "normalizeScope");
function addDaysIso(isoDate, dayCount) {
  const base = /* @__PURE__ */ new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) {
    return isoDate;
  }
  base.setUTCDate(base.getUTCDate() + dayCount);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
}
__name(addDaysIso, "addDaysIso");
__name2(addDaysIso, "addDaysIso");
function getFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
__name(getFormatter, "getFormatter");
__name2(getFormatter, "getFormatter");
function partsFromDate(date, timeZone) {
  const formatter = getFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const output = {};
  parts.forEach(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function mapPart(part) {
    if (part.type === "year" || part.type === "month" || part.type === "day" || part.type === "hour" || part.type === "minute" || part.type === "second") {
      output[part.type] = Number(part.value);
    }
  }, "mapPart"), "mapPart"));
  return output;
}
__name(partsFromDate, "partsFromDate");
__name2(partsFromDate, "partsFromDate");
function zonedDateTimeToUtcDate(input, timeZone) {
  const year = Number(input.year);
  const month = Number(input.month);
  const day = Number(input.day);
  const hour = Number(input.hour || 0);
  const minute = Number(input.minute || 0);
  const second = Number(input.second || 0);
  const millisecond = Number(input.millisecond || 0);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const guessDate = new Date(utcGuess);
  const localParts = partsFromDate(guessDate, timeZone);
  const localAsUtc = Date.UTC(
    localParts.year,
    localParts.month - 1,
    localParts.day,
    localParts.hour,
    localParts.minute,
    localParts.second,
    0
  );
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const offsetMs = localAsUtc - utcGuess;
  const correctedUtc = desiredAsUtc - offsetMs;
  return new Date(correctedUtc + millisecond);
}
__name(zonedDateTimeToUtcDate, "zonedDateTimeToUtcDate");
__name2(zonedDateTimeToUtcDate, "zonedDateTimeToUtcDate");
function dateRangeForBusinessDay(dateIso, timeZone) {
  const [year, month, day] = dateIso.split("-").map(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function toNumber(part) {
    return Number(part);
  }, "toNumber"), "toNumber"));
  const nextDateIso = addDaysIso(dateIso, 1);
  const [nextYear, nextMonth, nextDay] = nextDateIso.split("-").map(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function toNumber(part) {
    return Number(part);
  }, "toNumber"), "toNumber"));
  const start = zonedDateTimeToUtcDate(
    { year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timeZone
  );
  const nextStart = zonedDateTimeToUtcDate(
    { year: nextYear, month: nextMonth, day: nextDay, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timeZone
  );
  const end = new Date(nextStart.getTime() - 1);
  return { start, end };
}
__name(dateRangeForBusinessDay, "dateRangeForBusinessDay");
__name2(dateRangeForBusinessDay, "dateRangeForBusinessDay");
async function fetchSquareTips(input) {
  let cursor = "";
  let totalTipCents = 0;
  let totalCollectedCents = 0;
  let cashCollectedCents = 0;
  let cardCollectedCents = 0;
  let totalRefundCents = 0;
  let paymentCount = 0;
  let currency = "";
  const orderIds = /* @__PURE__ */ new Set();
  for (; ; ) {
    const url = new URL("/v2/payments", input.baseUrl);
    url.searchParams.set("begin_time", input.beginTimeIso);
    url.searchParams.set("end_time", input.endTimeIso);
    url.searchParams.set("sort_order", "ASC");
    url.searchParams.set("limit", "100");
    if (input.locationId) {
      url.searchParams.set("location_id", input.locationId);
    }
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${input.squareAccessToken}`,
        "square-version": "2026-01-22"
      }
    });
    const payload = await response.json().catch(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function fallbackJson() {
      return null;
    }, "fallbackJson"), "fallbackJson"));
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: extractSquareError2(payload) || `Square API request failed (${response.status})`
      };
    }
    const payments = Array.isArray(payload && payload.payments) ? payload.payments : [];
    payments.forEach(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function sumPayment(payment) {
      const status = String(payment && payment.status || "").toUpperCase();
      if (status && status !== "COMPLETED") {
        return;
      }
      paymentCount += 1;
      const tipAmount = Number(
        payment && payment.tip_money && typeof payment.tip_money.amount !== "undefined" ? payment.tip_money.amount : 0
      );
      if (Number.isFinite(tipAmount)) {
        totalTipCents += tipAmount;
      }
      const totalMoney = readMoneyAmount(payment && payment.total_money);
      const refundedMoney = readMoneyAmount(payment && payment.refunded_money);
      const sourceType = String(payment && payment.source_type || "").trim().toUpperCase();
      const orderId = String(payment && payment.order_id || "").trim();
      if (Number.isFinite(totalMoney)) {
        totalCollectedCents += totalMoney;
        if (sourceType === "CASH") {
          cashCollectedCents += totalMoney;
        } else {
          cardCollectedCents += totalMoney;
        }
      }
      if (Number.isFinite(refundedMoney)) {
        totalRefundCents += refundedMoney;
      }
      if (orderId) {
        orderIds.add(orderId);
      }
      if (!currency) {
        currency = String(
          payment && payment.tip_money && payment.tip_money.currency ? payment.tip_money.currency : payment && payment.total_money && payment.total_money.currency ? payment.total_money.currency : ""
        ).toUpperCase();
      }
    }, "sumPayment"), "sumPayment"));
    cursor = payload && payload.cursor ? String(payload.cursor) : "";
    if (!cursor) {
      break;
    }
  }
  return {
    ok: true,
    totalTipCents,
    totalCollectedCents,
    cashCollectedCents,
    cardCollectedCents,
    totalRefundCents,
    paymentCount,
    currency: currency || "USD",
    orderIds: Array.from(orderIds)
  };
}
__name(fetchSquareTips, "fetchSquareTips");
__name2(fetchSquareTips, "fetchSquareTips");
async function fetchSquareOrderMetrics(input) {
  const orderIds = Array.isArray(input.orderIds) ? input.orderIds.filter(Boolean) : [];
  if (!orderIds.length) {
    return {
      ok: true,
      totalDiscountCents: 0,
      serviceChargeCents: 0,
      autoGratuityCents: 0,
      orderCount: 0,
      warning: ""
    };
  }
  const totals = {
    totalDiscountCents: 0,
    serviceChargeCents: 0,
    autoGratuityCents: 0,
    orderCount: 0
  };
  const chunkSize = 100;
  for (let start = 0; start < orderIds.length; start += chunkSize) {
    const chunk = orderIds.slice(start, start + chunkSize);
    const body = {
      order_ids: chunk
    };
    if (input.locationId) {
      body.location_id = input.locationId;
    }
    const response = await fetch(new URL("/v2/orders/batch-retrieve", input.baseUrl).toString(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.squareAccessToken}`,
        "square-version": "2026-01-22",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function fallbackJson() {
      return null;
    }, "fallbackJson"), "fallbackJson"));
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: extractSquareError2(payload) || `Square orders request failed (${response.status})`
      };
    }
    const orders = Array.isArray(payload && payload.orders) ? payload.orders : [];
    orders.forEach(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function inspectOrder(order) {
      totals.orderCount += 1;
      totals.totalDiscountCents += readMoneyAmount(order && order.total_discount_money);
      const serviceCharges = Array.isArray(order && order.service_charges) ? order.service_charges : [];
      if (serviceCharges.length) {
        serviceCharges.forEach(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function inspectServiceCharge(serviceCharge) {
          const amount = readMoneyAmount(
            serviceCharge && (serviceCharge.total_money || serviceCharge.applied_money || serviceCharge.amount_money)
          );
          if (!amount) {
            return;
          }
          totals.serviceChargeCents += amount;
          const label = String(
            serviceCharge && serviceCharge.name || serviceCharge && serviceCharge.calculation_phase || ""
          ).toLowerCase();
          if (label.includes("gratuity") || label.includes("large") || label.includes("party")) {
            totals.autoGratuityCents += amount;
          }
        }, "inspectServiceCharge"), "inspectServiceCharge"));
      } else {
        const fallbackServiceCharge = readMoneyAmount(order && order.total_service_charge_money);
        if (fallbackServiceCharge > 0) {
          totals.serviceChargeCents += fallbackServiceCharge;
          totals.autoGratuityCents += fallbackServiceCharge;
        }
      }
    }, "inspectOrder"), "inspectOrder"));
  }
  if (!totals.autoGratuityCents && totals.serviceChargeCents > 0) {
    totals.autoGratuityCents = totals.serviceChargeCents;
  }
  return {
    ok: true,
    ...totals,
    warning: ""
  };
}
__name(fetchSquareOrderMetrics, "fetchSquareOrderMetrics");
__name2(fetchSquareOrderMetrics, "fetchSquareOrderMetrics");
function readMoneyAmount(moneyObj) {
  if (!moneyObj || typeof moneyObj !== "object") {
    return 0;
  }
  const amount = Number(
    Object.prototype.hasOwnProperty.call(moneyObj, "amount") ? moneyObj.amount : 0
  );
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount);
}
__name(readMoneyAmount, "readMoneyAmount");
__name2(readMoneyAmount, "readMoneyAmount");
function extractSquareError2(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  if (Array.isArray(payload.errors) && payload.errors.length) {
    return payload.errors.map(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function toMessage(errorItem) {
      return errorItem && (errorItem.detail || errorItem.code || errorItem.category) ? String(errorItem.detail || errorItem.code || errorItem.category) : "";
    }, "toMessage"), "toMessage")).filter(Boolean).join(" | ");
  }
  return String(payload.error || payload.message || "");
}
__name(extractSquareError2, "extractSquareError2");
__name2(extractSquareError2, "extractSquareError");
async function onRequest6(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders2(context.request) });
  }
  if (context.request.method !== "POST") {
    return json2(context.request, { ok: false, error: "Method not allowed" }, 405);
  }
  return onRequestPost4(context);
}
__name(onRequest6, "onRequest6");
__name2(onRequest6, "onRequest");
async function onRequestPost4(context) {
  try {
    const env = readEnv2(context);
    const accessToken = readBearerToken2(context.request.headers.get("authorization"));
    if (!accessToken) {
      return json2(context.request, { ok: false, error: "Missing bearer token" }, 401);
    }
    const caller = await fetchCallerUser2(env.supabaseUrl, env.anonOrServiceKey, accessToken);
    if (!caller.ok) {
      return json2(context.request, { ok: false, error: "Invalid or expired session" }, 401);
    }
    const callerRole = await fetchCallerRole2(env.supabaseUrl, env.serviceRoleKey, caller.user.id);
    if (!callerRole.ok) {
      return json2(context.request, { ok: false, error: callerRole.error }, 403);
    }
    if (callerRole.role !== "admin") {
      return json2(context.request, { ok: false, error: "Admin role required" }, 403);
    }
    const body = await parseJson2(context.request);
    const email = normalizeEmail(body.email);
    const fullName = normalizeString2(body.fullName, 120);
    const role = normalizeRole(body.role);
    const station = normalizeString2(body.station, 80);
    if (!email || !isValidEmail(email)) {
      return json2(context.request, { ok: false, error: "Valid email is required" }, 400);
    }
    const redirectTo = normalizeRedirect(body.redirectTo, context.request, env.defaultInviteRedirect);
    const invite = await sendInvite(env.supabaseUrl, env.serviceRoleKey, {
      email,
      redirectTo,
      data: {
        full_name: fullName || null,
        role,
        station: station || null
      }
    });
    if (!invite.ok) {
      return json2(context.request, { ok: false, error: invite.error }, invite.status || 400);
    }
    const invitedUserId = invite.user && invite.user.id ? invite.user.id : null;
    if (invitedUserId) {
      const upsert = await upsertProfile(env.supabaseUrl, env.serviceRoleKey, {
        id: invitedUserId,
        full_name: fullName || null,
        role,
        station: station || null,
        active: true
      });
      if (!upsert.ok) {
        return json2(context.request, {
          ok: true,
          warning: `Invite sent to ${email}, but profile upsert failed: ${upsert.error}`,
          invitedUserId
        }, 200);
      }
    }
    return json2(context.request, {
      ok: true,
      message: `Invite sent to ${email}`,
      invitedUserId,
      role
    }, 200);
  } catch (error) {
    return json2(context.request, { ok: false, error: String(error) }, 500);
  }
}
__name(onRequestPost4, "onRequestPost4");
__name2(onRequestPost4, "onRequestPost");
function readEnv2(context) {
  const supabaseUrl = (context.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = (context.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = (context.env.SUPABASE_ANON_KEY || "").trim();
  const defaultInviteRedirect = (context.env.INVITE_REDIRECT_TO || "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Pages Function env vars");
  }
  return {
    supabaseUrl,
    serviceRoleKey,
    anonOrServiceKey: anonKey || serviceRoleKey,
    defaultInviteRedirect
  };
}
__name(readEnv2, "readEnv2");
__name2(readEnv2, "readEnv");
function readBearerToken2(authorization) {
  const value = String(authorization || "").trim();
  if (!value.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return value.slice(7).trim();
}
__name(readBearerToken2, "readBearerToken2");
__name2(readBearerToken2, "readBearerToken");
async function fetchCallerUser2(supabaseUrl, anonOrServiceKey, accessToken) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonOrServiceKey,
      authorization: `Bearer ${accessToken}`
    }
  });
  const payload = await tryJson2(response);
  if (!response.ok || !payload || !payload.id) {
    return { ok: false };
  }
  return { ok: true, user: payload };
}
__name(fetchCallerUser2, "fetchCallerUser2");
__name2(fetchCallerUser2, "fetchCallerUser");
async function fetchCallerRole2(supabaseUrl, serviceRoleKey, userId) {
  const endpoint = `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`
    }
  });
  const payload = await tryJson2(response);
  if (!response.ok) {
    return { ok: false, error: "Could not validate caller role" };
  }
  const first = Array.isArray(payload) ? payload[0] : null;
  if (!first || !first.role) {
    return { ok: false, error: "Caller profile not found" };
  }
  return { ok: true, role: first.role };
}
__name(fetchCallerRole2, "fetchCallerRole2");
__name2(fetchCallerRole2, "fetchCallerRole");
async function sendInvite(supabaseUrl, serviceRoleKey, input) {
  const response = await fetch(`${supabaseUrl}/auth/v1/invite`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`
    },
    body: JSON.stringify(input)
  });
  const payload = await tryJson2(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: extractError2(payload) || `Invite API request failed (${response.status})`
    };
  }
  return {
    ok: true,
    user: payload && payload.user ? payload.user : payload
  };
}
__name(sendInvite, "sendInvite");
__name2(sendInvite, "sendInvite");
async function upsertProfile(supabaseUrl, serviceRoleKey, profile) {
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`
    },
    body: JSON.stringify([profile])
  });
  if (!response.ok) {
    const payload = await tryJson2(response);
    return { ok: false, error: extractError2(payload) || `Profile upsert failed (${response.status})` };
  }
  return { ok: true };
}
__name(upsertProfile, "upsertProfile");
__name2(upsertProfile, "upsertProfile");
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
__name(normalizeEmail, "normalizeEmail");
__name2(normalizeEmail, "normalizeEmail");
function normalizeString2(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}
__name(normalizeString2, "normalizeString2");
__name2(normalizeString2, "normalizeString");
function normalizeRole(role) {
  const value = String(role || "employee").trim().toLowerCase();
  if (value === "admin" || value === "manager" || value === "employee") {
    return value;
  }
  return "employee";
}
__name(normalizeRole, "normalizeRole");
__name2(normalizeRole, "normalizeRole");
function normalizeRedirect(redirectTo, request, fallback) {
  const candidate = String(redirectTo || "").trim();
  const requestUrl = new URL(request.url);
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      if (parsed.origin === requestUrl.origin) {
        return candidate;
      }
    } catch (_error) {
    }
  }
  if (fallback) {
    return fallback;
  }
  return `${requestUrl.protocol}//${requestUrl.host}/app/reset.html`;
}
__name(normalizeRedirect, "normalizeRedirect");
__name2(normalizeRedirect, "normalizeRedirect");
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
__name(isValidEmail, "isValidEmail");
__name2(isValidEmail, "isValidEmail");
async function parseJson2(request) {
  try {
    return await request.json();
  } catch (_error) {
    return {};
  }
}
__name(parseJson2, "parseJson2");
__name2(parseJson2, "parseJson");
async function tryJson2(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}
__name(tryJson2, "tryJson2");
__name2(tryJson2, "tryJson");
function extractError2(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  return payload.msg || payload.message || payload.error_description || payload.error || "";
}
__name(extractError2, "extractError2");
__name2(extractError2, "extractError");
function json2(request, payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders2(request)
    }
  });
}
__name(json2, "json2");
__name2(json2, "json");
function corsHeaders2(request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type"
  };
}
__name(corsHeaders2, "corsHeaders2");
__name2(corsHeaders2, "corsHeaders");
async function onRequest7(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders3(context.request) });
  }
  if (context.request.method !== "POST") {
    return json3(context.request, { ok: false, error: "Method not allowed" }, 405);
  }
  return onRequestPost5(context);
}
__name(onRequest7, "onRequest7");
__name2(onRequest7, "onRequest");
async function onRequestPost5(context) {
  try {
    const env = readEnv3(context);
    const accessToken = readBearerToken3(context.request.headers.get("authorization"));
    if (!accessToken) {
      return json3(context.request, { ok: false, error: "Missing bearer token" }, 401);
    }
    const caller = await fetchCallerProfile({
      supabaseUrl: env.supabaseUrl,
      anonOrServiceKey: env.anonOrServiceKey,
      serviceRoleKey: env.serviceRoleKey,
      accessToken
    });
    if (!caller.ok) {
      return json3(context.request, { ok: false, error: caller.error || "Invalid session" }, 401);
    }
    if (caller.profile.active === false) {
      return json3(context.request, { ok: false, error: "Inactive profile" }, 403);
    }
    const body = await parseJson3(context.request);
    const sopId = Number(body.sopId);
    if (!Number.isInteger(sopId) || sopId <= 0) {
      return json3(context.request, { ok: false, error: "Valid sopId is required" }, 400);
    }
    const sop = await fetchSopRecord({
      supabaseUrl: env.supabaseUrl,
      serviceRoleKey: env.serviceRoleKey,
      sopId
    });
    if (!sop.ok) {
      return json3(context.request, { ok: false, error: sop.error }, sop.status || 404);
    }
    if (!canViewSop(caller.profile.role, sop.data.visibility)) {
      return json3(context.request, { ok: false, error: "Not authorized for this SOP" }, 403);
    }
    const source = selectSopSource(sop.data, env.bucket);
    if (!source.ok) {
      return json3(context.request, { ok: false, error: source.error }, 400);
    }
    if (source.type === "direct") {
      return json3(context.request, {
        ok: true,
        signedUrl: source.url,
        expiresInSeconds: 0,
        title: sop.data.title
      }, 200);
    }
    const signed = await createSignedDownloadUrl({
      supabaseUrl: env.supabaseUrl,
      serviceRoleKey: env.serviceRoleKey,
      bucket: source.bucket,
      path: source.path,
      expiresIn: env.downloadTtl
    });
    if (!signed.ok) {
      return json3(context.request, { ok: false, error: signed.error }, signed.status || 400);
    }
    return json3(context.request, {
      ok: true,
      signedUrl: signed.signedUrl,
      expiresInSeconds: env.downloadTtl,
      title: sop.data.title
    }, 200);
  } catch (error) {
    return json3(context.request, { ok: false, error: String(error) }, 500);
  }
}
__name(onRequestPost5, "onRequestPost5");
__name2(onRequestPost5, "onRequestPost");
function readEnv3(context) {
  const supabaseUrl = String(context.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(context.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = String(context.env.SUPABASE_ANON_KEY || "").trim();
  const bucket = String(context.env.SOPS_BUCKET || "staff-sops").trim();
  const downloadTtl = Number(context.env.SOP_DOWNLOAD_TTL || 900);
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return {
    supabaseUrl,
    serviceRoleKey,
    anonOrServiceKey: anonKey || serviceRoleKey,
    bucket,
    downloadTtl: Number.isFinite(downloadTtl) && downloadTtl > 0 ? downloadTtl : 900
  };
}
__name(readEnv3, "readEnv3");
__name2(readEnv3, "readEnv");
function readBearerToken3(authorization) {
  const value = String(authorization || "").trim();
  if (!value.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return value.slice(7).trim();
}
__name(readBearerToken3, "readBearerToken3");
__name2(readBearerToken3, "readBearerToken");
async function fetchCallerProfile(input) {
  const userResponse = await fetch(`${input.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: input.anonOrServiceKey,
      authorization: `Bearer ${input.accessToken}`
    }
  });
  const userPayload = await tryJson3(userResponse);
  if (!userResponse.ok || !userPayload || !userPayload.id) {
    return { ok: false, error: "Invalid or expired session" };
  }
  const profileUrl = `${input.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userPayload.id)}&select=id,role,active&limit=1`;
  const profileResponse = await fetch(profileUrl, {
    method: "GET",
    headers: {
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`
    }
  });
  const profilePayload = await tryJson3(profileResponse);
  if (!profileResponse.ok) {
    return { ok: false, error: "Could not load caller profile" };
  }
  const profile = Array.isArray(profilePayload) ? profilePayload[0] : null;
  if (!profile || !profile.role) {
    return { ok: false, error: "Caller profile not found" };
  }
  return { ok: true, profile };
}
__name(fetchCallerProfile, "fetchCallerProfile");
__name2(fetchCallerProfile, "fetchCallerProfile");
async function fetchSopRecord(input) {
  const endpoint = `${input.supabaseUrl}/rest/v1/sops?id=eq.${input.sopId}&select=id,title,visibility,file_url,storage_path&limit=1`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`
    }
  });
  const payload = await tryJson3(response);
  if (!response.ok) {
    return { ok: false, status: response.status, error: "Could not load SOP record" };
  }
  const sop = Array.isArray(payload) ? payload[0] : null;
  if (!sop) {
    return { ok: false, status: 404, error: "SOP not found" };
  }
  return { ok: true, data: sop };
}
__name(fetchSopRecord, "fetchSopRecord");
__name2(fetchSopRecord, "fetchSopRecord");
function canViewSop(role, visibility) {
  if (visibility === "all") {
    return true;
  }
  if (visibility === "manager") {
    return role === "manager" || role === "admin";
  }
  if (visibility === "admin") {
    return role === "admin";
  }
  return false;
}
__name(canViewSop, "canViewSop");
__name2(canViewSop, "canViewSop");
function selectSopSource(sop, defaultBucket) {
  const storagePath = normalizeStoragePath(sop.storage_path || "");
  if (storagePath) {
    return { ok: true, type: "storage", bucket: defaultBucket, path: stripBucketPrefix(storagePath, defaultBucket) };
  }
  const fileUrl = String(sop.file_url || "").trim();
  if (!fileUrl) {
    return { ok: false, error: "SOP has no file reference" };
  }
  if (/^https?:\/\//i.test(fileUrl)) {
    return { ok: true, type: "direct", url: fileUrl };
  }
  const path = stripBucketPrefix(normalizeStoragePath(fileUrl), defaultBucket);
  if (!path) {
    return { ok: false, error: "Invalid SOP storage path" };
  }
  return { ok: true, type: "storage", bucket: defaultBucket, path };
}
__name(selectSopSource, "selectSopSource");
__name2(selectSopSource, "selectSopSource");
function stripBucketPrefix(path, bucket) {
  const normalized = String(path || "").replace(/^\/+/, "");
  const prefix = `${bucket}/`;
  if (normalized.startsWith(prefix)) {
    return normalized.slice(prefix.length);
  }
  return normalized;
}
__name(stripBucketPrefix, "stripBucketPrefix");
__name2(stripBucketPrefix, "stripBucketPrefix");
async function createSignedDownloadUrl(input) {
  const path = normalizeStoragePath(input.path);
  const endpoint = `${input.supabaseUrl}/storage/v1/object/sign/${input.bucket}/${path}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`
    },
    body: JSON.stringify({ expiresIn: input.expiresIn })
  });
  const payload = await tryJson3(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: extractError3(payload) || `Could not create signed download URL (${response.status})`
    };
  }
  const relative = payload && payload.signedURL ? String(payload.signedURL) : "";
  if (!relative) {
    return { ok: false, status: 500, error: "No signed URL returned" };
  }
  return { ok: true, signedUrl: `${input.supabaseUrl}/storage/v1${relative}` };
}
__name(createSignedDownloadUrl, "createSignedDownloadUrl");
__name2(createSignedDownloadUrl, "createSignedDownloadUrl");
function normalizeStoragePath(value) {
  return String(value || "").trim().replace(/^\/+/, "").replace(/\.{2,}/g, "").replace(/\/+/g, "/");
}
__name(normalizeStoragePath, "normalizeStoragePath");
__name2(normalizeStoragePath, "normalizeStoragePath");
async function parseJson3(request) {
  try {
    return await request.json();
  } catch (_error) {
    return {};
  }
}
__name(parseJson3, "parseJson3");
__name2(parseJson3, "parseJson");
async function tryJson3(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}
__name(tryJson3, "tryJson3");
__name2(tryJson3, "tryJson");
function extractError3(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  return payload.error || payload.message || payload.msg || payload.error_description || "";
}
__name(extractError3, "extractError3");
__name2(extractError3, "extractError");
function json3(request, payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders3(request)
    }
  });
}
__name(json3, "json3");
__name2(json3, "json");
function corsHeaders3(request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type"
  };
}
__name(corsHeaders3, "corsHeaders3");
__name2(corsHeaders3, "corsHeaders");
async function onRequest8(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders4(context.request) });
  }
  if (context.request.method !== "POST") {
    return json4(context.request, { ok: false, error: "Method not allowed" }, 405);
  }
  return onRequestPost6(context);
}
__name(onRequest8, "onRequest8");
__name2(onRequest8, "onRequest");
async function onRequestPost6(context) {
  try {
    const env = readEnv4(context);
    const accessToken = readBearerToken4(context.request.headers.get("authorization"));
    if (!accessToken) {
      return json4(context.request, { ok: false, error: "Missing bearer token" }, 401);
    }
    const caller = await fetchCallerProfile2({
      supabaseUrl: env.supabaseUrl,
      anonOrServiceKey: env.anonOrServiceKey,
      serviceRoleKey: env.serviceRoleKey,
      accessToken
    });
    if (!caller.ok) {
      return json4(context.request, { ok: false, error: caller.error || "Invalid session" }, 401);
    }
    if (!isManagerOrAdmin(caller.profile.role)) {
      return json4(context.request, { ok: false, error: "Manager or admin role required" }, 403);
    }
    if (caller.profile.active === false) {
      return json4(context.request, { ok: false, error: "Inactive profile" }, 403);
    }
    const body = await parseJson4(context.request);
    const originalName = normalizeFilename(body.fileName || body.filename || "");
    const contentType = normalizeContentType(body.contentType || body.mimeType || "application/octet-stream");
    const upsert = Boolean(body.upsert);
    if (!originalName) {
      return json4(context.request, { ok: false, error: "fileName is required" }, 400);
    }
    const storagePath = buildStoragePath(originalName);
    const upload = await createSignedUploadUrl({
      supabaseUrl: env.supabaseUrl,
      serviceRoleKey: env.serviceRoleKey,
      bucket: env.bucket,
      path: storagePath,
      upsert
    });
    if (!upload.ok) {
      return json4(context.request, { ok: false, error: upload.error }, upload.status || 400);
    }
    return json4(context.request, {
      ok: true,
      bucket: env.bucket,
      path: storagePath,
      token: upload.token,
      signedUrl: upload.signedUrl,
      contentType,
      expiresInSeconds: 7200
    }, 200);
  } catch (error) {
    return json4(context.request, { ok: false, error: String(error) }, 500);
  }
}
__name(onRequestPost6, "onRequestPost6");
__name2(onRequestPost6, "onRequestPost");
function readEnv4(context) {
  const supabaseUrl = String(context.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(context.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = String(context.env.SUPABASE_ANON_KEY || "").trim();
  const bucket = String(context.env.SOPS_BUCKET || "staff-sops").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return {
    supabaseUrl,
    serviceRoleKey,
    anonOrServiceKey: anonKey || serviceRoleKey,
    bucket
  };
}
__name(readEnv4, "readEnv4");
__name2(readEnv4, "readEnv");
function readBearerToken4(authorization) {
  const value = String(authorization || "").trim();
  if (!value.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return value.slice(7).trim();
}
__name(readBearerToken4, "readBearerToken4");
__name2(readBearerToken4, "readBearerToken");
async function fetchCallerProfile2(input) {
  const userResponse = await fetch(`${input.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: input.anonOrServiceKey,
      authorization: `Bearer ${input.accessToken}`
    }
  });
  const userPayload = await tryJson4(userResponse);
  if (!userResponse.ok || !userPayload || !userPayload.id) {
    return { ok: false, error: "Invalid or expired session" };
  }
  const profileUrl = `${input.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userPayload.id)}&select=id,role,active&limit=1`;
  const profileResponse = await fetch(profileUrl, {
    method: "GET",
    headers: {
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`
    }
  });
  const profilePayload = await tryJson4(profileResponse);
  if (!profileResponse.ok) {
    return { ok: false, error: "Could not load caller profile" };
  }
  const profile = Array.isArray(profilePayload) ? profilePayload[0] : null;
  if (!profile || !profile.role) {
    return { ok: false, error: "Caller profile not found" };
  }
  return { ok: true, profile };
}
__name(fetchCallerProfile2, "fetchCallerProfile2");
__name2(fetchCallerProfile2, "fetchCallerProfile");
async function createSignedUploadUrl(input) {
  const path = normalizeStoragePath2(input.path);
  const endpoint = `${input.supabaseUrl}/storage/v1/object/upload/sign/${input.bucket}/${path}`;
  const headers = {
    "content-type": "application/json",
    apikey: input.serviceRoleKey,
    authorization: `Bearer ${input.serviceRoleKey}`
  };
  if (input.upsert) {
    headers["x-upsert"] = "true";
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: "{}"
  });
  const payload = await tryJson4(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: extractError4(payload) || `Could not create signed upload URL (${response.status})`
    };
  }
  const relativeUrl = payload && payload.url ? String(payload.url) : "";
  const signedUrl = relativeUrl ? `${input.supabaseUrl}/storage/v1${relativeUrl}` : "";
  let token = "";
  if (signedUrl) {
    try {
      const parsed = new URL(signedUrl);
      token = parsed.searchParams.get("token") || "";
    } catch (_error) {
      token = "";
    }
  }
  if (!token) {
    return { ok: false, status: 500, error: "No signed upload token returned" };
  }
  return { ok: true, signedUrl, token };
}
__name(createSignedUploadUrl, "createSignedUploadUrl");
__name2(createSignedUploadUrl, "createSignedUploadUrl");
function normalizeFilename(input) {
  const value = String(input || "").trim();
  if (!value) {
    return "";
  }
  const base = value.split("/").pop().split("\\").pop();
  const cleaned = base.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "").replace(/-+/g, "-").slice(0, 120);
  return cleaned;
}
__name(normalizeFilename, "normalizeFilename");
__name2(normalizeFilename, "normalizeFilename");
function normalizeContentType(value) {
  const input = String(value || "").trim().toLowerCase();
  if (!input) {
    return "application/octet-stream";
  }
  return input.slice(0, 120);
}
__name(normalizeContentType, "normalizeContentType");
__name2(normalizeContentType, "normalizeContentType");
function buildStoragePath(fileName) {
  const now = /* @__PURE__ */ new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${year}/${month}/${day}/${nonce}-${fileName}`;
}
__name(buildStoragePath, "buildStoragePath");
__name2(buildStoragePath, "buildStoragePath");
function normalizeStoragePath2(value) {
  return String(value || "").trim().replace(/^\/+/, "").replace(/\.{2,}/g, "").replace(/\/+/g, "/");
}
__name(normalizeStoragePath2, "normalizeStoragePath2");
__name2(normalizeStoragePath2, "normalizeStoragePath");
function isManagerOrAdmin(role) {
  return role === "manager" || role === "admin";
}
__name(isManagerOrAdmin, "isManagerOrAdmin");
__name2(isManagerOrAdmin, "isManagerOrAdmin");
async function parseJson4(request) {
  try {
    return await request.json();
  } catch (_error) {
    return {};
  }
}
__name(parseJson4, "parseJson4");
__name2(parseJson4, "parseJson");
async function tryJson4(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}
__name(tryJson4, "tryJson4");
__name2(tryJson4, "tryJson");
function extractError4(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  return payload.error || payload.message || payload.msg || payload.error_description || "";
}
__name(extractError4, "extractError4");
__name2(extractError4, "extractError");
function json4(request, payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders4(request)
    }
  });
}
__name(json4, "json4");
__name2(json4, "json");
function corsHeaders4(request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type"
  };
}
__name(corsHeaders4, "corsHeaders4");
__name2(corsHeaders4, "corsHeaders");
var routes = [
  {
    routePath: "/api/integrations/square/callback",
    mountPath: "/api/integrations/square",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/integrations/square/connect",
    mountPath: "/api/integrations/square",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/integrations/square/disconnect",
    mountPath: "/api/integrations/square",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/integrations/square/status",
    mountPath: "/api/integrations/square",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/integrations/square/sync-day",
    mountPath: "/api/integrations/square",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/integrations/square/callback",
    mountPath: "/api/integrations/square",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/integrations/square/connect",
    mountPath: "/api/integrations/square",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/api/integrations/square/disconnect",
    mountPath: "/api/integrations/square",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/api/integrations/square/status",
    mountPath: "/api/integrations/square",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/api/integrations/square/sync-day",
    mountPath: "/api/integrations/square",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/api/admin/invite",
    mountPath: "/api/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/sops/signed-download",
    mountPath: "/api/sops",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/sops/signed-upload",
    mountPath: "/api/sops",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/api/admin/invite",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/api/sops/signed-download",
    mountPath: "/api/sops",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  },
  {
    routePath: "/api/sops/signed-upload",
    mountPath: "/api/sops",
    method: "",
    middlewares: [],
    modules: [onRequest8]
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// ../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// ../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-N1kiov/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// ../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-N1kiov/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.74943165365907.js.map
