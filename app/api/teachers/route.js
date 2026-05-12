import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'crypto';
import redis from '@/lib/redis';
import { getSession } from '@/lib/auth';
import { getWeekKey, initWeekForTeacher } from '@/lib/slots';

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const ids = await redis.smembers('teachers');
  if (!ids || ids.length === 0) return NextResponse.json([]);

  const pipeline = redis.pipeline();
  ids.forEach(id => pipeline.get(`teacher:${id}`));
  const results = await pipeline.exec();
  const teachers = results.filter(Boolean).map(t => ({
    id: t.id, name: t.name, branch: t.branch, username: t.username,
    allowedGroups: t.allowedGroups || [],
  }));
  return NextResponse.json(teachers);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || session.role !== 'director') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const { name, username, password, branch, allowedGroups } = await req.json();
  if (!name || !username || !password || !branch) {
    return NextResponse.json({ error: 'Tüm alanlar gerekli' }, { status: 400 });
  }

  // Check username uniqueness
  const teacherIds = await redis.smembers('teachers');
  for (const tid of teacherIds) {
    const t = await redis.get(`teacher:${tid}`);
    if (t && t.username === username) {
      return NextResponse.json({ error: 'Bu kullanıcı adı zaten kullanılıyor' }, { status: 400 });
    }
  }

  const id = makeId();
  const hash = await bcrypt.hash(password, 10);
  const teacher = { id, name, username, passwordHash: hash, branch, allowedGroups: allowedGroups || [] };
  await redis.set(`teacher:${id}`, teacher);
  await redis.sadd('teachers', id);

  // Initialize current week slots
  const weekKey = getWeekKey();
  await initWeekForTeacher(id, weekKey);

  return NextResponse.json({ id, name, branch, username, allowedGroups: teacher.allowedGroups });
}

export async function PUT(req) {
  const session = await getSession();
  if (!session || session.role !== 'director') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const { id, name, username, password, branch, allowedGroups } = await req.json();
  const teacher = await redis.get(`teacher:${id}`);
  if (!teacher) return NextResponse.json({ error: 'Öğretmen bulunamadı' }, { status: 404 });

  const updated = { ...teacher, name, username, branch, allowedGroups: allowedGroups || teacher.allowedGroups };
  if (password) {
    updated.passwordHash = await bcrypt.hash(password, 10);
  }
  await redis.set(`teacher:${id}`, updated);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getSession();
  if (!session || session.role !== 'director') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const { id } = await req.json();
  await redis.del(`teacher:${id}`);
  await redis.srem('teachers', id);
  return NextResponse.json({ ok: true });
}
