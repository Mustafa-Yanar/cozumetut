import redis from './redis';
import { TIME_SLOTS, WEEKDAYS } from './constants';

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

// slot key: slots:{weekKey}:{teacherId}:{dayIndex}:{slotId}
// value: { booked: bool, studentId, studentName, bookedBy }
export function slotKey(weekKey, teacherId, dayIndex, slotId) {
  return `slot:${weekKey}:${teacherId}:${dayIndex}:${slotId}`;
}

export async function getTeacherWeekSlots(teacherId, weekKey) {
  const pipeline = redis.pipeline();
  const keys = [];
  for (let d = 0; d < 5; d++) {
    for (const slot of TIME_SLOTS) {
      const k = slotKey(weekKey, teacherId, d, slot.id);
      keys.push({ d, slotId: slot.id, k });
      pipeline.get(k);
    }
  }
  const results = await pipeline.exec();
  const grid = WEEKDAYS.map(() => TIME_SLOTS.map(() => null));
  results.forEach((val, i) => {
    const { d, slotId } = keys[i];
    const slotIdx = TIME_SLOTS.findIndex(s => s.id === slotId);
    grid[d][slotIdx] = val || { booked: false };
  });
  return grid;
}

export async function initWeekForTeacher(teacherId, weekKey) {
  const pipeline = redis.pipeline();
  for (let d = 0; d < 5; d++) {
    for (const slot of TIME_SLOTS) {
      const k = slotKey(weekKey, teacherId, d, slot.id);
      pipeline.set(k, { booked: false }, { ex: 60 * 60 * 24 * 14 });
    }
  }
  await pipeline.exec();
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
