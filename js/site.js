(function bootstrapSiteNamespace() {
  const GPortal = (window.GPortal = window.GPortal || {});
  const PARTIAL_VERSION = "20260308f";

  GPortal.qs = function qs(selector, root) {
    return (root || document).querySelector(selector);
  };

  GPortal.qsa = function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  };

  GPortal.pathPage = function pathPage() {
    const file = window.location.pathname.split("/").pop() || "index.html";
    return file.replace(".html", "");
  };

  GPortal.showNotice = function showNotice(el, text, tone) {
    if (!el) {
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.remove("notice--ok", "notice--error");
    if (tone === "ok") {
      el.classList.add("notice--ok");
    }
    if (tone === "error") {
      el.classList.add("notice--error");
    }
  };

  GPortal.money = function money(value) {
    const amount = Number(value);
    if (Number.isNaN(amount)) {
      return "-";
    }
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  };

  GPortal.dateTime = function dateTime(isoString) {
    if (!isoString) {
      return "-";
    }
    const d = new Date(isoString);
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  GPortal.dateOnly = function dateOnly(isoString) {
    if (!isoString) {
      return "-";
    }
    const d = new Date(isoString);
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  GPortal.formatPhoneUS = function formatPhoneUS(value) {
    const digits = String(value || "").replace(/\D+/g, "").slice(0, 10);
    if (digits.length < 4) {
      return digits;
    }
    if (digits.length < 7) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };
})();

(function setupSharedUi() {
  const GPortal = window.GPortal;
  const PARTIAL_VERSION = "20260308g";
  const HEADER_FALLBACK_HTML = `
<header class="site-header">
  <div class="container nav-wrap">
    <a class="brand" href="/index.html" aria-label="Guantonio's Home">
      <img class="brand__word" src="/assets/wordmark-top.png" alt="Guantonio's wordmark" />
    </a>

    <div class="header-actions">
      <button
        class="mobile-menu-toggle"
        id="mobileMenuToggle"
        type="button"
        aria-label="Open portal menu"
        aria-expanded="false"
      >
        <span class="mobile-menu-toggle__bars" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
        <span class="mobile-menu-toggle__text">Menu</span>
      </button>
      <div class="header-profile" id="headerProfileArea" hidden>
        <button class="header-profile__trigger" id="profileMenuBtn" type="button" aria-haspopup="menu" aria-expanded="false">
          <span class="header-profile__trigger-name" id="profileHeaderName">Bear</span>
          <span class="header-profile__avatar" id="profileAvatarBadge">
            <img class="header-profile__avatar-img" id="profileAvatarImg" alt="Profile photo" hidden />
            <span class="header-profile__avatar-text" id="profileInitial">B</span>
          </span>
        </button>
        <div class="header-profile__menu" id="profileMenu" role="menu" aria-label="Profile menu">
          <p class="header-profile__name" id="profileMenuName">Bear</p>
          <a href="/app/profile.html" role="menuitem">User Profile</a>
          <button id="headerLogoutBtn" type="button" role="menuitem">Log Out</button>
        </div>
      </div>
    </div>
  </div>
</header>
  `.trim();

  GPortal.mountPartial = async function mountPartial(targetSelector, partialPath) {
    const target = GPortal.qs(targetSelector);
    if (!target) {
      return;
    }

    const response = await fetch(partialPath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load partial: ${partialPath}`);
    }

    target.innerHTML = await response.text();
  };

  GPortal.initDropdown = function initDropdown() {
    const dropdown = GPortal.qs("#quickDropdown");
    const button = GPortal.qs("#quickBtn");
    if (!dropdown || !button) {
      return;
    }

    button.addEventListener("click", function onButtonClick() {
      const open = dropdown.classList.toggle("is-open");
      button.setAttribute("aria-expanded", open ? "true" : "false");
    });

    document.addEventListener("click", function onDocumentClick(event) {
      if (!dropdown.contains(event.target)) {
        dropdown.classList.remove("is-open");
        button.setAttribute("aria-expanded", "false");
      }
    });
  };

  GPortal.markPublicNav = function markPublicNav() {
    const page = GPortal.pathPage();
    const map = {
      index: "home",
      resources: "resources",
      login: "login"
    };

    const key = map[page] || "";
    if (!key) {
      return;
    }

    const link = GPortal.qs(`[data-public-nav=\"${key}\"]`);
    if (link) {
      link.setAttribute("aria-current", "page");
    }
  };

  GPortal.initHeader = async function initHeader() {
    const mountSelector = "#siteHeaderMount";
    const partialPath = `/partials/header.html?v=${PARTIAL_VERSION}`;
    const mount = GPortal.qs(mountSelector);
    if (!mount) {
      return;
    }

    try {
      await GPortal.mountPartial(mountSelector, partialPath);
    } catch (error) {
      console.warn("Header partial failed, using inline fallback.", error);
      mount.innerHTML = HEADER_FALLBACK_HTML;
    }
    GPortal.initDropdown();
    GPortal.markPublicNav();
  };
})();
