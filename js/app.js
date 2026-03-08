(function setupAppShell() {
  const GPortal = window.GPortal;
  const PARTIAL_VERSION = "20260308h";
  const APP_NAV_FALLBACK_HTML = `
<nav aria-label="Staff portal navigation">
  <div class="app-nav__top">
    <p class="app-nav__title">Portal Menu</p>
  </div>
  <a href="/app/staff.html" id="staffLink" data-app-nav="staff" hidden>Staff</a>
  <a href="/app/schedule.html" data-app-nav="schedule">Schedule</a>
  <a href="/app/tips.html" data-app-nav="tips">Tips</a>
  <a href="/app/menus.html" data-app-nav="menus">Menus</a>
  <a href="/app/training.html" data-app-nav="training">Training</a>
  <a href="/app/sops.html" data-app-nav="sops">SOPs</a>
  <a href="/app/requests.html" data-app-nav="requests">Requests</a>

  <button class="btn btn--primary" id="logoutBtn" type="button">Log Out</button>
</nav>
  `.trim();

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

  function isMobileNavViewport() {
    return window.matchMedia("(max-width: 820px)").matches;
  }

  function ensureMobileNavOverlay() {
    let overlay = GPortal.qs("#appNavOverlay");
    if (!overlay) {
      overlay = document.createElement("button");
      overlay.type = "button";
      overlay.id = "appNavOverlay";
      overlay.className = "app-nav-overlay";
      overlay.setAttribute("aria-label", "Close portal menu");
      overlay.hidden = true;
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function setMobileNavOpen(isOpen) {
    const body = document.body;
    const toggleBtn = GPortal.qs("#mobileMenuToggle");
    const overlay = ensureMobileNavOverlay();
    const open = Boolean(isOpen) && isMobileNavViewport();

    body.classList.toggle("app-nav-open", open);
    overlay.hidden = !open;

    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
      toggleBtn.setAttribute("aria-label", open ? "Close portal menu" : "Open portal menu");
    }
  }

  GPortal.initMobileAppNav = function initMobileAppNav() {
    const navMount = GPortal.qs("#appNavMount");
    const menuToggle = GPortal.qs("#mobileMenuToggle");
    if (!navMount || !menuToggle) {
      return;
    }

    function syncMenuToggleVisibility() {
      menuToggle.style.display = isMobileNavViewport() ? "inline-flex" : "";
    }

    const overlay = ensureMobileNavOverlay();
    const closeBtn = GPortal.qs("#appNavCloseBtn", navMount);
    const navLinks = GPortal.qsa("a[href]", navMount);

    if (!menuToggle.dataset.navBound) {
      menuToggle.addEventListener("click", function onMenuToggleClick() {
        const nextOpen = !document.body.classList.contains("app-nav-open");
        setMobileNavOpen(nextOpen);
      });
      menuToggle.dataset.navBound = "1";
    }

    if (!overlay.dataset.navBound) {
      overlay.addEventListener("click", function onOverlayClick() {
        setMobileNavOpen(false);
      });
      overlay.dataset.navBound = "1";
    }

    if (closeBtn && !closeBtn.dataset.navBound) {
      closeBtn.addEventListener("click", function onCloseClick() {
        setMobileNavOpen(false);
      });
      closeBtn.dataset.navBound = "1";
    }

    navLinks.forEach(function bindNavLink(link) {
      if (link.dataset.navCloseBound === "1") {
        return;
      }
      link.addEventListener("click", function onNavLinkClick() {
        setMobileNavOpen(false);
      });
      link.dataset.navCloseBound = "1";
    });

    if (!document.body.dataset.navEscBound) {
      document.addEventListener("keydown", function onEscKey(event) {
        if (event.key === "Escape") {
          setMobileNavOpen(false);
        }
      });
      document.body.dataset.navEscBound = "1";
    }

    if (!window.__gportalNavResizeBound) {
      window.addEventListener("resize", function onResize() {
        syncMenuToggleVisibility();
        if (!isMobileNavViewport()) {
          setMobileNavOpen(false);
        }
      });
      window.__gportalNavResizeBound = true;
    }

    syncMenuToggleVisibility();
    setMobileNavOpen(false);
  };

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
    const navSelector = "#appNavMount";
    const navPath = `/partials/app-nav.html?v=${PARTIAL_VERSION}`;
    const navMount = GPortal.qs(navSelector);
    if (!navMount) {
      return;
    }

    try {
      await GPortal.mountPartial(navSelector, navPath);
    } catch (error) {
      console.warn("App nav partial failed, using inline fallback.", error);
      navMount.innerHTML = APP_NAV_FALLBACK_HTML;
    }

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

    GPortal.initMobileAppNav();
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
