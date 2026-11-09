import { PrismaClient } from '@prisma/client';
import { createCircle } from '../lib/circles';
import { appendLedger } from '../lib/ledger';

const db = new PrismaClient();
const names = [
  ['Maya Patel', 'maya@example.com'],
  ['Leo Chen', 'leo@example.com'],
  ['Amara Okafor', 'amara@example.com'],
  ['Sofia Ruiz', 'sofia@example.com'],
  ['Noah Brooks', 'noah@example.com'],
  ['Priya Shah', 'priya@example.com']
];
const members = names.map(([name, email]) => ({ name, email }));

async function seed() {
  await db.agentAction.deleteMany();
  await db.ledgerEntry.deleteMany();
  await db.bid.deleteMany();
  await db.contribution.deleteMany();
  await db.round.deleteMany();
  await db.member.deleteMany();
  await db.circle.deleteMany();

  const fixed = await createCircle({ name: 'The Sunday Circle', mode: 'FIXED', contributionAmount: '100.00', currency: 'USD', frequency: 'MONTHLY', commissionPercent: '0.00', members });
  const bidding = await createCircle({ name: 'Neighborhood Fund', mode: 'BIDDING', contributionAmount: '150.00', currency: 'USD', frequency: 'MONTHLY', commissionPercent: '2.00', members: members.map((member) => ({ ...member, email: member.email.replace('@', '+bid@') })) });
  for (const circle of [fixed, bidding]) {
    const records = await db.member.findMany({ where: { circleId: circle.id }, orderBy: { payoutPosition: 'asc' } });
    const previous = await db.round.findUniqueOrThrow({ where: { circleId_number: { circleId: circle.id, number: 1 } } });
    const previousDue = new Date(Date.now() - 34 * 86400000);
    await db.round.update({ where: { id: previous.id }, data: {
      dueDate: previousDue, status: 'PAID_OUT', winnerMemberId: records[0].id,
      winningBid: circle.mode === 'BIDDING' ? '720.00' : null
    } });
    await db.member.update({ where: { id: records[0].id }, data: { hasWon: true } });
    for (const [index, member] of records.entries()) {
      await db.contribution.update({ where: { roundId_memberId: { roundId: previous.id, memberId: member.id } }, data: {
        status: 'PAID', paidAt: new Date(previousDue.getTime() + (index === 4 ? 5 : -2) * 86400000)
      } });
    }
    await db.circle.update({ where: { id: circle.id }, data: { currentRound: 2 } });
    const current = await db.round.findUniqueOrThrow({ where: { circleId_number: { circleId: circle.id, number: 2 } } });
    await db.round.update({ where: { id: current.id }, data: { dueDate: new Date(Date.now() - 2 * 86400000) } });
    for (const member of records.slice(0, 3)) {
      await db.contribution.update({ where: { roundId_memberId: { roundId: current.id, memberId: member.id } }, data: { status: 'PAID', paidAt: new Date(Date.now() - 3 * 86400000) } });
    }
    await db.member.update({ where: { id: records[4].id }, data: { riskScore: 82, riskReason: 'The previous contribution arrived five days late.' } });
    await db.member.update({ where: { id: records[3].id }, data: { riskScore: 35, riskReason: 'Current contribution is past due.' } });
    await db.$transaction(async (tx) => {
      for (const member of records) {
        await appendLedger(tx, circle.id, 'CONTRIBUTION', {
          roundId: previous.id, roundNumber: 1, memberId: member.id,
          amount: circle.contributionAmount.toFixed(2), currency: circle.currency,
          demo: true
        });
      }
      if (circle.mode === 'BIDDING') {
        await appendLedger(tx, circle.id, 'COMMISSION', { roundId: previous.id, roundNumber: 1, amount: '18.00', currency: circle.currency, demo: true });
        for (const member of records.slice(1)) {
          await appendLedger(tx, circle.id, 'DIVIDEND', {
            roundId: previous.id, roundNumber: 1, memberId: member.id,
            creditRoundNumber: 2, amount: '32.40', currency: circle.currency, demo: true
          });
        }
      }
      await appendLedger(tx, circle.id, 'PAYOUT', {
        roundId: previous.id, roundNumber: 1, memberId: records[0].id,
        amount: circle.mode === 'BIDDING' ? '720.00' : (Number(circle.contributionAmount) * records.length).toFixed(2),
        currency: circle.currency, demo: true
      });
      for (const member of records.slice(0, 3)) {
        await appendLedger(tx, circle.id, 'CONTRIBUTION', {
          roundId: current.id, roundNumber: 2, memberId: member.id,
          amount: circle.mode === 'BIDDING' && member.id !== records[0].id
            ? '117.60' : circle.contributionAmount.toFixed(2), currency: circle.currency,
          demo: true
        });
      }
    });
  }
  console.log(`Seeded fixed circle ${fixed.id} and bidding circle ${bidding.id}`);
}

seed().finally(() => db.$disconnect());
