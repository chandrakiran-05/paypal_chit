import { z } from 'zod';
import { db } from '@/lib/db';
import { aiConfigured, structuredDecision } from '@/lib/llm';
import { sendNudge } from '@/lib/zapier';

const draftSchema = z.object({
  tone: z.enum(['friendly', 'firm']),
  message: z.string().min(10).max(800),
  reasoning: z.string().min(5).max(500)
});

export async function runTreasurer(circleId: string) {
  const circle = await db.circle.findUniqueOrThrow({ where: { id: circleId } });
  const round = await db.round.findUnique({
    where: { circleId_number: { circleId, number: circle.currentRound } },
    include: { contributions: { include: { member: true } } }
  });
  if (!round || round.dueDate >= new Date() || round.status === 'PAID_OUT') return { considered: 0, sent: 0, drafted: 0, failed: 0 };
  const unpaid = round.contributions.filter((item) => item.status !== 'PAID');
  const daysLate = Math.max(1, Math.floor((Date.now() - round.dueDate.getTime()) / 86400000));
  let sent = 0;
  let drafted = 0;
  let failed = 0;
  for (const contribution of unpaid) {
    const recent = await db.agentAction.findFirst({ where: {
      circleId, agent: 'Treasurer', decision: { startsWith: `nudge:${contribution.memberId}:` },
      createdAt: { gte: new Date(Date.now() - 20 * 60 * 60 * 1000) }
    } });
    if (recent) continue;
    const member = contribution.member;
    const amount = circle.contributionAmount.toFixed(2);
    const draft = aiConfigured()
      ? await structuredDecision(draftSchema,
        'You are the treasurer of a mutual savings circle. Write a respectful, concise payment reminder. Never threaten or shame. Use a firm tone only when payment is at least 4 days late. Return only the requested structured output.',
        JSON.stringify({ circle: circle.name, member: member.name, amount, currency: circle.currency, daysLate, dueDate: round.dueDate.toISOString() }))
      : {
        tone: (daysLate >= 4 ? 'firm' : 'friendly') as 'firm' | 'friendly',
        message: daysLate >= 4
          ? `Hi ${member.name}, your ${circle.currency} ${amount} contribution to ${circle.name} is ${daysLate} days overdue. Please complete it when you can, or reply if you need help.`
          : `Hi ${member.name}, a quick reminder that your ${circle.currency} ${amount} contribution to ${circle.name} was due ${daysLate} ${daysLate === 1 ? 'day' : 'days'} ago. Thanks for keeping our circle moving!`,
        reasoning: `Demo rule: ${daysLate} day(s) late; ${daysLate >= 4 ? 'firm' : 'friendly'} tone.`
      };
    let delivery: 'sent' | 'unconfigured' | 'failed';
    let deliveryError = '';
    try {
      delivery = await sendNudge({
        circleId, circleName: circle.name, memberId: member.id, memberName: member.name,
        email: member.email, amount, currency: circle.currency,
        dueDate: round.dueDate.toISOString(), daysLate,
        tone: draft.tone, message: draft.message
      });
    } catch (error) {
      delivery = 'failed';
      deliveryError = error instanceof Error ? error.message : 'Unknown webhook error';
    }
    await db.agentAction.create({ data: {
      circleId, agent: 'Treasurer', decision: `nudge:${member.id}:${delivery}:${draft.tone}: ${draft.message}`,
      reasoning: `${aiConfigured() ? 'AI' : 'Demo rule'}: ${draft.reasoning} Delivery: ${delivery}${deliveryError ? ` (${deliveryError})` : ''}.`
    } });
    if (delivery === 'sent') sent++;
    else if (delivery === 'unconfigured') drafted++;
    else failed++;
  }
  return { considered: unpaid.length, sent, drafted, failed };
}
