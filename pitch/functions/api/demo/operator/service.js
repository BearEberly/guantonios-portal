import { callOperatorServiceRpc, checkOrigin, json, operatorAllowed, readJson, requirePost } from '../_shared.js';

export const onRequestPost = async ({ request, env }) => {
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const originError = checkOrigin(request);
  if (originError) return originError;
  if (!operatorAllowed(request, env)) return json({ ok: false, error: 'operator_unauthorized' }, 401);
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid_json' }, 400);
  const result = await callOperatorServiceRpc(env, { ...body, operator: true });
  const conflictErrors = ['invalid_service_stage', 'service_stage_unavailable'];
  const status = result.ok ? 200 : result.error === 'operator_unauthorized' ? 401 : result.error === 'not_found' ? 404 : conflictErrors.includes(result.error) ? 409 : 400;
  return json(result, status);
};
