import { callNotifyRpc, checkOrigin, json, readJson, requirePost } from './_shared.js';

export const onRequestPost = async ({ request, env }) => {
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const originError = checkOrigin(request);
  if (originError) return originError;
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid_json' }, 400);
  const result = await callNotifyRpc(env, body);
  const conflictErrors = ['invalid_notify_request', 'closed', 'outside_service'];
  const status = result.ok ? 200 : result.error === 'unauthorized' ? 401 : result.error === 'demo_environment_missing' ? 503 : conflictErrors.includes(result.error) ? 409 : 400;
  return json(result, status);
};
