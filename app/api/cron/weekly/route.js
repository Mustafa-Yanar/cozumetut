import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getWeekKey, getMondayOfWeek, initWeekForTeacher } from '@/lib/slots';

// This runs every Sunday at 11:00 AM (configured in vercel.json)
export async function GET(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ids = await redis.smembers('teachers');
  if (!ids || ids.length === 0) return NextResponse.json({ ok: true, message: 'No teachers' });

  // Current stored week
  const stored = await redis.get('current_week');
  const currentWeek = stored || getWeekKey();

  // Compute next week
  const monday = getMondayOfWeek(currentWeek);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  const nextWeek = getWeekKey(nextMonday);

  // Initialize slots for all teachers in the next week
  for (const tid of ids) {
    const teacher = await redis.get(`teacher:${tid}`);
    if (!teacher) continue;
    await initWeekForTeacher(tid, nextWeek);
  }

  await redis.set('current_week', nextWeek);

  return NextResponse.json({ ok: true, previousWeek: currentWeek, newWeek: nextWeek });
}
