import { rpc, SmsError, twiml, verifiedForm } from './_transport.js';

export async function onRequestPost({ request, env }) {
  try {
    const form = await verifiedForm(request, env, '/api/demo/sms/status');
    const inboundMessageSid = new URL(request.url).searchParams.get('inboundMessageSid');
    const messageSid = form.get('MessageSid');
    const deliveryStatus = form.get('MessageStatus');
    const errorCode = form.get('ErrorCode') || null;
    if (!/^SM[0-9a-f]{32}$/i.test(inboundMessageSid || '') || !/^SM[0-9a-f]{32}$/i.test(messageSid || '') || !['queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'read'].includes(deliveryStatus) || (errorCode && !/^\d{1,8}$/.test(errorCode))) throw new SmsError('invalid_status', 400);
    if (form.get('From') && form.get('From') !== env.TWILIO_PHONE_NUMBER) throw new SmsError('wrong_sender', 403);
    const result = await rpc(env, { op: 'delivery', inboundMessageSid, messageSid, deliveryStatus, errorCode });
    return twiml('', '', result.ok ? 200 : 400);
  } catch (error) { return twiml('', '', error instanceof SmsError ? error.status : 503); }
}

export const onRequestGet = () => twiml('', '', 405);
