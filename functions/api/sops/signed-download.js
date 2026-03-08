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

    if (caller.profile.active === false) {
      return json(context.request, { ok: false, error: "Inactive profile" }, 403);
    }

    const body = await parseJson(context.request);
    const sopId = Number(body.sopId);
    if (!Number.isInteger(sopId) || sopId <= 0) {
      return json(context.request, { ok: false, error: "Valid sopId is required" }, 400);
    }

    const sop = await fetchSopRecord({
      supabaseUrl: env.supabaseUrl,
      serviceRoleKey: env.serviceRoleKey,
      sopId
    });

    if (!sop.ok) {
      return json(context.request, { ok: false, error: sop.error }, sop.status || 404);
    }

    if (!canViewSop(caller.profile.role, sop.data.visibility)) {
      return json(context.request, { ok: false, error: "Not authorized for this SOP" }, 403);
    }

    const source = selectSopSource(sop.data, env.bucket);
    if (!source.ok) {
      return json(context.request, { ok: false, error: source.error }, 400);
    }

    if (source.type === "direct") {
      return json(context.request, {
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
      return json(context.request, { ok: false, error: signed.error }, signed.status || 400);
    }

    return json(context.request, {
      ok: true,
      signedUrl: signed.signedUrl,
      expiresInSeconds: env.downloadTtl,
      title: sop.data.title
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

async function fetchSopRecord(input) {
  const endpoint = `${input.supabaseUrl}/rest/v1/sops?id=eq.${input.sopId}&select=id,title,visibility,file_url,storage_path&limit=1`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`
    }
  });

  const payload = await tryJson(response);
  if (!response.ok) {
    return { ok: false, status: response.status, error: "Could not load SOP record" };
  }

  const sop = Array.isArray(payload) ? payload[0] : null;
  if (!sop) {
    return { ok: false, status: 404, error: "SOP not found" };
  }

  return { ok: true, data: sop };
}

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

function stripBucketPrefix(path, bucket) {
  const normalized = String(path || "").replace(/^\/+/, "");
  const prefix = `${bucket}/`;
  if (normalized.startsWith(prefix)) {
    return normalized.slice(prefix.length);
  }
  return normalized;
}

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

  const payload = await tryJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: extractError(payload) || `Could not create signed download URL (${response.status})`
    };
  }

  const relative = payload && payload.signedURL ? String(payload.signedURL) : "";
  if (!relative) {
    return { ok: false, status: 500, error: "No signed URL returned" };
  }

  return { ok: true, signedUrl: `${input.supabaseUrl}/storage/v1${relative}` };
}

function normalizeStoragePath(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\.{2,}/g, "")
    .replace(/\/+/g, "/");
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
