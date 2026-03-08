(async function boot() {
  if (window.GPortalConfigReady && typeof window.GPortalConfigReady.then === "function") {
    await window.GPortalConfigReady;
  }

  const GPortal = window.GPortal;
  const page = document.body.getAttribute("data-page") || GPortal.pathPage();

  if (page !== "login") {
    await GPortal.initHeader();
  }
  GPortal.initPublicSignup();
  await GPortal.initLoginPage();

  const appContext = await GPortal.bootstrapAppPage();
  if (!appContext) {
    return;
  }

  await GPortal.loadPageData(appContext.session, appContext.profile);
})();
