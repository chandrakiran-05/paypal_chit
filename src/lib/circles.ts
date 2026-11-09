import { Prisma, type CircleMode } from '@prisma/client';
import { db } from './db';

export type NewCircle = {
  name: string;
  mode: CircleMode;
  contributionAmount: string;
  currency: string;
  frequency: 'WEEKLY' | 'MONTHLY';
  commissionPercent: string;
  members: { name: string; email: string }[];
};

export function dueDateForRound(start: Date, round: number, frequency: NewCircle['frequency']) {
  const due = new Date(start);
  if (frequency === 'WEEKLY') due.setUTCDate(due.getUTCDate() + 7 * (round - 1));
  else due.setUTCMonth(due.getUTCMonth() + round - 1);
  return due;
}

export async function createCircle(input: NewCircle) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 7);
  return db.$transaction(async (tx) => {
    const circle = await tx.circle.create({
      data: {
        name: input.name, mode: input.mode,
        contributionAmount: new Prisma.Decimal(input.contributionAmount),
        currency: input.currency, frequency: input.frequency,
        commissionPercent: new Prisma.Decimal(input.commissionPercent),
        maxDiscountPercent: new Prisma.Decimal(30)
      }
    });
    const members = [];
    for (const [index, member] of input.members.entries()) {
      members.push(await tx.member.create({ data: {
        circleId: circle.id, name: member.name, email: member.email,
        payoutPosition: index + 1
      } }));
    }
    for (let index = 0; index < members.length; index++) {
      const round = await tx.round.create({ data: {
        circleId: circle.id, number: index + 1,
        dueDate: dueDateForRound(start, index + 1, input.frequency),
        winnerMemberId: input.mode === 'FIXED' ? members[index].id : null
      } });
      await tx.contribution.createMany({ data: members.map((member) => ({
        roundId: round.id, memberId: member.id
      })) });
    }
    return circle;
  });
}
