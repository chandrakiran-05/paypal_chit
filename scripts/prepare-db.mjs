import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db';
if (!databaseUrl.startsWith('file:')) {
  throw new Error('The current Prisma schema requires a SQLite file: DATABASE_URL.');
}
const target = databaseUrl.slice(5);
const path = isAbsolute(target) ? target : join(process.cwd(), 'prisma', target);
mkdirSync(dirname(path), { recursive: true });
closeSync(openSync(path, 'a'));
