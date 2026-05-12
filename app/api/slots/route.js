import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getSession } from '@/lib/auth';
import { getWeekKey, getTeacherWeekSlots, slotKey, getAllTeachers } from '@/lib/slots';
import { ALL_DAYS, slotsForDay, MEZUN_FORBIDDEN_SLOT } from '@/lib/constants';

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

  const teachers = await getAllTeachers();
  const allSlots = [];

  for (const teacher of teachers) {
    const grid = await getTeacherWeekSlots(teacher.id, weekKey);
    for (const day of ALL_DAYS) {
      const slots = slotsForDay(day.index);
      for (let s = 0; s < slots.length; s++) {
        const slotData = grid[day.index][s] || { booked: false, disabled: true };
        allSlots.push({
          teacherId: teacher.id,
          teacherName: teacher.name,
          branch: teacher.branch,
          allowedGroups: teacher.allowedGroups || [],
          day: day.index,
          dayLabel: day.label,
          weekend: day.weekend,
          slotId: slots[s].id,
          slotLabel: slots[s].label,
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

  // Slot kapalı mı kontrol et
  const key = slotKey(weekKey, teacherId, day, slotId);
  const existing = await redis.get(key);
  if (existing && existing.disabled) {
    return NextResponse.json({ error: 'Bu saat dilimi kapalıdır' }, { status: 400 });
  }
  if (existing && existing.booked) {
    return NextResponse.json({ error: 'Bu saat dilimi zaten dolu' }, { status: 400 });
  }

  let targetStudentId = studentId;
  let targetStudent;

  if (session.role === 'student') {
    targetStudentId = session.id;
    targetStudent = await redis.get(`student:${session.id}`);
  } else if (session.role === 'teacher') {
    if (teacherId !== session.id) {
      return NextResponse.json({ error: 'Sadece kendi slotlarınıza rezervasyon yapabilirsiniz' }, { status: 403 });
    }
    targetStudent = await redis.get(`student:${studentId}`);
  } else if (session.role === 'director') {
    targetStudent = await redis.get(`student:${studentId}`);
  }

  if (!targetStudent) return NextResponse.json({ error: 'Öğrenci bulunamadı' }, { status: 404 });

  // Grup erişim kontrolü
  const allowedGroups = teacher.allowedGroups || [];
  if (allowedGroups.length > 0 && !allowedGroups.includes(targetStudent.group)) {
    return NextResponse.json({ error: 'Bu öğrenci bu öğretmenin etütlerine kayıt olamaz' }, { status: 400 });
  }

  // Mezun yasak slot kontrolü
  if (targetStudent.group === 'mezun' && slotId === MEZUN_FORBIDDEN_SLOT) {
    return NextResponse.json({ error: 'Mezun öğrenciler 16:30-17:00 saatindeki etüde kayıt olamaz' }, { status: 400 });
  }

  // Haftalık limit: aynı branştan 1 etüt
  const allTeacherSlotKeys = [];
  for (const day2 of ALL_DAYS) {
    for (const slot of slotsForDay(day2.index)) {
      allTeacherSlotKeys.push(slotKey(weekKey, teacherId, day2.index, slot.id));
    }
  }
  const pipeline = redis.pipeline();
  allTeacherSlotKeys.forEach(k => pipeline.get(k));
  const existingSlots = await pipeline.exec();
  const alreadyBooked = existingSlots.some(s => s && s.booked && s.studentId === targetStudentId);
  if (alreadyBooked) {
    return NextResponse.json({ error: `Bu öğrenci bu hafta ${teacher.branch} dersinden zaten etüt almış` }, { status: 400 });
  }

  const bookedData = {
    booked: true,
    disabled: false,
    studentId: targetStudentId,
    studentName: targetStudent.name,
    studentCls: targetStudent.cls,
    bookedBy: session.role,
    bookedAt: new Date().toISOString(),
  };

  await redis.set(key, bookedData, { ex: 60 * 60 * 24 * 16 });

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

  if (session.role === 'student' && existing.studentId !== session.id) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }
  if (session.role === 'teacher' && teacherId !== session.id) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  // Şablona göre disabled durumunu geri yükle
  const template = await redis.get(`template:${teacherId}`);
  const openSlots = template?.[day] || [];
  const disabled = !openSlots.includes(slotId);

  await redis.set(key, { booked: false, disabled }, { ex: 60 * 60 * 24 * 16 });

  return NextResponse.json({ ok: true });
}
