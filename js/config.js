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
