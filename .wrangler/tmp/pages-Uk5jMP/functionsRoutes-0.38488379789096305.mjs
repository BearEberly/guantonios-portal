import { onRequestGet as __api_integrations_square_callback_js_onRequestGet } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/integrations/square/callback.js"
import { onRequestPost as __api_integrations_square_connect_js_onRequestPost } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/integrations/square/connect.js"
import { onRequestPost as __api_integrations_square_disconnect_js_onRequestPost } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/integrations/square/disconnect.js"
import { onRequestGet as __api_integrations_square_status_js_onRequestGet } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/integrations/square/status.js"
import { onRequestPost as __api_integrations_square_sync_day_js_onRequestPost } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/integrations/square/sync-day.js"
import { onRequest as __api_integrations_square_callback_js_onRequest } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/integrations/square/callback.js"
import { onRequest as __api_integrations_square_connect_js_onRequest } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/integrations/square/connect.js"
import { onRequest as __api_integrations_square_disconnect_js_onRequest } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/integrations/square/disconnect.js"
import { onRequest as __api_integrations_square_status_js_onRequest } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/integrations/square/status.js"
import { onRequest as __api_integrations_square_sync_day_js_onRequest } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/integrations/square/sync-day.js"
import { onRequestPost as __api_admin_invite_js_onRequestPost } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/admin/invite.js"
import { onRequestPost as __api_sops_signed_download_js_onRequestPost } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/sops/signed-download.js"
import { onRequestPost as __api_sops_signed_upload_js_onRequestPost } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/sops/signed-upload.js"
import { onRequest as __api_admin_invite_js_onRequest } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/admin/invite.js"
import { onRequest as __api_sops_signed_download_js_onRequest } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/sops/signed-download.js"
import { onRequest as __api_sops_signed_upload_js_onRequest } from "/Users/beareberly/Desktop/Websites /Guantonios Portal/functions/api/sops/signed-upload.js"

export const routes = [
    {
      routePath: "/api/integrations/square/callback",
      mountPath: "/api/integrations/square",
      method: "GET",
      middlewares: [],
      modules: [__api_integrations_square_callback_js_onRequestGet],
    },
  {
      routePath: "/api/integrations/square/connect",
      mountPath: "/api/integrations/square",
      method: "POST",
      middlewares: [],
      modules: [__api_integrations_square_connect_js_onRequestPost],
    },
  {
      routePath: "/api/integrations/square/disconnect",
      mountPath: "/api/integrations/square",
      method: "POST",
      middlewares: [],
      modules: [__api_integrations_square_disconnect_js_onRequestPost],
    },
  {
      routePath: "/api/integrations/square/status",
      mountPath: "/api/integrations/square",
      method: "GET",
      middlewares: [],
      modules: [__api_integrations_square_status_js_onRequestGet],
    },
  {
      routePath: "/api/integrations/square/sync-day",
      mountPath: "/api/integrations/square",
      method: "POST",
      middlewares: [],
      modules: [__api_integrations_square_sync_day_js_onRequestPost],
    },
  {
      routePath: "/api/integrations/square/callback",
      mountPath: "/api/integrations/square",
      method: "",
      middlewares: [],
      modules: [__api_integrations_square_callback_js_onRequest],
    },
  {
      routePath: "/api/integrations/square/connect",
      mountPath: "/api/integrations/square",
      method: "",
      middlewares: [],
      modules: [__api_integrations_square_connect_js_onRequest],
    },
  {
      routePath: "/api/integrations/square/disconnect",
      mountPath: "/api/integrations/square",
      method: "",
      middlewares: [],
      modules: [__api_integrations_square_disconnect_js_onRequest],
    },
  {
      routePath: "/api/integrations/square/status",
      mountPath: "/api/integrations/square",
      method: "",
      middlewares: [],
      modules: [__api_integrations_square_status_js_onRequest],
    },
  {
      routePath: "/api/integrations/square/sync-day",
      mountPath: "/api/integrations/square",
      method: "",
      middlewares: [],
      modules: [__api_integrations_square_sync_day_js_onRequest],
    },
  {
      routePath: "/api/admin/invite",
      mountPath: "/api/admin",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_invite_js_onRequestPost],
    },
  {
      routePath: "/api/sops/signed-download",
      mountPath: "/api/sops",
      method: "POST",
      middlewares: [],
      modules: [__api_sops_signed_download_js_onRequestPost],
    },
  {
      routePath: "/api/sops/signed-upload",
      mountPath: "/api/sops",
      method: "POST",
      middlewares: [],
      modules: [__api_sops_signed_upload_js_onRequestPost],
    },
  {
      routePath: "/api/admin/invite",
      mountPath: "/api/admin",
      method: "",
      middlewares: [],
      modules: [__api_admin_invite_js_onRequest],
    },
  {
      routePath: "/api/sops/signed-download",
      mountPath: "/api/sops",
      method: "",
      middlewares: [],
      modules: [__api_sops_signed_download_js_onRequest],
    },
  {
      routePath: "/api/sops/signed-upload",
      mountPath: "/api/sops",
      method: "",
      middlewares: [],
      modules: [__api_sops_signed_upload_js_onRequest],
    },
  ]