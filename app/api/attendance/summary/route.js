import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getSession } from '@/lib/auth';
import { ALL_DAYS, slotsForDay } from '@/lib/constants';

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

  // Tüm öğretmenleri ve programlarını çek
  const teacherIds = await redis.smembers('teachers');
  if (!teacherIds || teacherIds.length === 0) return NextResponse.json({});

  const teacherPipeline = redis.pipeline();
  teacherIds.forEach(id => {
    teacherPipeline.get(`teacher:${id}`);
    teacherPipeline.get(`program:${id}`);
  });
  const teacherResults = await teacherPipeline.exec();

  // Tüm öğrencileri çek
  const studentIds = await redis.smembers('students');
  const studentMap = {};
  if (studentIds && studentIds.length > 0) {
    const studentPipeline = redis.pipeline();
    studentIds.forEach(id => studentPipeline.get(`student:${id}`));
    const studentResults = await studentPipeline.exec();
    studentResults.forEach(s => { if (s) studentMap[s.id] = s; });
  }

  // cls → lessons map
  const clsMap = {};

  for (let i = 0; i < teacherIds.length; i++) {
    const teacher = teacherResults[i * 2];
    const program = teacherResults[i * 2 + 1];
    if (!teacher || !program) continue;

    const dayProg = program[String(dayIndex)];
    if (!dayProg) continue;

    // program'daki ders slotlarını sırayla tara, ders numarası ata
    const slots = slotsForDay(dayIndex);
    let lessonNo = 0;
    for (const slot of slots) {
      const entry = dayProg[slot.id];
      if (!entry || entry.type !== 'ders' || !entry.cls) continue;
      lessonNo++;
      const cls = entry.cls;

      // Yoklama verisini çek (kayıt yoksa lesson yine eklenir, boş listelerle)
      const attKey = `attendance:${date}:${teacher.id}:${cls}:${lessonNo}`;
      const att = await redis.get(attKey);

      const absent = [];
      const late = [];
      if (att) {
        for (const [studentId, status] of Object.entries(att)) {
          const s = studentMap[studentId];
          const info = {
            id: studentId,
            name: s?.name || studentId,
            phone: s?.phone || '',
            parentPhone: s?.parentPhone || '',
          };
          if (status === 'yok') absent.push(info);
          else if (status === 'gec') late.push(info);
        }
      }

      if (!clsMap[cls]) clsMap[cls] = { cls, lessons: [] };
      clsMap[cls].lessons.push({
        lessonNo,
        teacherId: teacher.id,
        teacherName: teacher.name,
        attendanceTaken: !!att,
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
