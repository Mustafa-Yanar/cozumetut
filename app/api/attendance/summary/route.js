import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getSession } from '@/lib/auth';

// GET ?date=YYYY-MM-DD
// Döndürür: { [cls]: { lessons: [ { lessonNo, teacherId, teacherName, absent: [{id,name}], late: [{id,name}] } ] } }

export async function GET(req) {
  const session = await getSession();
  if (!session || session.role !== 'director') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date gerekli' }, { status: 400 });

  // Tarihin gün indexini bul (0=Pzt ... 6=Paz)
  const d = new Date(date);
  const jsDay = d.getDay(); // 0=Pazar, 1=Pzt...
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;

  // Tüm öğretmenleri çek
  const teacherIds = await redis.smembers('teachers');
  if (!teacherIds || teacherIds.length === 0) return NextResponse.json({});

  const pipeline = redis.pipeline();
  teacherIds.forEach(id => {
    pipeline.get(`teacher:${id}`);
    pipeline.get(`lesson_schedule:${id}`);
  });
  const results = await pipeline.exec();

  // Tüm öğrencileri çek (isim lookup için)
  const studentIds = await redis.smembers('students');
  const studentPipeline = redis.pipeline();
  studentIds.forEach(id => pipeline.get(`student:${id}`));
  const studentResults = await studentPipeline.exec();
  const studentMap = {};
  studentResults.forEach(s => { if (s) studentMap[s.id] = s; });

  // cls → lessons map
  const clsMap = {};

  for (let i = 0; i < teacherIds.length; i++) {
    const teacher = results[i * 2];
    const schedule = results[i * 2 + 1];
    if (!teacher || !schedule) continue;

    const daySchedule = schedule[String(dayIndex)];
    if (!daySchedule) continue;

    const lessonCount = dayIndex >= 5 ? 8 : 6;
    for (let ln = 1; ln <= lessonCount; ln++) {
      const cls = daySchedule[String(ln)];
      if (!cls) continue;

      // Yoklama verisini çek
      const attKey = `attendance:${date}:${teacher.id}:${cls}:${ln}`;
      const att = await redis.get(attKey);
      if (!att) continue;

      const absent = [];
      const late = [];
      for (const [studentId, status] of Object.entries(att)) {
        if (status === 'yok') {
          const s = studentMap[studentId];
          absent.push({ id: studentId, name: s?.name || studentId });
        } else if (status === 'gec') {
          const s = studentMap[studentId];
          late.push({ id: studentId, name: s?.name || studentId });
        }
      }

      if (!clsMap[cls]) clsMap[cls] = { cls, lessons: [] };
      clsMap[cls].lessons.push({
        lessonNo: ln,
        teacherId: teacher.id,
        teacherName: teacher.name,
        absent,
        late,
      });
    }
  }

  // Dersleri lessonNo'ya göre sırala
  for (const cls of Object.keys(clsMap)) {
    clsMap[cls].lessons.sort((a, b) => a.lessonNo - b.lessonNo);
  }

  return NextResponse.json(clsMap);
}
