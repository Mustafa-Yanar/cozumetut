import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getSession } from '@/lib/auth';

// GET /api/attendance/student?studentId=...
// Bir öğrencinin tüm devamsızlık ve geç kalma kayıtlarını döner.
// Döndürür: { entries: [ { date, dayLabel, teacherId, teacherName, cls, lessonNo, status } ], summary: { yok, gec } }

const DAY_NAMES_TR = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];

export async function GET(req) {
  const session = await getSession();
  if (!session || (session.role !== 'director' && session.role !== 'teacher')) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId gerekli' }, { status: 400 });

  // Tüm attendance key'lerini tara
  let cursor = '0';
  const keys = [];
  do {
    const [next, found] = await redis.scan(cursor, { match: 'attendance:*', count: 200 });
    cursor = String(next);
    keys.push(...found);
  } while (cursor !== '0');

  if (keys.length === 0) {
    return NextResponse.json({ entries: [], summary: { yok: 0, gec: 0 } });
  }

  const pipeline = redis.pipeline();
  keys.forEach(k => pipeline.get(k));
  const results = await pipeline.exec();

  // Öğretmen adlarını topla
  const teacherIds = new Set();
  const matched = [];
  results.forEach((data, i) => {
    if (!data || typeof data !== 'object') return;
    const status = data[studentId];
    if (status !== 'yok' && status !== 'gec') return;
    // key parse: attendance:YYYY-MM-DD:teacherId:cls:lessonNo
    const parts = keys[i].split(':');
    if (parts.length !== 5) return;
    const [, date, teacherId, cls, lessonNo] = parts;
    teacherIds.add(teacherId);
    matched.push({ date, teacherId, cls, lessonNo: parseInt(lessonNo), status });
  });

  // Teacher isim lookup
  const teacherMap = {};
  if (teacherIds.size > 0) {
    const tPipeline = redis.pipeline();
    const ids = Array.from(teacherIds);
    ids.forEach(id => tPipeline.get(`teacher:${id}`));
    const tResults = await tPipeline.exec();
    ids.forEach((id, i) => {
      if (tResults[i]) teacherMap[id] = tResults[i];
    });
  }

  // Yapıyı zenginleştir + tarihe göre sırala (yeni → eski)
  const entries = matched.map(m => {
    const d = new Date(m.date);
    const teacher = teacherMap[m.teacherId];
    return {
      date: m.date,
      dayLabel: DAY_NAMES_TR[d.getDay()],
      teacherId: m.teacherId,
      teacherName: teacher?.name || m.teacherId,
      branch: teacher?.branch || '',
      cls: m.cls,
      lessonNo: m.lessonNo,
      status: m.status,
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.lessonNo - b.lessonNo);

  const summary = {
    yok: entries.filter(e => e.status === 'yok').length,
    gec: entries.filter(e => e.status === 'gec').length,
  };

  return NextResponse.json({ entries, summary });
}
