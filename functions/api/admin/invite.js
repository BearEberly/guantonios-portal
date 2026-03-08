export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(context.request) });
  }

  if (context.request.method !== "POST") {
    return json(context.request, { ok: false, error: "Method not allowed" }, 405);
  }

  return onRequestPost(context);
}

export async function onRequestPost(context) {
  try {
    const env = readEnv(context);

    const accessToken = readBearerToken(context.request.headers.get("authorization"));
    if (!accessToken) {
      return json(context.request, { ok: false, error: "Missing bearer token" }, 401);
    }

    const caller = await fetchCallerUser(env.supabaseUrl, env.anonOrServiceKey, accessToken);
    if (!caller.ok) {
      return json(context.request, { ok: false, error: "Invalid or expired session" }, 401);
    }

    const callerRole = await fetchCallerRole(env.supabaseUrl, env.serviceRoleKey, caller.user.id);
    if (!callerRole.ok) {
      return json(context.request, { ok: false, error: callerRole.error }, 403);
    }

    if (callerRole.role !== "admin") {
      return json(context.request, { ok: false, error: "Admin role required" }, 403);
    }

    const body = await parseJson(context.request);
    const email = normalizeEmail(body.email);
    const fullName = normalizeString(body.fullName, 120);
    const role = normalizeRole(body.role);
    const station = normalizeString(body.station, 80);

    if (!email || !isValidEmail(email)) {
      return json(context.request, { ok: false, error: "Valid email is required" }, 400);
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
      return json(context.request, { ok: false, error: invite.error }, invite.status || 400);
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
        return json(context.request, {
          ok: true,
          warning: `Invite sent to ${email}, but profile upsert failed: ${upsert.error}`,
          invitedUserId
        }, 200);
      }
    }

    return json(context.request, {
      ok: true,
      message: `Invite sent to ${email}`,
      invitedUserId,
      role
    }, 200);
  } catch (error) {
    return json(context.request, { ok: false, error: String(error) }, 500);
  }
}

function readEnv(context) {
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

function readBearerToken(authorization) {
  const value = String(authorization || "").trim();
  if (!value.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return value.slice(7).trim();
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
    return { ok: false, error: "Could not validate caller role" };
  }

  const first = Array.isArray(payload) ? payload[0] : null;
  if (!first || !first.role) {
    return { ok: false, error: "Caller profile not found" };
  }

  return { ok: true, role: first.role };
}

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

  const payload = await tryJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: extractError(payload) || `Invite API request failed (${response.status})`
    };
  }

  return {
    ok: true,
    user: payload && payload.user ? payload.user : payload
  };
}

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
    const payload = await tryJson(response);
    return { ok: false, error: extractError(payload) || `Profile upsert failed (${response.status})` };
  }

  return { ok: true };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeRole(role) {
  const value = String(role || "employee").trim().toLowerCase();
  if (value === "admin" || value === "manager" || value === "employee") {
    return value;
  }
  return "employee";
}

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
      // ignore invalid URL and fall through to fallback.
    }
  }

  if (fallback) {
    return fallback;
  }

  return `${requestUrl.protocol}//${requestUrl.host}/app/reset.html`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch (_error) {
    return {};
  }
}

async function tryJson(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function extractError(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  return payload.msg || payload.message || payload.error_description || payload.error || "";
}

function json(request, payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request)
    }
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type"
  };
}
