export type Nudge = {
  circleId: string;
  circleName: string;
  memberId: string;
  memberName: string;
  email: string;
  amount: string;
  currency: string;
  dueDate: string;
  daysLate: number;
  tone: 'friendly' | 'firm';
  message: string;
};

export async function sendNudge(nudge: Nudge): Promise<'sent' | 'unconfigured'> {
  const url = process.env.ZAPIER_WEBHOOK_URL;
  if (!url) return 'unconfigured';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'contribution_nudge', ...nudge }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Zapier webhook failed (${response.status})`);
  return 'sent';
}
