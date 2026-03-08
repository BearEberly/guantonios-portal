(function setupAppShell() {
  const GPortal = window.GPortal;

  function isProtectedPage(page) {
    const openPages = new Set(["login", "reset"]);
    return !openPages.has(page);
  }

  function profileDisplayName(session, profile) {
    if (profile && profile.full_name) {
      return profile.full_name.trim();
    }

    const email = session && session.user ? session.user.email : "";
    if (email && email.includes("@")) {
      return email.split("@")[0];
    }

    return email || "Staff";
  }

  function profileFirstName(session, profile) {
    const full = profileDisplayName(session, profile).trim();
    if (!full) {
      return "Staff";
    }
    return full.split(/\s+/)[0];
  }

  function profileInitial(session, profile) {
    const first = profileFirstName(session, profile);
    return first ? first.charAt(0).toUpperCase() : "S";
  }

  function normalizedAvatarUrl(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value || value === "null" || value === "undefined") {
      return "";
    }
    if (/^data:image\//i.test(value)) {
      return value;
    }
    return "";
  }

  GPortal.renderHeaderProfile = function renderHeaderProfile(session, profile) {
    const area = GPortal.qs("#headerProfileArea");
    if (!area) {
      return;
    }

    const displayName = profileDisplayName(session, profile);
    const firstName = profileFirstName(session, profile);
    const initial = profileInitial(session, profile);
    const avatarUrl = normalizedAvatarUrl(profile && profile.avatar_url ? profile.avatar_url : "");

    const trigger = GPortal.qs("#profileMenuBtn");
    const menu = GPortal.qs("#profileMenu");
    const menuName = GPortal.qs("#profileMenuName");
    const headerName = GPortal.qs("#profileHeaderName");
    const avatarText = GPortal.qs("#profileInitial");
    const avatarImg = GPortal.qs("#profileAvatarImg");
    const avatarBadge = GPortal.qs("#profileAvatarBadge");

    area.hidden = false;

    if (headerName) {
      headerName.textContent = displayName;
      headerName.title = displayName;
    }

    if (menuName) {
      menuName.textContent = displayName;
    }

    if (avatarText) {
      avatarText.textContent = initial;
    }

    if (avatarBadge) {
      avatarBadge.setAttribute("aria-label", `${firstName} profile`);
    }

    if (avatarImg && avatarText) {
      if (avatarUrl) {
        avatarImg.hidden = true;
        avatarText.hidden = false;
        avatarImg.onerror = function onAvatarError() {
          avatarImg.hidden = true;
          avatarImg.removeAttribute("src");
          avatarText.hidden = false;
        };
        avatarImg.onload = function onAvatarLoad() {
          avatarImg.hidden = false;
          avatarText.hidden = true;
        };
        avatarImg.src = avatarUrl;
      } else {
        avatarImg.hidden = true;
        avatarImg.removeAttribute("src");
        avatarText.hidden = false;
      }
    }

    if (!area.dataset.bound && trigger && menu) {
      trigger.addEventListener("click", function onProfileMenuClick() {
        const open = area.classList.toggle("is-open");
        trigger.setAttribute("aria-expanded", open ? "true" : "false");
      });

      document.addEventListener("click", function onDocClick(event) {
        if (!area.contains(event.target)) {
          area.classList.remove("is-open");
          trigger.setAttribute("aria-expanded", "false");
        }
      });

      GPortal.qs("#headerLogoutBtn")?.addEventListener("click", async function onHeaderLogout() {
        await GPortal.signOut();
        window.location.href = "/app/login.html";
      });

      area.dataset.bound = "1";
    }
  };

  GPortal.initAppLayout = async function initAppLayout(session, profile) {
    await GPortal.mountPartial("#appNavMount", "/partials/app-nav.html");

    const page = document.body.getAttribute("data-page") || GPortal.pathPage();
    const isAdmin = profile.role === "admin";
    const isManagement = profile.role === "manager" || profile.role === "admin";

    if (page === "dashboard" && isAdmin) {
      window.location.href = "/app/staff.html";
      return;
    }

    if (page === "staff" && !isManagement) {
      window.location.href = "/app/dashboard.html";
      return;
    }

    const active = GPortal.qs(`[data-app-nav=\"${page}\"]`, GPortal.qs("#appNavMount"));
    if (active) {
      active.setAttribute("aria-current", "page");
    }

    const staffLink = GPortal.qs("#staffLink");
    if (staffLink) {
      staffLink.hidden = !isManagement;
    }

    GPortal.qs("#logoutBtn")?.addEventListener("click", async function onLogoutClick() {
      await GPortal.signOut();
      window.location.href = "/app/login.html";
    });

    GPortal.renderHeaderProfile(session, profile);

    const whoami = GPortal.qs("#whoami");
    if (whoami) {
      const displayName = profileDisplayName(session, profile);
      whoami.textContent = `Signed in as ${displayName} (${profile.role || "employee"})`;
    }
  };

  GPortal.bootstrapAppPage = async function bootstrapAppPage() {
    const page = document.body.getAttribute("data-page") || GPortal.pathPage();

    if (!isProtectedPage(page)) {
      return null;
    }

    const session = await GPortal.requireAuth();
    if (!session) {
      return null;
    }

    const profile = await GPortal.getProfile(session.user.id, session);
    const isAppShellPage = window.location.pathname.startsWith("/app/");
    if (isAppShellPage) {
      await GPortal.initAppLayout(session, profile);
    }

    return { session, profile };
  };
})();
