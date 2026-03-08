import {
  corsHeaders,
  json,
  readEnv,
  requireAdminSession,
  getActiveSquareConnection
} from "./_shared.js";

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(context.request, "GET, OPTIONS") });
  }

  if (context.request.method !== "GET") {
    return json(context.request, { ok: false, error: "Method not allowed" }, 405, "GET, OPTIONS");
  }

  return onRequestGet(context);
}

export async function onRequestGet(context) {
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
