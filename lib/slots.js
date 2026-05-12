import redis from './redis';
import { ALL_DAYS, slotsForDay } from './constants';

// Week key: ISO week string like "2024-W20"
export function getWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function getMondayOfWeek(weekKey) {
  const [year, wStr] = weekKey.split('-W');
  const week = parseInt(wStr);
  const jan4 = new Date(parseInt(year), 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}

// slot key: slot:{weekKey}:{teacherId}:{dayIndex}:{slotId}
export function slotKey(weekKey, teacherId, dayIndex, slotId) {
  return `slot:${weekKey}:${teacherId}:${dayIndex}:${slotId}`;
}

// Öğretmen şablonu key: template:{teacherId}
// Değer: { [dayIndex]: [slotId, ...] } — hangi gün hangi slotlar açık
export function templateKey(teacherId) {
  return `template:${teacherId}`;
}

export async function getTeacherTemplate(teacherId) {
  const tmpl = await redis.get(templateKey(teacherId));
  return tmpl || {};
}

export async function setTeacherTemplate(teacherId, template) {
  await redis.set(templateKey(teacherId), template);
}

// Bir haftanın slotlarını şablona göre init eder.
// Şablonda açık olan slotlar { booked: false, disabled: false }
// Şablonda olmayan slotlar { booked: false, disabled: true } (kapalı)
export async function initWeekForTeacher(teacherId, weekKey) {
  const template = await getTeacherTemplate(teacherId);
  const pipeline = redis.pipeline();

  for (const day of ALL_DAYS) {
    const slots = slotsForDay(day.index);
    const openSlots = template[day.index] || [];
    for (const slot of slots) {
      const k = slotKey(weekKey, teacherId, day.index, slot.id);
      const disabled = !openSlots.includes(slot.id);
      pipeline.set(k, { booked: false, disabled }, { ex: 60 * 60 * 24 * 16 });
    }
  }
  await pipeline.exec();
}

// Tüm günler ve slotlar için grid döndürür
// grid[dayIndex][slotIndex] = { booked, disabled, studentId?, studentName?, ... }
export async function getTeacherWeekSlots(teacherId, weekKey) {
  const pipeline = redis.pipeline();
  const keys = [];

  for (const day of ALL_DAYS) {
    const slots = slotsForDay(day.index);
    for (const slot of slots) {
      const k = slotKey(weekKey, teacherId, day.index, slot.id);
      keys.push({ dayIndex: day.index, slotId: slot.id, k });
      pipeline.get(k);
    }
  }

  const results = await pipeline.exec();

  // grid: 7 gün, her gün kendi slot sayısı kadar
  const grid = {};
  for (const day of ALL_DAYS) {
    grid[day.index] = slotsForDay(day.index).map(() => null);
  }

  results.forEach((val, i) => {
    const { dayIndex, slotId } = keys[i];
    const slots = slotsForDay(dayIndex);
    const slotIdx = slots.findIndex(s => s.id === slotId);
    // Hiç init edilmemişse disabled say (şablon henüz tanımlanmamış)
    grid[dayIndex][slotIdx] = val !== null ? val : { booked: false, disabled: true };
  });

  return grid;
}

export async function getAllTeachers() {
  const ids = await redis.smembers('teachers');
  if (!ids || ids.length === 0) return [];
  const pipeline = redis.pipeline();
  ids.forEach(id => pipeline.get(`teacher:${id}`));
  const results = await pipeline.exec();
  return results.filter(Boolean);
}

export async function getAllStudents() {
  const ids = await redis.smembers('students');
  if (!ids || ids.length === 0) return [];
  const pipeline = redis.pipeline();
  ids.forEach(id => pipeline.get(`student:${id}`));
  const results = await pipeline.exec();
  return results.filter(Boolean);
}
