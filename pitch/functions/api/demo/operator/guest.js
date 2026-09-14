import { callOperatorGuestRpc, checkOrigin, json, operatorAllowed, readJson, requirePost } from '../_shared.js';

export const onRequestPost = async ({ request, env }) => {
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const originError = checkOrigin(request);
  if (originError) return originError;
  if (!operatorAllowed(request, env)) return json({ ok: false, error: 'operator_unauthorized' }, 401);
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid_json' }, 400);
  const result = await callOperatorGuestRpc(env, { ...body, operator: true });
  const status = result.ok ? 200 : result.error === 'operator_unauthorized' ? 401 : result.error === 'guest_profile_not_found' ? 404 : 400;
  return json(result, status);
};
