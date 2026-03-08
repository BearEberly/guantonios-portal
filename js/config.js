window.SITE_CONFIG = Object.assign(
  {
    appsScriptUrl: "",
    supabaseUrl: "",
    supabaseAnonKey: "",
    oauthRedirectTo: `${window.location.origin}/app/dashboard.html`,
    enablePublicSignup: false,
    allowTemporaryLogins: true
  },
  window.SITE_CONFIG || {}
);

window.GPortalConfigReady = (async function loadRuntimeConfig() {
  try {
    const response = await fetch("/api/public-config", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (!payload || typeof payload !== "object") {
      return;
    }

    const nextConfig = {};
    if (typeof payload.appsScriptUrl === "string") {
      nextConfig.appsScriptUrl = payload.appsScriptUrl.trim();
    }
    if (typeof payload.supabaseUrl === "string") {
      nextConfig.supabaseUrl = payload.supabaseUrl.trim();
    }
    if (typeof payload.supabaseAnonKey === "string") {
      nextConfig.supabaseAnonKey = payload.supabaseAnonKey.trim();
    }
    if (typeof payload.oauthRedirectTo === "string") {
      nextConfig.oauthRedirectTo = payload.oauthRedirectTo.trim();
    }
    if (typeof payload.allowTemporaryLogins === "boolean") {
      nextConfig.allowTemporaryLogins = payload.allowTemporaryLogins;
    }

    Object.assign(window.SITE_CONFIG, nextConfig);
  } catch (_error) {
    // Keep static config fallback when the runtime endpoint is unavailable.
  }
})();
