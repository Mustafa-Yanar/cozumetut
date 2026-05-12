import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getSession } from '@/lib/auth';
import { getWeekKey, getMondayOfWeek, initWeekForTeacher } from '@/lib/slots';

async function advanceWeek(currentWeek) {
  const ids = await redis.smembers('teachers');
  if (!ids || ids.length === 0) return getWeekKey();

  const monday = getMondayOfWeek(currentWeek);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  const nextWeek = getWeekKey(nextMonday);

  for (const tid of ids) {
    const teacher = await redis.get(`teacher:${tid}`);
    if (!teacher) continue;
    await initWeekForTeacher(tid, nextWeek);
  }

  await redis.set('current_week', nextWeek);
  return nextWeek;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const stored = await redis.get('current_week');
  const weekKey = stored || getWeekKey();
  return NextResponse.json({ weekKey });
}

export async function POST(req) {
  const session = await getSession();
  if (!session || session.role !== 'director') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const { action, weekKey } = await req.json();

  if (action === 'advance') {
    const current = weekKey || getWeekKey();
    const next = await advanceWeek(current);
    return NextResponse.json({ ok: true, nextWeek: next });
  }

  return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 });
}
