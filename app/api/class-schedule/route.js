import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getSession } from '@/lib/auth';
import { ALL_DAYS, slotsForDay } from '@/lib/constants';

// GET /api/class-schedule?cls=701
// Bir sınıfın haftalık ders programını döner — tüm öğretmenlerin program'larından
// type==='ders' ve cls==={cls} olan slotları toplar.
//
// Döndürür:
// {
//   cls,
//   schedule: { [dayIndex]: [ { slotId, slotLabel, teacherId, teacherName, branch } ] }
// }
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const cls = searchParams.get('cls');
  if (!cls) return NextResponse.json({ error: 'cls gerekli' }, { status: 400 });

  const teacherIds = await redis.smembers('teachers');
  if (!teacherIds || teacherIds.length === 0) {
    return NextResponse.json({ cls, schedule: {} });
  }

  const pipeline = redis.pipeline();
  teacherIds.forEach(id => {
    pipeline.get(`teacher:${id}`);
    pipeline.get(`program:${id}`);
  });
  const results = await pipeline.exec();

  const schedule = {};
  for (const day of ALL_DAYS) schedule[day.index] = [];

  for (let i = 0; i < teacherIds.length; i++) {
    const teacher = results[i * 2];
    const program = results[i * 2 + 1];
    if (!teacher || !program) continue;

    for (const day of ALL_DAYS) {
      const dayProg = program[String(day.index)] || {};
      const slots = slotsForDay(day.index);
      for (const slot of slots) {
        const entry = dayProg[slot.id];
        if (entry?.type === 'ders' && entry.cls === cls) {
          schedule[day.index].push({
            slotId: slot.id,
            slotLabel: slot.label,
            teacherId: teacher.id,
            teacherName: teacher.name,
            branch: teacher.branch || '',
          });
        }
      }
    }
  }

  return NextResponse.json({ cls, schedule });
}
