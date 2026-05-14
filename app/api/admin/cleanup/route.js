import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getWeekKey, initWeekForTeacher } from '@/lib/slots';

const TOKEN = '9362b97bc126dac3f0c66f927939858a';

export async function POST(req) {
  const { token } = await req.json();
  if (token !== TOKEN) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const prefixes = ['slot:*', 'template:*', 'fixed:*', 'archive:*'];
  const deleted = {};

  for (const pattern of prefixes) {
    const prefix = pattern.replace('*', '');
    deleted[prefix] = 0;
    let cursor = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 200 });
      cursor = parseInt(nextCursor);
      if (keys.length > 0) {
        await redis.del(...keys);
        deleted[prefix] += keys.length;
      }
    } while (cursor !== 0);
  }

  // Bu haftayı program'dan yeniden init et
  const ids = await redis.smembers('teachers');
  const weekKey = getWeekKey();
  for (const tid of (ids || [])) {
    await initWeekForTeacher(tid, weekKey);
  }

  return NextResponse.json({ ok: true, deleted, weekKey, teachers: ids?.length || 0 });
}
