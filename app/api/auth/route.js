import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import redis from '@/lib/redis';
import { getSession, setSession, clearSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  const directorExists = await redis.exists('director');
  return NextResponse.json({ session, directorExists: !!directorExists });
}

export async function POST(req) {
  const { action, username, password } = await req.json();

  if (action === 'login') {
    // Try director
    const director = await redis.get('director');
    if (director && director.username === username) {
      const ok = await bcrypt.compare(password, director.passwordHash);
      if (ok) {
        const res = NextResponse.json({ role: 'director', name: director.name });
        await setSession(res, { role: 'director', id: 'director', name: director.name });
        return res;
      }
    }

    // Try teacher
    const teacherIds = await redis.smembers('teachers');
    for (const tid of teacherIds) {
      const t = await redis.get(`teacher:${tid}`);
      if (t && t.username === username) {
        const ok = await bcrypt.compare(password, t.passwordHash);
        if (ok) {
          const res = NextResponse.json({ role: 'teacher', id: t.id, name: t.name, branch: t.branch });
          await setSession(res, { role: 'teacher', id: t.id, name: t.name, branch: t.branch });
          return res;
        }
      }
    }

    // Try student
    const studentIds = await redis.smembers('students');
    for (const sid of studentIds) {
      const s = await redis.get(`student:${sid}`);
      if (s && s.username === username) {
        const ok = await bcrypt.compare(password, s.passwordHash);
        if (ok) {
          const res = NextResponse.json({ role: 'student', id: s.id, name: s.name, cls: s.cls, group: s.group });
          await setSession(res, { role: 'student', id: s.id, name: s.name, cls: s.cls, group: s.group });
          return res;
        }
      }
    }

    return NextResponse.json({ error: 'Kullanıcı adı veya şifre hatalı' }, { status: 401 });
  }

  if (action === 'setup_director') {
    const exists = await redis.exists('director');
    if (exists) return NextResponse.json({ error: 'Müdür zaten kayıtlı' }, { status: 400 });
    const hash = await bcrypt.hash(password, 10);
    await redis.set('director', { username, passwordHash: hash, name: 'Müdür' });
    const res = NextResponse.json({ ok: true });
    await setSession(res, { role: 'director', id: 'director', name: 'Müdür' });
    return res;
  }

  if (action === 'logout') {
    const res = NextResponse.json({ ok: true });
    await clearSession(res);
    return res;
  }

  return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 });
}
