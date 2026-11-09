import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runTreasurer } from '@/agents/treasurer';
import { runRisk } from '@/agents/risk';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (process.env.NODE_ENV === 'production' && (!token || ![process.env.ADMIN_TOKEN, process.env.CRON_SECRET].filter(Boolean).includes(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = z.object({ circleId: z.string().min(1).optional() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const cronAuthorized = Boolean(token && process.env.CRON_SECRET && token === process.env.CRON_SECRET);
  if (!parsed.data.circleId && !cronAuthorized) return NextResponse.json({ error: 'circleId is required' }, { status: 400 });
  const circles = await db.circle.findMany({
    where: parsed.data.circleId ? { id: parsed.data.circleId } : {}, select: { id: true }
  });
  if (!circles.length) return NextResponse.json({ error: 'Circle not found' }, { status: 404 });
  try {
    const results = [];
    for (const circle of circles) results.push({
      circleId: circle.id, treasurer: await runTreasurer(circle.id), risk: await runRisk(circle.id)
    });
    return NextResponse.json(parsed.data.circleId ? results[0] : { results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Agent run failed' }, { status: 502 });
  }
}
