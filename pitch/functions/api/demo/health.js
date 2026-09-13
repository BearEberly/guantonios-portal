import { json, callDemoRpc } from './_shared.js';
import { readiness, rpc } from './sms/_transport.js';

export const onRequestGet = async ({ env }) => {
  const meta = await callDemoRpc(env, { op: 'meta' });
  const sms = readiness(env);
  let smsDatabaseReady = false;
  if (sms.database) {
    try { smsDatabaseReady = Boolean((await rpc(env, { op: 'health' })).ok); } catch { /* Report unavailable without leaking service details. */ }
  }
  return json({
    ok: Boolean(meta.ok), demo: true,
    smsEnabled: sms.enabled && smsDatabaseReady,
    smsDatabaseReady,
    targetHost: 'res.beareberly.com',
    release: env.CF_PAGES_COMMIT_SHA || 'local',
    backend: meta.ok ? 'ready' : meta.error
  });
};
