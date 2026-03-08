(function setupAuth() {
  const GPortal = window.GPortal;

  const TEMP_SESSION_KEY = "gportal_temp_session";
  const TEMP_PROFILE_KEY_PREFIX = "gportal_temp_profile";
  const TEMP_PROFILE_LEGACY_KEY = "gportal_temp_profile";
  const TEMP_ACCOUNTS = {
    bear: {
      username: "bear",
      password: "1234",
      id: "temp-bear",
      role: "employee",
      full_name: "Bear",
      email: "bear@example.com"
    },
    admin: {
      username: "admin",
      password: "1234",
      id: "temp-admin",
      role: "admin",
      full_name: "Admin",
      email: "admin@example.com"
    }
  };

  function hasSupabaseRuntime() {
    return Boolean(window.supabase);
  }

  function hasConfig() {
    return Boolean(window.SITE_CONFIG.supabaseUrl && window.SITE_CONFIG.supabaseAnonKey);
  }

  function sanitizeAvatarUrl(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value || value === "null" || value === "undefined") {
      return "";
    }
    if (/^data:image\//i.test(value)) {
      return value;
    }
    return "";
  }

  function tempAccount(username) {
    const key = String(username || "").trim().toLowerCase();
    return TEMP_ACCOUNTS[key] || null;
  }

  function tempAccountFromLogin(loginValue) {
    const value = String(loginValue || "").trim().toLowerCase();
    if (!value) {
      return null;
    }

    const byUsername = tempAccount(value);
    if (byUsername) {
      return byUsername;
    }

    const accounts = Object.keys(TEMP_ACCOUNTS).map(function mapKey(key) {
      return TEMP_ACCOUNTS[key];
    });

    return accounts.find(function findByEmail(account) {
      return String(account.email || "").trim().toLowerCase() === value;
    }) || null;
  }

  function tempProfileKey(username) {
    return `${TEMP_PROFILE_KEY_PREFIX}_${String(username || "").trim().toLowerCase()}`;
  }

  function defaultTempProfile(username) {
    const account = tempAccount(username) || TEMP_ACCOUNTS.bear;
    return {
      id: account.id,
      full_name: account.full_name,
      role: account.role,
      email: account.email,
      phone: "",
      street_address: "",
      city: "",
      state: "",
      zip_code: "",
      address: "",
      avatar_url: "",
      is_temp: true
    };
  }

  function readTempSession() {
    try {
      const raw = window.sessionStorage.getItem(TEMP_SESSION_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.user || !parsed.isTemp) {
        return null;
      }

      const account = tempAccountFromLogin(parsed.temp_username || (parsed.user ? parsed.user.email : ""));
      if (!account) {
        return null;
      }

      parsed.temp_username = account.username;
      parsed.user.id = parsed.user.id || account.id;
      parsed.user.email = account.email;
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function ensureTempProfile(username) {
    const account = tempAccount(username);
    if (!account) {
      return;
    }

    const key = tempProfileKey(account.username);
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, JSON.stringify(defaultTempProfile(account.username)));
    }
  }

  function writeTempSession(username) {
    const account = tempAccount(username) || TEMP_ACCOUNTS.bear;
    const session = {
      access_token: `temp-${account.username}-token`,
      isTemp: true,
      temp_username: account.username,
      user: {
        id: account.id,
        email: account.email
      }
    };

    window.sessionStorage.setItem(TEMP_SESSION_KEY, JSON.stringify(session));
    ensureTempProfile(account.username);

    return session;
  }

  function clearTempSession() {
    window.sessionStorage.removeItem(TEMP_SESSION_KEY);
  }

  function resetTempProfileState() {
    window.sessionStorage.removeItem(TEMP_SESSION_KEY);
    window.localStorage.removeItem(TEMP_PROFILE_LEGACY_KEY);
    Object.keys(TEMP_ACCOUNTS).forEach(function removeProfile(username) {
      window.localStorage.removeItem(tempProfileKey(username));
    });
  }

  function maybeResetTempProfileFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (params.get("reset_profile") === "1") {
        resetTempProfileState();
      }
    } catch (_error) {
      // no-op
    }
  }

  function activeTempUsername() {
    const session = readTempSession();
    if (session && session.temp_username && tempAccount(session.temp_username)) {
      return session.temp_username;
    }
    if (session && session.user) {
      const account = tempAccountFromLogin(session.user.email);
      if (account) {
        return account.username;
      }
    }
    return "bear";
  }

  function readTempProfile(username) {
    try {
      const account = tempAccount(username) || TEMP_ACCOUNTS.bear;
      const key = tempProfileKey(account.username);
      let raw = window.localStorage.getItem(key);
      if (!raw && account.username === "bear") {
        raw = window.localStorage.getItem(TEMP_PROFILE_LEGACY_KEY);
      }
      if (!raw) {
        return defaultTempProfile(account.username);
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return defaultTempProfile(account.username);
      }

      const streetAddress = parsed.street_address || parsed.address || "";

      return {
        id: account.id,
        full_name: parsed.full_name || account.full_name,
        role: account.role,
        email: parsed.email || account.email,
        phone: parsed.phone || "",
        street_address: streetAddress,
        city: parsed.city || "",
        state: String(parsed.state || "").toUpperCase().slice(0, 2),
        zip_code: String(parsed.zip_code || parsed.zip || "").replace(/\D+/g, "").slice(0, 5),
        address: streetAddress,
        avatar_url: sanitizeAvatarUrl(parsed.avatar_url),
        is_temp: true
      };
    } catch (_error) {
      return defaultTempProfile(username);
    }
  }

  function writeTempProfile(nextProfile, username) {
    const account = tempAccount(username) || TEMP_ACCOUNTS.bear;
    const payload = {
      id: account.id,
      full_name: nextProfile.full_name || account.full_name,
      role: account.role,
      email: nextProfile.email || account.email,
      phone: nextProfile.phone || "",
      street_address: nextProfile.street_address || nextProfile.address || "",
      city: nextProfile.city || "",
      state: String(nextProfile.state || "").toUpperCase().slice(0, 2),
      zip_code: String(nextProfile.zip_code || "").replace(/\D+/g, "").slice(0, 5),
      address: nextProfile.street_address || nextProfile.address || "",
      avatar_url: sanitizeAvatarUrl(nextProfile.avatar_url)
    };

    window.localStorage.setItem(tempProfileKey(account.username), JSON.stringify(payload));
    if (account.username === "bear") {
      window.localStorage.setItem(TEMP_PROFILE_LEGACY_KEY, JSON.stringify(payload));
    }
    return payload;
  }

  GPortal.hasSupabaseConfig = function hasSupabaseConfig() {
    return hasSupabaseRuntime() && hasConfig();
  };

  GPortal.getSupabase = function getSupabase() {
    if (!hasSupabaseRuntime()) {
      throw new Error("Supabase script is not loaded.");
    }

    if (!hasConfig()) {
      throw new Error("Supabase URL/key missing in js/config.js.");
    }

    if (!GPortal._sb) {
      GPortal._sb = window.supabase.createClient(window.SITE_CONFIG.supabaseUrl, window.SITE_CONFIG.supabaseAnonKey);
    }

    return GPortal._sb;
  };

  GPortal.getTempSession = function getTempSession() {
    return readTempSession();
  };

  GPortal.getTempProfile = function getTempProfile() {
    return readTempProfile(activeTempUsername());
  };

  GPortal.saveTempProfile = function saveTempProfile(nextProfile) {
    return writeTempProfile(nextProfile, activeTempUsername());
  };

  GPortal.getSession = async function getSession() {
    const temp = readTempSession();
    if (temp) {
      return temp;
    }

    if (!GPortal.hasSupabaseConfig()) {
      return null;
    }

    const sb = GPortal.getSupabase();
    const result = await sb.auth.getSession();
    return result.data.session || null;
  };

  GPortal.requireAuth = async function requireAuth() {
    const session = await GPortal.getSession();
    if (!session) {
      window.location.href = "/app/login.html";
      return null;
    }
    return session;
  };

  GPortal.getProfile = async function getProfile(userId, session) {
    if (session && session.isTemp) {
      const account = tempAccountFromLogin(session.temp_username || (session.user ? session.user.email : "")) || TEMP_ACCOUNTS.bear;
      return readTempProfile(account.username) || defaultTempProfile(account.username);
    }

    if (!GPortal.hasSupabaseConfig()) {
      return {
        role: "employee",
        full_name: "",
        id: userId,
        email: "",
        phone: "",
        street_address: "",
        city: "",
        state: "",
        zip_code: "",
        address: "",
        avatar_url: ""
      };
    }

    const sb = GPortal.getSupabase();
    const query = await sb
      .from("profiles")
      .select("id,full_name,role,phone,street_address,city,state,zip_code,address,avatar_url")
      .eq("id", userId)
      .maybeSingle();

    if (query.error) {
      return {
        role: "employee",
        full_name: "",
        email: "",
        phone: "",
        street_address: "",
        city: "",
        state: "",
        zip_code: "",
        address: "",
        avatar_url: "",
        error: query.error
      };
    }

    return query.data || {
      role: "employee",
      full_name: "",
      email: "",
      phone: "",
      street_address: "",
      city: "",
      state: "",
      zip_code: "",
      address: "",
      avatar_url: ""
    };
  };

  GPortal.signOut = async function signOut() {
    clearTempSession();

    if (GPortal.hasSupabaseConfig()) {
      const sb = GPortal.getSupabase();
      await sb.auth.signOut();
    }
  };

  GPortal.initLoginPage = async function initLoginPage() {
    const page = document.body.getAttribute("data-page");
    if (page !== "login") {
      return;
    }

    maybeResetTempProfileFromUrl();

    const status = GPortal.qs("#loginStatus");
    const form = GPortal.qs("#loginForm");
    const email = GPortal.qs("#email");
    const password = GPortal.qs("#password");
    const googleLogin = GPortal.qs("#googleLogin");
    const appleLogin = GPortal.qs("#appleLogin");

    const existingSession = await GPortal.getSession();
    if (existingSession) {
      if (existingSession.isTemp) {
        const existingAccount = tempAccountFromLogin(existingSession.temp_username || (existingSession.user ? existingSession.user.email : "")) || TEMP_ACCOUNTS.bear;
        window.location.href = existingAccount.role === "admin" ? "/app/staff.html" : "/app/dashboard.html";
      } else {
        window.location.href = "/app/dashboard.html";
      }
      return;
    }

    const supabaseReady = GPortal.hasSupabaseConfig();
    const sb = supabaseReady ? GPortal.getSupabase() : null;

    if (!supabaseReady) {
      if (googleLogin) {
        googleLogin.disabled = true;
      }
      if (appleLogin) {
        appleLogin.disabled = true;
      }

      GPortal.showNotice(status, "Temporary logins enabled: bear/1234 (staff), admin/1234 (admin).", "ok");
    }

    googleLogin?.addEventListener("click", async function onGoogleClick() {
      if (!supabaseReady || !sb) {
        GPortal.showNotice(status, "Google login is unavailable in temporary preview mode.", "error");
        return;
      }

      GPortal.showNotice(status, "Redirecting to Google...", "ok");
      await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.SITE_CONFIG.oauthRedirectTo }
      });
    });

    appleLogin?.addEventListener("click", async function onAppleClick() {
      if (!supabaseReady || !sb) {
        GPortal.showNotice(status, "Apple login is unavailable in temporary preview mode.", "error");
        return;
      }

      GPortal.showNotice(status, "Redirecting to Apple...", "ok");
      await sb.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo: window.SITE_CONFIG.oauthRedirectTo }
      });
    });

    form?.addEventListener("submit", async function onLoginSubmit(event) {
      event.preventDefault();

      const loginValue = String(email.value || "").trim().toLowerCase();
      const passwordValue = String(password.value || "");
      const account = tempAccountFromLogin(loginValue);

      if (account && passwordValue === account.password) {
        writeTempSession(account.username);
        GPortal.showNotice(status, "Temporary login successful.", "ok");
        window.location.href = account.role === "admin" ? "/app/staff.html" : "/app/dashboard.html";
        return;
      }

      if (!supabaseReady || !sb) {
        GPortal.showNotice(status, "Invalid temporary login. Use bear/1234 or admin/1234.", "error");
        return;
      }

      if (!form.checkValidity()) {
        GPortal.showNotice(status, "Enter a valid login and password.", "error");
        return;
      }

      GPortal.showNotice(status, "Signing in...", "ok");

      const result = await sb.auth.signInWithPassword({
        email: email.value.trim(),
        password: password.value
      });

      if (result.error) {
        GPortal.showNotice(status, `Login failed: ${result.error.message}`, "error");
        return;
      }

      window.location.href = "/app/dashboard.html";
    });
  };
})();
