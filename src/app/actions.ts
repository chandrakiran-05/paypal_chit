'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createCircle } from '@/lib/circles';

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  mode: z.enum(['FIXED', 'BIDDING']),
  contributionAmount: z.coerce.number().positive().max(1000000),
  currency: z.literal('USD'),
  frequency: z.enum(['WEEKLY', 'MONTHLY']),
  commissionPercent: z.coerce.number().min(0).max(5),
  members: z.string()
});

export async function createCircleAction(form: FormData) {
  const raw = schema.parse(Object.fromEntries(form));
  const members = raw.members.split('\n').map((line) => {
    const [name, email] = line.split(',').map((part) => part.trim());
    return { name, email: email?.toLowerCase() };
  }).filter((member) => member.name || member.email);
  if (members.length < 2 || members.length > 20 || members.some((member) => !member.name || !z.string().email().safeParse(member.email).success)) {
    throw new Error('Enter 2–20 members, one per line, as Name, email@example.com.');
  }
  if (new Set(members.map((member) => member.email)).size !== members.length) {
    throw new Error('Member emails must be unique.');
  }
  const circle = await createCircle({
    ...raw, contributionAmount: raw.contributionAmount.toFixed(2),
    commissionPercent: raw.commissionPercent.toFixed(2), members
  });
  redirect(`/circle/${circle.id}`);
}
