import { z } from 'zod';
import { db } from '@/lib/db';
import { aiConfigured, structuredDecision } from '@/lib/llm';

const decisionSchema = z.object({
  members: z.array(z.object({
    memberId: z.string(), riskScore: z.number().int().min(0).max(100),
    reason: z.string().min(5).max(240)
  })),
  recommendedOrder: z.array(z.string()),
  reasoning: z.string().min(5).max(500)
});

export async function runRisk(circleId: string) {
  const circle = await db.circle.findUniqueOrThrow({ where: { id: circleId }, include: {
    members: { orderBy: { payoutPosition: 'asc' }, include: {
      contributions: { include: { round: true } }
    } }
  } });
  const now = Date.now();
  const facts = circle.members.map((member) => {
    const latePaid = member.contributions.filter((c) => c.paidAt && c.paidAt > c.round.dueDate).length;
    const overdueUnpaid = member.contributions.filter((c) => c.status !== 'PAID' && c.round.dueDate.getTime() < now && c.round.number <= circle.currentRound).length;
    return {
      memberId: member.id, name: member.name, currentScore: member.riskScore,
      latePaid, overdueUnpaid, hasWon: member.hasWon, payoutPosition: member.payoutPosition
    };
  });
  const defaultMembers = facts.map((fact) => ({
    memberId: fact.memberId,
    riskScore: Math.min(100, Math.max(fact.currentScore, 10 + fact.latePaid * 25 + fact.overdueUnpaid * 25)),
    reason: fact.latePaid || fact.overdueUnpaid
      ? `${fact.latePaid} late payment(s); ${fact.overdueUnpaid} overdue contribution(s).`
      : 'Payments are on time so far.'
  }));
  const defaultOrder = [...circle.members].sort((a, b) =>
    Number(b.hasWon) - Number(a.hasWon) ||
    defaultMembers.find((m) => m.memberId === a.id)!.riskScore - defaultMembers.find((m) => m.memberId === b.id)!.riskScore ||
    a.payoutPosition - b.payoutPosition
  ).map((m) => m.id);
  const decision = aiConfigured()
    ? await structuredDecision(decisionSchema,
      'You assess payment risk for a community savings circle. Base scores only on the supplied payment facts, 0 is low risk and 100 is high. Give a one-line reason per member. For fixed rotation, place members who already won first and higher-risk unpaid members later. Return every member ID exactly once in both arrays.',
      JSON.stringify({ mode: circle.mode, facts }))
    : { members: defaultMembers, recommendedOrder: defaultOrder, reasoning: 'Demo rule: late and overdue contributions increase risk; past winners retain completed slots.' };
  const actualIds = new Set(circle.members.map((m) => m.id));
  if (decision.members.length !== actualIds.size || new Set(decision.members.map((m) => m.memberId)).size !== actualIds.size || decision.members.some((m) => !actualIds.has(m.memberId))) {
    throw new Error('Risk decision did not cover every member exactly once');
  }
  let order = decision.recommendedOrder;
  if (order.length !== actualIds.size || new Set(order).size !== actualIds.size || order.some((id) => !actualIds.has(id))) {
    throw new Error('Risk payout order did not contain every member exactly once');
  }
  // Completed payouts are immutable; only the remaining rotation can move.
  const won = circle.members.filter((m) => m.hasWon).map((m) => m.id);
  order = [...won, ...order.filter((id) => !won.includes(id))];
  await db.$transaction(async (tx) => {
    for (const item of decision.members) await tx.member.update({ where: { id: item.memberId }, data: {
      riskScore: item.riskScore, riskReason: item.reason
    } });
    if (circle.mode === 'FIXED') {
      // Temporary negative positions prevent collisions on (circleId, payoutPosition).
      for (const member of circle.members) await tx.member.update({ where: { id: member.id }, data: { payoutPosition: -member.payoutPosition } });
      for (const [index, id] of order.entries()) await tx.member.update({ where: { id }, data: { payoutPosition: index + 1 } });
      const futureRounds = await tx.round.findMany({ where: {
        circleId, number: { gte: circle.currentRound }, status: { not: 'PAID_OUT' }
      }, orderBy: { number: 'asc' } });
      const remaining = order.filter((id) => !won.includes(id));
      for (const [index, round] of futureRounds.entries()) {
        await tx.round.update({ where: { id: round.id }, data: { winnerMemberId: remaining[index] ?? null } });
      }
    }
    await tx.agentAction.create({ data: {
      circleId, agent: 'Risk',
      decision: `${aiConfigured() ? 'AI' : 'Demo rule'} risk review: ${decision.members.map((m) => `${circle.members.find((member) => member.id === m.memberId)?.name} ${m.riskScore}`).join(', ')}${circle.mode === 'FIXED' ? '; rotation updated' : ''}`,
      reasoning: decision.reasoning
    } });
  });
  return { assessed: decision.members.length, reordered: circle.mode === 'FIXED', order };
}
