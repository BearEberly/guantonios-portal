import {
  corsHeaders,
  json,
  readEnv,
  requireAdminSession,
  getActiveSquareConnection,
  revokeSquareAccessToken,
  deactivateActiveSquareConnections
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

    const deactivated = await deactivateActiveSquareConnections(env, new Date().toISOString());
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
