import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { appendLedger } from '@/lib/ledger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (process.env.NODE_ENV === 'production' && !adminToken) return NextResponse.json({ error: 'ADMIN_TOKEN is not configured.' }, { status: 503 });
  if (adminToken && request.headers.get('authorization') !== `Bearer ${adminToken}`) return NextResponse.json({ error: 'Organizer authorization required.' }, { status: 401 });
  try {
    const result = await db.$transaction(async (tx) => {
      const round = await tx.round.findUnique({ where: { id: params.id }, include: { circle: true, bids: { orderBy: [{ amount: 'asc' }, { id: 'asc' }], include: { member: true } } } });
      if (!round || round.circle.mode !== 'BIDDING' || round.status !== 'OPEN' || round.number !== round.circle.currentRound) throw new Error('Round is not open for bidding.');
      const eligible = round.bids.find((bid) => !bid.member.hasWon && bid.member.circleId === round.circleId);
      if (!eligible) throw new Error('No eligible bids have been placed.');
      const memberCount = await tx.member.count({ where: { circleId: round.circleId } });
      const pot = round.circle.contributionAmount.mul(memberCount);
      const commission = pot.mul(round.circle.commissionPercent).div(100).toDecimalPlaces(2);
      const discount = pot.minus(eligible.amount);
      const dividend = discount.minus(commission);
      const minimum = pot.mul(new Prisma.Decimal(100).minus(round.circle.maxDiscountPercent)).div(100);
      if (eligible.amount.lessThan(minimum) || dividend.lessThan(0)) throw new Error('Winning bid is outside the allowed range.');
      const updated = await tx.round.updateMany({ where: { id: round.id, status: 'OPEN' }, data: { status: 'CLOSED', winnerMemberId: eligible.memberId, winningBid: eligible.amount } });
      if (updated.count !== 1) throw new Error('Round was already closed.');
      if (commission.greaterThan(0)) await appendLedger(tx, round.circleId, 'COMMISSION', { roundId: round.id, roundNumber: round.number, amount: commission.toFixed(2), currency: round.circle.currency });
      const others = await tx.member.findMany({ where: { circleId: round.circleId, id: { not: eligible.memberId } } });
      const each = others.length ? dividend.div(others.length).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN) : new Prisma.Decimal(0);
      let allocated = new Prisma.Decimal(0);
      for (const [index, member] of others.entries()) {
        const amount = index === others.length - 1 ? dividend.minus(allocated) : each;
        allocated = allocated.plus(amount);
        if (amount.greaterThan(0)) await appendLedger(tx, round.circleId, 'DIVIDEND', {
          roundId: round.id, roundNumber: round.number, memberId: member.id,
          creditRoundNumber: round.number + 1, amount: amount.toFixed(2), currency: round.circle.currency
        });
      }
      return { winnerMemberId: eligible.memberId, winningBid: eligible.amount.toFixed(2), commission: commission.toFixed(2), dividend: dividend.toFixed(2), perMember: each.toFixed(2) };
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not close round.' }, { status: 409 });
  }
}
