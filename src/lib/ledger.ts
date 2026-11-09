import { createHash } from 'node:crypto';
import { Prisma, type LedgerType } from '@prisma/client';
import { db } from './db';

type Tx = Prisma.TransactionClient;
const GENESIS = 'GENESIS';

export function entryHash(prevHash: string, type: LedgerType, payload: unknown, createdAt: Date) {
  return createHash('sha256').update(prevHash + type + JSON.stringify(payload) + createdAt.toISOString()).digest('hex');
}

export async function appendLedger(tx: Tx, circleId: string, type: LedgerType, payload: Prisma.InputJsonValue) {
  const last = await tx.ledgerEntry.findFirst({ where: { circleId }, orderBy: { sequence: 'desc' } });
  const createdAt = new Date();
  const prevHash = last?.hash ?? GENESIS;
  return tx.ledgerEntry.create({ data: {
    circleId, type, payload, sequence: (last?.sequence ?? 0) + 1,
    prevHash, hash: entryHash(prevHash, type, payload, createdAt), createdAt
  } });
}

export async function verifyChain(circleId: string) {
  const entries = await db.ledgerEntry.findMany({ where: { circleId }, orderBy: { sequence: 'asc' } });
  let prevHash = GENESIS;
  for (const [index, entry] of entries.entries()) {
    if (entry.sequence !== index + 1 || entry.prevHash !== prevHash ||
      entry.hash !== entryHash(prevHash, entry.type, entry.payload, entry.createdAt)) {
      return { valid: false as const, checked: index, brokenEntry: entry };
    }
    prevHash = entry.hash;
  }
  return { valid: true as const, checked: entries.length, brokenEntry: null };
}
