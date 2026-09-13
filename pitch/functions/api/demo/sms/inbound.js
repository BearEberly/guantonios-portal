import { allowedPhone, publicOrigin, readiness, rpc, senderKey, SmsError, twiml, verifiedForm } from './_transport.js';
import { commandFor, FAILURE, planReply } from './_workflow.js';

export async function onRequestPost({ request, env }) {
  try {
    const form = await verifiedForm(request, env, '/api/demo/sms/inbound');
    const from = form.get('From') || '';
    const to = form.get('To') || '';
    const messageSid = form.get('MessageSid') || '';
    const body = form.get('Body') || '';
    if (!/^SM[0-9a-f]{32}$/i.test(messageSid) || body.length > 1600 || to !== env.TWILIO_PHONE_NUMBER) throw new SmsError('invalid_message', 400);
    if (env.DEMO_MODE !== 'true' || !allowedPhone(from, env)) return twiml();
    const command = commandFor(body, form.get('OptOutType'));
    const enabled = readiness(env).enabled;
    // Record opt-outs even while the carrier or AI gate is closed. No outbound
    // TwiML is emitted unless all gates pass. Twilio may handle keywords itself.
    if (!enabled && !command) return twiml();
    const identity = { senderKey: await senderKey(env, from, to), messageSid };
    const claim = await rpc(env, { op: 'claim', ...identity, body, ...(command ? { optOutType: command } : {}) });
    if (!claim.ok) throw new SmsError('claim_failed');
    if (claim.status === 'done' || claim.status === 'blocked' || claim.status === 'rate_limited') return twiml();
    if (claim.status === 'busy') return twiml('', '', 503);
    if (claim.status !== 'claimed' || !claim.leaseToken) throw new SmsError('invalid_claim');
    const lease = { ...identity, leaseToken: claim.leaseToken };
    let planned;
    try {
      if (Number(form.get('NumMedia') || 0) > 0 && !command) planned = { criteria: {}, replyText: 'Bear Eberly Photos reservation demo: please send your request as text. Images and attachments are not processed. STOP opts out.' };
      else if (body.length > 640 && !command) planned = { criteria: {}, replyText: 'Bear Eberly Photos reservation demo: please shorten your request to 640 characters or fewer. Include date, time with AM/PM, party size and seating. STOP opts out.' };
      else planned = await planReply({ body, command, state: claim.state || {}, env, action: (action, data) => rpc(env, { op: 'action', ...lease, action, data }) });
    } catch { planned = { criteria: {}, replyText: FAILURE }; }
    // Persist the final response before giving Twilio permission to send it.
    // Completed MessageSid retries return empty TwiML, avoiding duplicate sends.
    const finished = await rpc(env, { op: 'finish', ...lease, replyText: planned.replyText, ...(planned.criteria ? { criteria: planned.criteria } : {}), ...(planned.offerKind ? { offerKind: planned.offerKind } : {}) });
    if (!finished.ok || typeof finished.replyText !== 'string' || finished.replyText.length > 1600) return twiml('', '', 503);
    if (!enabled || form.get('OptOutType')) return twiml();
    const callback = `${publicOrigin(env)}/api/demo/sms/status?inboundMessageSid=${messageSid}`;
    return twiml(finished.replyText, callback);
  } catch (error) {
    return twiml('', '', error instanceof SmsError ? error.status : 503);
  }
}

export const onRequestGet = () => twiml('', '', 405);
