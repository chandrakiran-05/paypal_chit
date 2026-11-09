import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { appendLedger } from '@/lib/ledger';
import { createPayout, getPayout } from '@/lib/payouts';

export const runtime = 'nodejs';

async function finalize(roundId: string, reference: string, simulated: boolean, amount: string) {
  return db.$transaction(async (tx) => {
    const round = await tx.round.findUniqueOrThrow({ where: { id: roundId }, include: { circle: true } });
    if (round.status === 'PAID_OUT') return { status: 'PAID_OUT', reference, simulated };
    if (!round.winnerMemberId) throw new Error('Round has no winner.');
    const updated = await tx.round.updateMany({ where: { id: roundId, status: round.status }, data: { status: 'PAID_OUT', payoutReference: reference } });
    if (updated.count !== 1) throw new Error('Round changed during payout.');
    await tx.member.update({ where: { id: round.winnerMemberId }, data: { hasWon: true } });
    await tx.circle.update({ where: { id: round.circleId }, data: { currentRound: round.number + 1 } });
    await appendLedger(tx, round.circleId, 'PAYOUT', {
      roundId, roundNumber: round.number, winnerMemberId: round.winnerMemberId,
      amount, currency: round.circle.currency, reference, simulated
    });
    return { status: 'PAID_OUT', reference, simulated };
  });
}

export async function POST(request: NextRequest) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (process.env.NODE_ENV === 'production' && !adminToken) return NextResponse.json({ error: 'ADMIN_TOKEN is not configured.' }, { status: 503 });
  if (adminToken && request.headers.get('authorization') !== `Bearer ${adminToken}`) return NextResponse.json({ error: 'Organizer authorization required.' }, { status: 401 });
  try {
    const { roundId } = z.object({ roundId: z.string() }).parse(await request.json());
    const round = await db.round.findUnique({ where: { id: roundId }, include: {
      circle: { include: { _count: { select: { members: true } } } }, winner: true, contributions: true
    } });
    if (!round || round.number !== round.circle.currentRound) throw new Error('This is not the current round.');
    if (round.status === 'PAID_OUT') return NextResponse.json({ status: 'PAID_OUT', reference: round.payoutReference });
    if (round.circle.mode === 'BIDDING' && round.status !== 'CLOSED') throw new Error('Close bidding before payout.');
    if (round.contributions.length !== round.circle._count.members || round.contributions.some((item) => item.status !== 'PAID')) {
      throw new Error('All member contributions must be paid before payout.');
    }
    if (!round.winner) throw new Error('Round has no winner.');
    const pot = round.circle.contributionAmount.mul(round.circle._count.members);
    const amount = (round.circle.mode === 'BIDDING' ? round.winningBid : pot)?.toFixed(2);
    if (!amount) throw new Error('Winning amount is missing.');
    if (process.env.DEMO_MODE === 'true' && process.env.PAYPAL_ENV !== 'live') {
      const result = await finalize(round.id, `SIMULATED:${round.id}`, true, amount);
      return NextResponse.json(result);
    }
    let batchId = round.payoutReference;
    if (!batchId) {
      const batch = await createPayout(round.id, round.winner.email, amount, round.circle.currency);
      batchId = batch.batch_header.payout_batch_id;
      if (!batchId) throw new Error('PayPal did not return a payout batch ID.');
      await db.round.update({ where: { id: round.id }, data: { payoutReference: batchId } });
    }
    const current = await getPayout(batchId);
    const item = current.items?.find((entry) => entry.payout_item?.sender_item_id === round.id) ?? current.items?.[0];
    if (item?.transaction_status === 'SUCCESS') return NextResponse.json(await finalize(round.id, batchId, false, amount));
    if (['FAILED', 'RETURNED', 'BLOCKED', 'REVERSED'].includes(item?.transaction_status ?? '') ||
      ['DENIED', 'CANCELED'].includes(current.batch_header.batch_status)) throw new Error('PayPal payout failed; review the batch in PayPal before retrying.');
    return NextResponse.json({ status: 'PENDING', reference: batchId, message: 'PayPal is processing the payout. Check again shortly.' }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payout failed.' }, { status: 409 });
  }
}
