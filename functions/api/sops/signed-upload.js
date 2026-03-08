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

    const caller = await fetchCallerProfile({
      supabaseUrl: env.supabaseUrl,
      anonOrServiceKey: env.anonOrServiceKey,
      serviceRoleKey: env.serviceRoleKey,
      accessToken
    });

    if (!caller.ok) {
      return json(context.request, { ok: false, error: caller.error || "Invalid session" }, 401);
    }

    if (!isManagerOrAdmin(caller.profile.role)) {
      return json(context.request, { ok: false, error: "Manager or admin role required" }, 403);
    }

    if (caller.profile.active === false) {
      return json(context.request, { ok: false, error: "Inactive profile" }, 403);
    }

    const body = await parseJson(context.request);
    const originalName = normalizeFilename(body.fileName || body.filename || "");
    const contentType = normalizeContentType(body.contentType || body.mimeType || "application/octet-stream");
    const upsert = Boolean(body.upsert);

    if (!originalName) {
      return json(context.request, { ok: false, error: "fileName is required" }, 400);
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
      return json(context.request, { ok: false, error: upload.error }, upload.status || 400);
    }

    return json(context.request, {
      ok: true,
      bucket: env.bucket,
      path: storagePath,
      token: upload.token,
      signedUrl: upload.signedUrl,
      contentType,
      expiresInSeconds: 7200
    }, 200);
  } catch (error) {
    return json(context.request, { ok: false, error: String(error) }, 500);
  }
}

function readEnv(context) {
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

function readBearerToken(authorization) {
  const value = String(authorization || "").trim();
  if (!value.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return value.slice(7).trim();
}

async function fetchCallerProfile(input) {
  const userResponse = await fetch(`${input.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: input.anonOrServiceKey,
      authorization: `Bearer ${input.accessToken}`
    }
  });

  const userPayload = await tryJson(userResponse);
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

  const profilePayload = await tryJson(profileResponse);
  if (!profileResponse.ok) {
    return { ok: false, error: "Could not load caller profile" };
  }

  const profile = Array.isArray(profilePayload) ? profilePayload[0] : null;
  if (!profile || !profile.role) {
    return { ok: false, error: "Caller profile not found" };
  }

  return { ok: true, profile };
}

async function createSignedUploadUrl(input) {
  const path = normalizeStoragePath(input.path);
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

  const payload = await tryJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: extractError(payload) || `Could not create signed upload URL (${response.status})`
    };
  }

  const relativeUrl = payload && payload.url ? String(payload.url) : "";
  const signedUrl = relativeUrl
    ? `${input.supabaseUrl}/storage/v1${relativeUrl}`
    : "";

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

function normalizeFilename(input) {
  const value = String(input || "").trim();
  if (!value) {
    return "";
  }

  const base = value.split("/").pop().split("\\").pop();
  const cleaned = base
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 120);

  return cleaned;
}

function normalizeContentType(value) {
  const input = String(value || "").trim().toLowerCase();
  if (!input) {
    return "application/octet-stream";
  }
  return input.slice(0, 120);
}

function buildStoragePath(fileName) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${year}/${month}/${day}/${nonce}-${fileName}`;
}

function normalizeStoragePath(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\.{2,}/g, "")
    .replace(/\/+/g, "/");
}

function isManagerOrAdmin(role) {
  return role === "manager" || role === "admin";
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
  return payload.error || payload.message || payload.msg || payload.error_description || "";
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
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type"
  };
}
