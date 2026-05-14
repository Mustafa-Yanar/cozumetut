import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getSession } from '@/lib/auth';

// attendance:{YYYY-MM-DD}:{teacherId}:{cls}:{lessonNo}
// → { [studentId]: 'var' | 'gec' | 'yok' }

function attendanceKey(date, teacherId, cls, lessonNo) {
  return `attendance:${date}:${teacherId}:${cls}:${lessonNo}`;
}

export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const teacherId = searchParams.get('teacherId');
  const cls = searchParams.get('cls');
  const lessonNo = searchParams.get('lessonNo');

  if (!date || !teacherId || !cls || !lessonNo) {
    return NextResponse.json({ error: 'date, teacherId, cls ve lessonNo gerekli' }, { status: 400 });
  }

  const data = await redis.get(attendanceKey(date, teacherId, cls, lessonNo));
  return NextResponse.json(data || {});
}

export async function POST(req) {
  const session = await getSession();
  if (!session || session.role !== 'teacher') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const { date, cls, lessonNo, attendance } = await req.json();
  if (!date || !cls || !lessonNo || !attendance) {
    return NextResponse.json({ error: 'date, cls, lessonNo ve attendance gerekli' }, { status: 400 });
  }

  const key = attendanceKey(date, session.id, cls, lessonNo);
  await redis.set(key, attendance, { ex: 60 * 60 * 24 * 90 });
  return NextResponse.json({ ok: true });
}
