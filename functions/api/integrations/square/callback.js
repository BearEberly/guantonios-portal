import {
  readEnv,
  redirect,
  getOauthStateRecord,
  deleteOauthStateRecord,
  exchangeSquareAuthCode,
  resolveOauthRedirectUri,
  resolveAdminRedirectUri,
  deactivateActiveSquareConnections,
  insertSquareConnection,
  normalizeString
} from "./_shared.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  return onRequestGet(context);
}

export async function onRequestGet(context) {
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

    const deactivated = await deactivateActiveSquareConnections(env, new Date().toISOString());
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
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
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

function normalizeScopes(scopes) {
  if (Array.isArray(scopes)) {
    return scopes.map(function mapScope(item) {
      return String(item || "").trim();
    }).filter(Boolean).join(" ");
  }
  return String(scopes || "").trim();
}

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
