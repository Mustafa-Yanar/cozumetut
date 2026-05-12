import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getSession } from '@/lib/auth';
import { getTeacherTemplate, setTeacherTemplate, initWeekForTeacher, getWeekKey } from '@/lib/slots';
import { ALL_DAYS, slotsForDay } from '@/lib/constants';

// GET /api/teachers/template?teacherId=xxx
export async function GET(req) {
  const session = await getSession();
  if (!session || session.role !== 'director') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const teacherId = searchParams.get('teacherId');
  if (!teacherId) return NextResponse.json({ error: 'teacherId gerekli' }, { status: 400 });

  const template = await getTeacherTemplate(teacherId);
  return NextResponse.json({ template });
}

// POST /api/teachers/template — şablonu kaydet ve mevcut haftaya uygula
export async function POST(req) {
  const session = await getSession();
  if (!session || session.role !== 'director') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const { teacherId, template } = await req.json();
  if (!teacherId) return NextResponse.json({ error: 'teacherId gerekli' }, { status: 400 });

  // Şablonu kaydet
  await setTeacherTemplate(teacherId, template);

  // Mevcut haftada: sadece disabled/enabled durumlarını güncelle, dolu slotlara dokunma
  const stored = await redis.get('current_week');
  const weekKey = stored || getWeekKey();

  for (const day of ALL_DAYS) {
    const slots = slotsForDay(day.index);
    const openSlots = template[day.index] || [];
    for (const slot of slots) {
      const k = `slot:${weekKey}:${teacherId}:${day.index}:${slot.id}`;
      const existing = await redis.get(k);
      const disabled = !openSlots.includes(slot.id);
      if (!existing || !existing.booked) {
        // Rezervasyonu olmayan slotları güncelle
        await redis.set(k, { booked: false, disabled }, { ex: 60 * 60 * 24 * 16 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
