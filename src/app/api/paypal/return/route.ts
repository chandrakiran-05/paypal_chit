import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { capturePayPalOrder, recordPaidOrder } from '@/lib/paypal';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const contributionId = request.nextUrl.searchParams.get('contributionId');
  const orderId = request.nextUrl.searchParams.get('token');
  const contribution = contributionId ? await db.contribution.findUnique({ where: { id: contributionId }, include: { round: true } }) : null;
  if (!contribution || !orderId || contribution.paypalOrderId !== orderId) {
    return NextResponse.json({ error: 'Unknown payment return.' }, { status: 400 });
  }
  const destination = new URL(`/circle/${contribution.round.circleId}`, process.env.APP_URL ?? request.nextUrl.origin);
  try {
    if (contribution.status !== 'PAID') await capturePayPalOrder(orderId);
    await recordPaidOrder(orderId);
    destination.searchParams.set('payment', 'success');
  } catch (error) {
    console.error('PayPal capture failed', error);
    destination.searchParams.set('payment', 'pending');
  }
  return NextResponse.redirect(destination);
}
