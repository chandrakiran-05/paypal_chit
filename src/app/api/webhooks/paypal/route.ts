import { NextRequest, NextResponse } from 'next/server';
import { recordPaidOrder, verifyPayPalWebhook } from '@/lib/paypal';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let event: { event_type?: string; resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } };
  try { event = JSON.parse(await request.text()); }
  catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  try {
    if (!await verifyPayPalWebhook(request.headers, event)) return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      if (!orderId) return NextResponse.json({ error: 'Missing order ID.' }, { status: 400 });
      await recordPaidOrder(orderId);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('PayPal webhook failed', error);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}
