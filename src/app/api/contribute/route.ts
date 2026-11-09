import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { contributionAmountDue, createPayPalOrder, getPayPalOrder } from '@/lib/paypal';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { contributionId } = z.object({ contributionId: z.string().min(1) }).parse(await request.json());
    const { contribution, amount, currency } = await contributionAmountDue(contributionId);
    if (contribution.status !== 'PENDING') return NextResponse.json({ error: 'Contribution is already paid.' }, { status: 409 });
    const circle = await db.circle.findUniqueOrThrow({ where: { id: contribution.round.circleId } });
    if (contribution.round.number !== circle.currentRound || contribution.round.status === 'PAID_OUT') {
      return NextResponse.json({ error: 'This round is not accepting contributions.' }, { status: 409 });
    }
    let order = contribution.paypalOrderId ? await getPayPalOrder(contribution.paypalOrderId).catch(() => null) : null;
    if (!order || !['CREATED', 'SAVED', 'APPROVED'].includes(order.status)) {
      const origin = process.env.APP_URL ?? request.nextUrl.origin;
      const returnUrl = new URL('/api/paypal/return', origin);
      returnUrl.searchParams.set('contributionId', contributionId);
      const cancelUrl = new URL(`/circle/${circle.id}`, origin);
      order = await createPayPalOrder(contributionId, amount, currency, returnUrl.toString(), cancelUrl.toString());
      await db.contribution.update({ where: { id: contributionId }, data: { paypalOrderId: order.id } });
    }
    const approvalUrl = order.links?.find((link) => link.rel === 'approve' || link.rel === 'payer-action')?.href;
    if (!approvalUrl) throw new Error('PayPal did not provide an approval URL.');
    return NextResponse.json({ orderId: order.id, approvalUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create payment.' }, { status: 400 });
  }
}
