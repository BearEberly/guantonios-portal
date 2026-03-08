(function setupPublicPages() {
  const GPortal = window.GPortal;

  GPortal.initPublicSignup = function initPublicSignup() {
    const form = GPortal.qs("#signupForm");
    const status = GPortal.qs("#signupStatus");
    const endpoint = GPortal.qs("#appsScriptEndpoint");
    const phone = GPortal.qs("#phoneNumber");

    if (!form || !status || !endpoint) {
      return;
    }

    if (!window.SITE_CONFIG.enablePublicSignup) {
      GPortal.showNotice(status, "Public signup is disabled right now.");
      return;
    }

    endpoint.value = window.SITE_CONFIG.appsScriptUrl || "";
    if (window.SITE_CONFIG.appsScriptUrl) {
      form.setAttribute("action", window.SITE_CONFIG.appsScriptUrl);
    }

    phone?.addEventListener("input", function onPhoneInput() {
      phone.value = GPortal.formatPhoneUS(phone.value);
    });

    form.addEventListener("submit", function onSubmit() {
      if (!window.SITE_CONFIG.appsScriptUrl) {
        GPortal.showNotice(status, "Set appsScriptUrl in /js/config.js first.", "error");
        return;
      }
      GPortal.showNotice(status, "Submitting...");
    });

    const frame = GPortal.qs("#signup-submit-target");
    frame?.addEventListener("load", function onLoad() {
      GPortal.showNotice(status, "Submitted. Thanks.", "ok");
      form.reset();
    });
  };
})();
