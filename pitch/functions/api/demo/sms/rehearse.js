import { json } from '../_shared.js';
import { interpretMessage } from './_ai.js';
import { commandFor } from './_workflow.js';
import { readBoundedBody, readiness, secretEqual, SmsError } from './_transport.js';

export async function onRequestGet({ request, env }) {
  if (!await secretEqual(request.headers.get('x-demo-operator-token'), env.DEMO_OPERATOR_TOKEN)) return json({ ok: false, error: 'operator_unauthorized' }, 401);
  return json({ ok: true, ...readiness(env), rehearsal: 'AI interpretation only; no database writes or SMS delivery' });
}

export async function onRequestPost({ request, env }) {
  if (!await secretEqual(request.headers.get('x-demo-operator-token'), env.DEMO_OPERATOR_TOKEN)) return json({ ok: false, error: 'operator_unauthorized' }, 401);
  if (env.DEMO_MODE !== 'true' || env.SMS_AI_REHEARSAL_ENABLED !== 'true') return json({ ok: false, error: 'rehearsal_disabled' }, 503);
  try {
    const input = JSON.parse(await readBoundedBody(request, 2048));
    if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 640) throw new SmsError('invalid_body', 400);
    const command = commandFor(input.body);
    const result = command ? { command, aiUsed: false } : { intent: await interpretMessage(input.body, {}, env), aiUsed: true };
    return json({ ok: true, demo: true, smsSent: false, bookingCreated: false, ...result });
  } catch (error) { return json({ ok: false, error: error instanceof SmsError ? error.code : 'rehearsal_failed', smsSent: false, bookingCreated: false }, error instanceof SmsError ? error.status : 503); }
}
