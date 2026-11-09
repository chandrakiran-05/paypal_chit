import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { appendLedger } from '@/lib/ledger';
import { contributionAmountDue } from '@/lib/paypal';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (process.env.DEMO_MODE !== 'true' || process.env.PAYPAL_ENV === 'live') return NextResponse.json({ error: 'Demo payments are disabled.' }, { status: 403 });
  try {
    const { contributionId } = z.object({ contributionId: z.string() }).parse(await request.json());
    const { contribution, amount, currency } = await contributionAmountDue(contributionId);
    const circle = await db.circle.findUniqueOrThrow({ where: { id: contribution.round.circleId } });
    if (circle.currentRound !== contribution.round.number || contribution.round.status === 'PAID_OUT') throw new Error('This is not an active contribution.');
    return NextResponse.json(await db.$transaction(async (tx) => {
      const updated = await tx.contribution.updateMany({ where: { id: contributionId, status: 'PENDING' }, data: { status: 'PAID', paidAt: new Date() } });
      if (!updated.count) return { alreadyProcessed: true };
      await appendLedger(tx, circle.id, 'CONTRIBUTION', {
        roundId: contribution.roundId, roundNumber: contribution.round.number, memberId: contribution.memberId,
        amount, currency, simulated: true
      });
      return { alreadyProcessed: false, simulated: true };
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Demo payment failed.' }, { status: 409 });
  }
}
