import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

// GET /api/backup
// Tüm Redis verisini snapshot olarak GitHub backup repo'ya yükler.
// Son 30 günden eskileri siler.
//
// Cron tarafından Authorization: Bearer $CRON_SECRET ile çağrılır.
// Manuel test için aynı header gerekli.

const BACKUP_DIR = 'backups';

function todayStamp() {
  // Türkiye saati ile YYYY-MM-DD
  const d = new Date();
  const utcMs = d.getTime() + (3 * 60 * 60 * 1000);
  const tr = new Date(utcMs);
  return tr.toISOString().slice(0, 10);
}

function nowStamp() {
  return new Date().toISOString();
}

async function ghFetch(token, repo, path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
  return res;
}

async function listBackupFiles(token, repo) {
  const res = await ghFetch(token, repo, `contents/${BACKUP_DIR}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub listele başarısız: ${res.status}`);
  const data = await res.json();
  return data
    .filter(f => f.type === 'file' && f.name.endsWith('.json'))
    .map(f => ({ name: f.name, path: f.path, sha: f.sha }));
}

async function deleteBackupFile(token, repo, file) {
  const res = await ghFetch(token, repo, `contents/${file.path}`, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `chore: rotate — eski yedek silindi (${file.name})`,
      sha: file.sha,
    }),
  });
  return res.ok;
}

async function uploadBackup(token, repo, filename, contentB64) {
  const res = await ghFetch(token, repo, `contents/${BACKUP_DIR}/${filename}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `backup: ${filename}`,
      content: contentB64,
    }),
  });
  return res;
}

export async function GET(req) {
  // Auth: CRON_SECRET header'ı zorunlu
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  }

  const token = process.env.GITHUB_BACKUP_TOKEN;
  const repo = process.env.GITHUB_BACKUP_REPO;
  if (!token || !repo) {
    return NextResponse.json({ error: 'Backup yapılandırması eksik' }, { status: 500 });
  }

  // 1. Tüm Redis key'lerini topla
  const dump = {};
  let cursor = '0';
  let total = 0;
  do {
    const [next, keys] = await redis.scan(cursor, { count: 500 });
    cursor = String(next);
    if (keys.length > 0) {
      const pipeline = redis.pipeline();
      keys.forEach(k => pipeline.get(k));
      const values = await pipeline.exec();
      keys.forEach((k, i) => {
        if (values[i] !== null && values[i] !== undefined) {
          dump[k] = values[i];
          total++;
        }
      });
    }
  } while (cursor !== '0');

  // 2. JSON üret
  const payload = {
    snapshotAt: nowStamp(),
    keyCount: total,
    data: dump,
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  const sizeKB = (Buffer.byteLength(jsonStr, 'utf-8') / 1024).toFixed(1);

  // Sağlık kontrolü: önceki yedek varsa boyut çok küçülmüşse uyar (ama yine de yaz)
  let warning = null;
  try {
    const existing = await listBackupFiles(token, repo);
    if (existing.length > 0) {
      // En son dosyayı al (isim YYYY-MM-DD.json olduğundan alfabetik sıralama tarihe denk)
      const sorted = existing.sort((a, b) => b.name.localeCompare(a.name));
      const latest = sorted[0];
      const latestRes = await ghFetch(token, repo, `contents/${latest.path}`);
      if (latestRes.ok) {
        const latestMeta = await latestRes.json();
        const prevSize = parseInt(latestMeta.size || 0);
        const newSize = Buffer.byteLength(jsonStr, 'utf-8');
        if (prevSize > 0 && newSize < prevSize * 0.5) {
          warning = `Yedek %50'den fazla küçüldü (eski: ${(prevSize / 1024).toFixed(1)}KB, yeni: ${sizeKB}KB). Yine de yazıldı.`;
        }
      }
    }
  } catch (e) {
    warning = `Sağlık kontrolü başarısız: ${e.message}`;
  }

  // 3. GitHub'a yükle (varsa üzerine yaz)
  const filename = `${todayStamp()}.json`;
  const contentB64 = Buffer.from(jsonStr, 'utf-8').toString('base64');

  // Dosya zaten varsa sha lazım
  let existingSha = null;
  const checkRes = await ghFetch(token, repo, `contents/${BACKUP_DIR}/${filename}`);
  if (checkRes.ok) {
    const meta = await checkRes.json();
    existingSha = meta.sha;
  }

  const uploadRes = await ghFetch(token, repo, `contents/${BACKUP_DIR}/${filename}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `backup: ${filename} (${total} keys, ${sizeKB}KB)`,
      content: contentB64,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    return NextResponse.json({
      error: 'GitHub upload başarısız',
      status: uploadRes.status,
      detail: errText,
    }, { status: 500 });
  }

  // 4. Rotation — 30 günden eski dosyaları sil
  let deleted = 0;
  try {
    const files = await listBackupFiles(token, repo);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const old = files.filter(f => {
      const m = f.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (!m) return false;
      return m[1] < cutoffStr;
    });
    for (const f of old) {
      const ok = await deleteBackupFile(token, repo, f);
      if (ok) deleted++;
    }
  } catch (e) {
    warning = (warning ? warning + ' | ' : '') + `Rotation hatası: ${e.message}`;
  }

  return NextResponse.json({
    ok: true,
    filename,
    keyCount: total,
    sizeKB: parseFloat(sizeKB),
    deleted,
    warning,
  });
}
