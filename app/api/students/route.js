import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import redis from '@/lib/redis';
import { getSession } from '@/lib/auth';
import { classToGroup } from '@/lib/constants';

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 });

  const ids = await redis.smembers('students');
  if (!ids || ids.length === 0) return NextResponse.json([]);

  const pipeline = redis.pipeline();
  ids.forEach(id => pipeline.get(`student:${id}`));
  const results = await pipeline.exec();
  const students = results.filter(Boolean).map(s => ({
    id: s.id, name: s.name, username: s.username, cls: s.cls, group: s.group,
  }));
  return NextResponse.json(students);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || session.role !== 'director') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const { name, username, password, cls } = await req.json();
  if (!name || !username || !password || !cls) {
    return NextResponse.json({ error: 'Tüm alanlar gerekli' }, { status: 400 });
  }

  const group = classToGroup(cls);
  if (!group) return NextResponse.json({ error: 'Geçersiz sınıf' }, { status: 400 });

  // Check username uniqueness
  const studentIds = await redis.smembers('students');
  for (const sid of studentIds) {
    const s = await redis.get(`student:${sid}`);
    if (s && s.username === username) {
      return NextResponse.json({ error: 'Bu kullanıcı adı zaten kullanılıyor' }, { status: 400 });
    }
  }

  const id = makeId();
  const hash = await bcrypt.hash(password, 10);
  const student = { id, name, username, passwordHash: hash, cls, group };
  await redis.set(`student:${id}`, student);
  await redis.sadd('students', id);

  return NextResponse.json({ id, name, username, cls, group });
}

export async function PUT(req) {
  const session = await getSession();
  if (!session || session.role !== 'director') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const { id, name, username, password, cls } = await req.json();
  const student = await redis.get(`student:${id}`);
  if (!student) return NextResponse.json({ error: 'Öğrenci bulunamadı' }, { status: 404 });

  const group = classToGroup(cls) || student.group;
  const updated = { ...student, name, username, cls, group };
  if (password) {
    updated.passwordHash = await bcrypt.hash(password, 10);
  }
  await redis.set(`student:${id}`, updated);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const session = await getSession();
  if (!session || session.role !== 'director') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const { id } = await req.json();
  await redis.del(`student:${id}`);
  await redis.srem('students', id);
  return NextResponse.json({ ok: true });
}
