import { checkOrigin, callResetRpc, json, operatorAllowed, requirePost } from '../_shared.js';

export const onRequestPost = async ({ request, env }) => {
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const originError = checkOrigin(request);
  if (originError) return originError;
  if (!operatorAllowed(request, env)) return json({ ok: false, error: 'operator_unauthorized' }, 401);
  const result = await callResetRpc(env);
  return json(result, result.ok ? 200 : 400);
};
