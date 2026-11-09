import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
try {
  if (await db.circle.count() === 0) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/seed/seed.ts'], { stdio: 'inherit' });
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  }
} finally {
  await db.$disconnect();
}
