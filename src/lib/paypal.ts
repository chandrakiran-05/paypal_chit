import { Prisma } from '@prisma/client';
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
import { db } from './db';
import { appendLedger } from './ledger';

const base = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

type PayPalOrder = {
  id: string; status: string;
  links?: { rel: string; href: string }[];
  purchase_units?: { amount?: { value: string; currency_code: string }; payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] } }[];
};

async function token() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('PayPal sandbox credentials are not configured.');
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials', cache: 'no-store'
  });
  if (!response.ok) throw new Error(`PayPal authentication failed (${response.status}).`);
  const data = await response.json() as { access_token: string };
  return data.access_token;
}

export async function paypalRequest<T>(path: string, method = 'GET', body?: unknown, requestId?: string): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store'
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`PayPal ${method} ${path} failed (${response.status}): ${detail}`);
  }
  return response.json() as Promise<T>;
}

export async function getPayPalOrder(orderId: string) {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (id && secret) {
    try {
      const toolkit = new PayPalAgentToolkit({ clientId: id, clientSecret: secret, configuration: {
        actions: { orders: { get: true } }, context: { sandbox: process.env.PAYPAL_ENV !== 'live' }
      } });
      const result = await toolkit.getTools().get_order.execute?.({ id: orderId }, { toolCallId: `get-${orderId}`, messages: [] });
      const candidate = typeof result === 'string' ? JSON.parse(result) : result;
      if (candidate && typeof candidate === 'object' && 'id' in candidate && 'status' in candidate) return candidate as PayPalOrder;
    } catch { /* The direct Orders API remains the source of truth if toolkit output differs. */ }
  }
  return paypalRequest<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

export async function createPayPalOrder(contributionId: string, amount: string, currency: string, returnUrl: string, cancelUrl: string) {
  return paypalRequest<PayPalOrder>('/v2/checkout/orders', 'POST', {
    intent: 'CAPTURE', purchase_units: [{ reference_id: contributionId, custom_id: contributionId, amount: { currency_code: currency, value: amount } }],
    application_context: { brand_name: 'Chit', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', return_url: returnUrl, cancel_url: cancelUrl }
  }, contributionId);
}

export async function capturePayPalOrder(orderId: string) {
  return paypalRequest<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, 'POST', {}, `capture-${orderId}`);
}

export async function verifyPayPalWebhook(headers: Headers, event: unknown) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID is missing.');
  const fields = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'];
  const values = fields.map((field) => headers.get(field));
  if (values.some((value) => !value)) return false;
  const result = await paypalRequest<{ verification_status: string }>('/v1/notifications/verify-webhook-signature', 'POST', {
    auth_algo: values[0], cert_url: values[1], transmission_id: values[2], transmission_sig: values[3], transmission_time: values[4],
    webhook_id: webhookId, webhook_event: event
  });
  return result.verification_status === 'SUCCESS';
}

export async function contributionAmountDue(contributionId: string) {
  const contribution = await db.contribution.findUnique({ where: { id: contributionId }, include: { round: { include: { circle: true } } } });
  if (!contribution) throw new Error('Contribution not found.');
  const circle = contribution.round.circle;
  const dividends = await db.ledgerEntry.findMany({ where: { circleId: circle.id, type: 'DIVIDEND' } });
  const credit = dividends.reduce((sum, entry) => {
    const item = entry.payload as { memberId?: string; creditRoundNumber?: number; amount?: string };
    return item.memberId === contribution.memberId && item.creditRoundNumber === contribution.round.number
      ? sum.plus(item.amount ?? '0') : sum;
  }, new Prisma.Decimal(0));
  const due = Prisma.Decimal.max(new Prisma.Decimal(0), circle.contributionAmount.minus(credit));
  return { contribution, amount: due.toFixed(2), currency: circle.currency };
}

export async function recordPaidOrder(orderId: string) {
  const order = await getPayPalOrder(orderId);
  const capture = order.purchase_units?.flatMap((unit) => unit.payments?.captures ?? []).find((item) => item.status === 'COMPLETED');
  if (order.status !== 'COMPLETED' || !capture) throw new Error('PayPal has not completed the capture.');
  const contribution = await db.contribution.findUnique({ where: { paypalOrderId: orderId }, include: { round: { include: { circle: true } } } });
  if (!contribution) throw new Error('Unknown PayPal order.');
  const expected = await contributionAmountDue(contribution.id);
  if (new Prisma.Decimal(capture.amount.value).comparedTo(expected.amount) !== 0 || capture.amount.currency_code !== expected.currency) {
    throw new Error('PayPal capture amount does not match the contribution.');
  }
  return db.$transaction(async (tx) => {
    const changed = await tx.contribution.updateMany({ where: { id: contribution.id, status: 'PENDING' }, data: { status: 'PAID', paidAt: new Date(), paypalCaptureId: capture.id } });
    if (changed.count === 0) return { alreadyProcessed: true };
    await appendLedger(tx, contribution.round.circleId, 'CONTRIBUTION', {
      roundId: contribution.roundId, roundNumber: contribution.round.number, memberId: contribution.memberId,
      amount: expected.amount, currency: expected.currency, paypalOrderId: orderId, paypalCaptureId: capture.id
    });
    return { alreadyProcessed: false };
  });
}
