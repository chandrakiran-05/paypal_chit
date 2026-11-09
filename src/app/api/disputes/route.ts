import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { reviewDispute } from '@/agents/dispute';

export const runtime = 'nodejs';

const schema = z.object({
  circleId: z.string().min(1), roundId: z.string().min(1),
  memberId: z.string().min(1), claim: z.string().trim().min(3).max(1000)
});

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (process.env.NODE_ENV === 'production' && (!token || token !== process.env.ADMIN_TOKEN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid dispute request' }, { status: 400 });
  try {
    return NextResponse.json(await reviewDispute(parsed.data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Dispute review failed' }, { status: 502 });
  }
}
