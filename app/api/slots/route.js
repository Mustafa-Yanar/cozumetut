import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getSession } from '@/lib/auth';
import { getWeekKey, getTeacherWeekSlots, slotKey, getAllTeachers } from '@/lib/slots';
import { TIME_SLOTS, WEEKDAYS, MEZUN_FORBIDDEN_SLOT } from '@/lib/constants';

// GET /api/slots?week=2024-W20&teacherId=xxx
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekKey = searchParams.get('week') || getWeekKey();
  const teacherId = searchParams.get('teacherId');

  if (teacherId) {
    const grid = await getTeacherWeekSlots(teacherId, weekKey);
    return NextResponse.json({ weekKey, grid });
  }

  // Return all teachers' slots for the week
  const teachers = await getAllTeachers();
  const allSlots = [];

  for (const teacher of teachers) {
    const grid = await getTeacherWeekSlots(teacher.id, weekKey);
    for (let d = 0; d < 5; d++) {
      for (let s = 0; s < TIME_SLOTS.length; s++) {
        const slotData = grid[d][s] || { booked: false };
        allSlots.push({
          teacherId: teacher.id,
          teacherName: teacher.name,
          branch: teacher.branch,
          allowedGroups: teacher.allowedGroups || [],
          day: d,
          dayLabel: WEEKDAYS[d],
          slotId: TIME_SLOTS[s].id,
          slotLabel: TIME_SLOTS[s].label,
          ...slotData,
        });
      }
    }
  }

  return NextResponse.json({ weekKey, slots: allSlots });
}

// POST /api/slots - book a slot
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const { teacherId, day, slotId, studentId, weekKey: wk } = await req.json();
  const weekKey = wk || getWeekKey();

  const teacher = await redis.get(`teacher:${teacherId}`);
  if (!teacher) return NextResponse.json({ error: 'Öğretmen bulunamadı' }, { status: 404 });

  let targetStudentId = studentId;
  let targetStudent;

  if (session.role === 'student') {
    targetStudentId = session.id;
    targetStudent = await redis.get(`student:${session.id}`);
  } else if (session.role === 'teacher') {
    // Teacher can only book for their own slots
    if (teacherId !== session.id) {
      return NextResponse.json({ error: 'Sadece kendi slotlarınıza rezervasyon yapabilirsiniz' }, { status: 403 });
    }
    targetStudent = await redis.get(`student:${studentId}`);
  } else if (session.role === 'director') {
    targetStudent = await redis.get(`student:${studentId}`);
  }

  if (!targetStudent) return NextResponse.json({ error: 'Öğrenci bulunamadı' }, { status: 404 });

  // Group access check
  const allowedGroups = teacher.allowedGroups || [];
  if (allowedGroups.length > 0 && !allowedGroups.includes(targetStudent.group)) {
    return NextResponse.json({ error: 'Bu öğrenci bu öğretmenin etütlerine kayıt olamaz' }, { status: 400 });
  }

  // Mezun forbidden slot check
  if (targetStudent.group === 'mezun' && slotId === MEZUN_FORBIDDEN_SLOT) {
    return NextResponse.json({ error: 'Mezun öğrenciler 16:30-17:00 saatindeki etüde kayıt olamaz' }, { status: 400 });
  }

  // Weekly limit: 1 per branch per student
  const allSlotKeys = [];
  for (let d = 0; d < 5; d++) {
    for (const slot of TIME_SLOTS) {
      allSlotKeys.push(slotKey(weekKey, teacherId, d, slot.id));
    }
  }
  const pipeline = redis.pipeline();
  allSlotKeys.forEach(k => pipeline.get(k));
  const existingSlots = await pipeline.exec();
  const alreadyBooked = existingSlots.some(s => s && s.booked && s.studentId === targetStudentId);
  if (alreadyBooked) {
    return NextResponse.json({ error: `Bu öğrenci bu hafta ${teacher.branch} dersinden zaten etüt almış` }, { status: 400 });
  }

  // Check if slot is already booked
  const key = slotKey(weekKey, teacherId, day, slotId);
  const existing = await redis.get(key);
  if (existing && existing.booked) {
    return NextResponse.json({ error: 'Bu saat dilimi zaten dolu' }, { status: 400 });
  }

  const bookedData = {
    booked: true,
    studentId: targetStudentId,
    studentName: targetStudent.name,
    studentCls: targetStudent.cls,
    bookedBy: session.role,
    bookedAt: new Date().toISOString(),
  };

  await redis.set(key, bookedData, { ex: 60 * 60 * 24 * 14 });

  return NextResponse.json({ ok: true, slot: bookedData });
}

// DELETE /api/slots - cancel a booking
export async function DELETE(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const { teacherId, day, slotId, weekKey: wk } = await req.json();
  const weekKey = wk || getWeekKey();
  const key = slotKey(weekKey, teacherId, day, slotId);

  const existing = await redis.get(key);
  if (!existing || !existing.booked) {
    return NextResponse.json({ error: 'Rezervasyon bulunamadı' }, { status: 404 });
  }

  // Permission check
  if (session.role === 'student' && existing.studentId !== session.id) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }
  if (session.role === 'teacher' && teacherId !== session.id) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  await redis.set(key, { booked: false }, { ex: 60 * 60 * 24 * 14 });

  return NextResponse.json({ ok: true });
}
