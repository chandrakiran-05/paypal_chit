import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const input = z.object({ roundId: z.string(), memberId: z.string(), amount: z.coerce.number().positive() }).parse(await request.json());
    const round = await db.round.findUnique({ where: { id: input.roundId }, include: { circle: { include: { _count: { select: { members: true } } } } } });
    const member = await db.member.findUnique({ where: { id: input.memberId } });
    if (!round || !member || round.circle.mode !== 'BIDDING' || round.status !== 'OPEN' || round.number !== round.circle.currentRound || member.circleId !== round.circleId || member.hasWon) {
      return NextResponse.json({ error: 'Member is not eligible for this bidding round.' }, { status: 409 });
    }
    const pot = round.circle.contributionAmount.mul(round.circle._count.members);
    const commission = pot.mul(round.circle.commissionPercent).div(100);
    const minimum = pot.mul(new Prisma.Decimal(100).minus(round.circle.maxDiscountPercent)).div(100);
    const bid = new Prisma.Decimal(input.amount);
    if (bid.lessThan(minimum) || bid.greaterThan(pot.minus(commission)) || bid.decimalPlaces() > 2) {
      return NextResponse.json({ error: `Bid must be between ${minimum.toFixed(2)} and ${pot.minus(commission).toFixed(2)}.` }, { status: 400 });
    }
    const saved = await db.bid.upsert({ where: { roundId_memberId: { roundId: round.id, memberId: member.id } }, create: { roundId: round.id, memberId: member.id, amount: bid }, update: { amount: bid } });
    return NextResponse.json({ bidId: saved.id, amount: saved.amount.toFixed(2) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid bid.' }, { status: 400 });
  }
}
