import {
  corsHeaders,
  json,
  parseJson,
  readEnv,
  requireAdminSession,
  normalizeString,
  createOauthStateRecord,
  resolveOauthRedirectUri,
  buildSquareAuthorizeUrl
} from "./_shared.js";

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(context.request, "POST, OPTIONS") });
  }

  if (context.request.method !== "POST") {
    return json(context.request, { ok: false, error: "Method not allowed" }, 405, "POST, OPTIONS");
  }

  return onRequestPost(context);
}

export async function onRequestPost(context) {
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
