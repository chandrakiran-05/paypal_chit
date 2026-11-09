import { z } from 'zod';
import { db } from '@/lib/db';
import { aiConfigured, structuredDecision } from '@/lib/llm';
import { getPayPalOrder } from '@/lib/paypal';
import { appendLedger } from '@/lib/ledger';

const verdictSchema = z.object({
  verdict: z.enum(['paid', 'not_paid', 'inconclusive']),
  evidence: z.array(z.string().min(3).max(300)).min(1).max(8),
  reasoning: z.string().min(5).max(700)
});

export async function reviewDispute(input: { circleId: string; roundId: string; memberId: string; claim: string }) {
  const contribution = await db.contribution.findUnique({
    where: { roundId_memberId: { roundId: input.roundId, memberId: input.memberId } },
    include: { round: true, member: true }
  });
  if (!contribution || contribution.round.circleId !== input.circleId) throw new Error('Contribution not found in circle');
  const ledgerEntries = await db.ledgerEntry.findMany({
    where: { circleId: input.circleId, type: 'CONTRIBUTION' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  const matches = ledgerEntries.filter((entry) => {
    const payload = entry.payload as Record<string, unknown>;
    return payload.memberId === input.memberId && payload.roundId === input.roundId;
  });
  let paypalStatus: string | null = null;
  let paypalError: string | null = null;
  if (contribution.paypalOrderId) {
    try {
      const order = await getPayPalOrder(contribution.paypalOrderId);
      paypalStatus = String((order as { status?: unknown }).status ?? 'UNKNOWN');
    } catch (error) {
      paypalError = error instanceof Error ? error.message : 'PayPal lookup failed';
    }
  }
  const facts = {
    claim: input.claim, contributionStatus: contribution.status,
    paidAt: contribution.paidAt?.toISOString() ?? null,
    paypalOrderId: contribution.paypalOrderId,
    paypalStatus, paypalError,
    ledgerMatches: matches.map((entry) => ({ id: entry.id, hash: entry.hash, payload: entry.payload }))
  };
  const deterministic = contribution.status === 'PAID' || paypalStatus === 'COMPLETED'
    ? 'paid' as const
    : paypalError || contribution.paypalOrderId || matches.length
      ? 'inconclusive' as const
      : 'not_paid' as const;
  const decision = aiConfigured()
    ? await structuredDecision(verdictSchema,
      'You investigate a savings-circle payment claim. Return a cautious verdict with concrete evidence from the given records. A completed PayPal order or paid contribution is paid. A PayPal error, pending order or conflicting records is inconclusive. No order and no recorded payment is not_paid. Do not invent transaction IDs.',
      JSON.stringify(facts))
    : {
      verdict: deterministic,
      evidence: [
        `Contribution status: ${contribution.status}.`,
        `PayPal order: ${contribution.paypalOrderId ?? 'none'}; status: ${paypalStatus ?? paypalError ?? 'unavailable'}.`,
        `Matching ledger entries: ${matches.length}.`
      ],
      reasoning: 'Demo rule: verdict follows contribution, PayPal order status, and ledger evidence.'
    };
  // The model explains the evidence; authoritative records determine the verdict.
  const verdict = deterministic;
  await db.$transaction(async (tx) => {
    await tx.agentAction.create({ data: {
      circleId: input.circleId, agent: 'Dispute',
      decision: `${aiConfigured() ? 'AI-assisted' : 'Demo rule'} dispute for ${contribution.member.name}: ${verdict}. Evidence: ${decision.evidence.join(' ')}`,
      reasoning: decision.reasoning
    } });
    await appendLedger(tx, input.circleId, 'DISPUTE', {
      roundId: input.roundId, memberId: input.memberId, verdict,
      evidence: decision.evidence, paypalOrderId: contribution.paypalOrderId ?? null
    });
  });
  return { verdict, evidence: decision.evidence, reasoning: decision.reasoning, facts };
}
