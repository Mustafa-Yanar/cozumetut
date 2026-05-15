import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getSession } from '@/lib/auth';

// GET /api/debug/attendance?date=2026-05-15
// Bu tarihteki tüm attendance key'lerini ve teacher program'ları döndürür
export async function GET(req) {
  const session = await getSession();
  if (!session || session.role !== 'director') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');

  const result = {
    date,
    attendanceKeys: [],
    teachers: [],
  };

  // 1) Tüm attendance key'lerini scan et
  let cursor = '0';
  do {
    const [next, found] = await redis.scan(cursor, { match: 'attendance:*', count: 200 });
    cursor = String(next);
    for (const k of found) {
      const val = await redis.get(k);
      result.attendanceKeys.push({ key: k, value: val });
    }
  } while (cursor !== '0');

  // 2) Tüm öğretmenleri ve program'larını çek
  const teacherIds = await redis.smembers('teachers');
  for (const tid of teacherIds || []) {
    const teacher = await redis.get(`teacher:${tid}`);
    const program = await redis.get(`program:${tid}`);
    result.teachers.push({ id: tid, name: teacher?.name, allowedGroups: teacher?.allowedGroups, program });
  }

  return NextResponse.json(result);
}
