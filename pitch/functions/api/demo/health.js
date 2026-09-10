import { json, callDemoRpc } from './_shared.js';
export const onRequestGet = async ({ env }) => {
  const meta = await callDemoRpc(env, { op: 'meta' });
  return json({ ok: Boolean(meta.ok), demo: true, smsEnabled: false, targetHost: 'res.beareberly.com', release: env.CF_PAGES_COMMIT_SHA || 'local', backend: meta.ok ? 'ready' : meta.error });
};
