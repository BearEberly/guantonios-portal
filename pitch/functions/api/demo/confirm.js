import { callDemoRpc, callOperatorGuestRpc, checkOrigin, json, readJson, requirePost } from './_shared.js';

function mapConfirmStatus(error) {
  if (error === 'hold_expired_or_unauthorized' || error === 'slot_unavailable') return 409;
  if (error === 'unauthorized') return 401;
  if (error === 'demo_environment_missing') return 503;
  return 400;
}

export const onRequestPost = async ({ request, env }) => {
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const originError = checkOrigin(request);
  if (originError) return originError;
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid_json' }, 400);

  const result = await callDemoRpc(env, { ...body, op: 'confirm' });
  if (!result.ok || !result.reference) return json(result, mapConfirmStatus(result.error));

  const guestLabel = `${body.firstName || ''} ${body.lastName || ''}`.trim() || 'Demo Guest';
  const preferences = body.request ? [String(body.request).slice(0, 60)] : [];
  const profileResult = await callOperatorGuestRpc(env, {
    op: 'attach',
    operator: true,
    reference: result.reference,
    guestLabel,
    contact: body.mobile || body.email || '',
    preferences
  });

  return json({
    ...result,
    guestLabel: profileResult.profile?.guestLabel || result.guestLabel || guestLabel,
    guestProfileId: profileResult.profile?.id
  }, 200);
};
