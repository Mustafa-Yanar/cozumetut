import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

const TOKEN = 'a7f3d92e1b84c056';

export async function POST(req) {
  const { token } = await req.json();
  if (token !== TOKEN) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Silinecek pattern'ler: slot, template, fixed, archive, program
  const patterns = ['slot:*', 'template:*', 'fixed:*', 'archive:*', 'program:*'];
  const deleted = {};

  for (const pattern of patterns) {
    const key = pattern.replace(':*', ':');
    deleted[key] = 0;
    let cursor = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 500 });
      cursor = parseInt(nextCursor);
      if (keys.length > 0) {
        await redis.del(...keys);
        deleted[key] += keys.length;
      }
    } while (cursor !== 0);
  }

  return NextResponse.json({ ok: true, deleted });
}
