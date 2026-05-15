// Öğretmen kayıt branşları (tümü seçilebilir)
export const BRANCHES = ['Türkçe', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Felsefe', 'Fen Bilgisi', 'Sosyal Bilgiler', 'İnkılap Tarihi', 'İngilizce'];

// Bir branşın alt dalları varsa burada tanımlı (sadece 12. sınıf ve mezun için anlamlı)
export const SUB_BRANCHES = {
  Matematik: ['TYT Matematik', 'AYT Matematik', 'Geometri'],
};

// Bir sınıf alt branş seçimi gerektiriyor mu? (12. sınıf veya mezun)
export function classNeedsSubBranch(cls) {
  if (!cls) return false;
  if (cls.startsWith('m')) return true; // mezun
  const grade = Math.floor(parseInt(cls) / 100);
  return grade === 4; // 12. sınıf (401-410)
}

// Sınıfa göre öğrencinin görebileceği branşlar
export function allowedBranchesForClass(cls) {
  if (!cls) return [];
  if (cls.startsWith('m')) return ['Türkçe', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Felsefe'];
  const grade = Math.floor(parseInt(cls) / 100);
  if (grade === 7) return ['Türkçe', 'Matematik', 'Fen Bilgisi', 'Sosyal Bilgiler', 'İngilizce'];
  if (grade === 8) return ['Türkçe', 'Matematik', 'Fen Bilgisi', 'İnkılap Tarihi', 'İngilizce'];
  // Lise ve mezun: tüm lise branşları (İngilizce yok)
  return ['Türkçe', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Felsefe'];
}

// Hafta içi & hafta sonu slot id'leri — 12'şer slot (saatleri dinamik, Redis'te)
export const WEEKDAY_SLOT_IDS = ['w1','w2','w3','w4','w5','w6','w7','w8','w9','w10','w11','w12'];
export const WEEKEND_SLOT_IDS = ['e1','e2','e3','e4','e5','e6','e7','e8','e9','e10','e11','e12'];

// Default saatler (Redis'te slot_times yoksa kullanılır)
export const DEFAULT_WEEKDAY_TIMES = [
  { start: '09:45', end: '10:20' },
  { start: '10:30', end: '11:05' },
  { start: '11:15', end: '11:50' },
  { start: '12:00', end: '12:35' },
  { start: '13:30', end: '14:05' },
  { start: '14:15', end: '14:50' },
  { start: '15:00', end: '15:35' },
  { start: '15:45', end: '16:20' },
  { start: '16:30', end: '17:05' },
  { start: '17:15', end: '17:50' },
  { start: '18:00', end: '18:35' },
  { start: '18:45', end: '19:20' },
];
export const DEFAULT_WEEKEND_TIMES = [
  { start: '09:30', end: '10:05' },
  { start: '10:15', end: '10:50' },
  { start: '11:00', end: '11:35' },
  { start: '11:45', end: '12:20' },
  { start: '12:30', end: '13:05' },
  { start: '13:15', end: '13:50' },
  { start: '14:30', end: '15:05' },
  { start: '15:15', end: '15:50' },
  { start: '16:00', end: '16:35' },
  { start: '16:45', end: '17:20' },
  { start: '17:30', end: '18:05' },
  { start: '18:15', end: '18:50' },
];

// Etiket üretici: { start, end } → "HH:MM–HH:MM"
export function formatSlotLabel(t) {
  return `${t.start}–${t.end}`;
}

// Saat dizisini { id, label } slot dizisine çevir
export function makeSlots(ids, times) {
  return ids.map((id, i) => {
    const t = times[i] || { start: '00:00', end: '00:00' };
    return { id, label: formatSlotLabel(t), start: t.start, end: t.end };
  });
}

// Geriye dönük uyumluluk için default slot dizileri
export const WEEKDAY_SLOTS = makeSlots(WEEKDAY_SLOT_IDS, DEFAULT_WEEKDAY_TIMES);
export const WEEKEND_SLOTS = makeSlots(WEEKEND_SLOT_IDS, DEFAULT_WEEKEND_TIMES);

// Tüm günler: 0=Pzt 1=Sal 2=Çar 3=Per 4=Cum 5=Cmt 6=Paz
export const ALL_DAYS = [
  { index: 0, label: 'Pazartesi', short: 'Pzt', weekend: false },
  { index: 1, label: 'Salı',      short: 'Sal', weekend: false },
  { index: 2, label: 'Çarşamba',  short: 'Çar', weekend: false },
  { index: 3, label: 'Perşembe',  short: 'Per', weekend: false },
  { index: 4, label: 'Cuma',      short: 'Cum', weekend: false },
  { index: 5, label: 'Cumartesi', short: 'Cmt', weekend: true  },
  { index: 6, label: 'Pazar',     short: 'Paz', weekend: true  },
];

export const WEEKDAYS = ALL_DAYS.filter(d => !d.weekend).map(d => d.label);

// Bir gün için geçerli slot listesini döndür (default).
// Dinamik saatler için API endpoint'leri Redis'ten okuyup makeSlots ile üretir.
export function slotsForDay(dayIndex, times) {
  if (times) {
    const ids = dayIndex >= 5 ? WEEKEND_SLOT_IDS : WEEKDAY_SLOT_IDS;
    return makeSlots(ids, times);
  }
  return dayIndex >= 5 ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
}

// Hafta içi sadece mezun sınıfların ders olarak atanabileceği ilk 6 slot
export const MEZUN_ONLY_LESSON_SLOTS = ['w1','w2','w3','w4','w5','w6'];

// Mezun öğrencilerin etüt rezervasyonu yapamayacağı hafta içi slot
export const MEZUN_FORBIDDEN_ETUT_SLOT = 'w9';

export const STUDENT_GROUPS = {
  ortaokul: {
    label: 'Ortaokul',
    classes: ['701', '702', '801', '802'],
  },
  lise: {
    label: 'Lise',
    classes: [
      '101', '102',
      '201', '202',
      '301', '302', '303',
      '304', '305', '306',
      '401', '402', '403', '404', '405',
      '406', '407', '408', '409', '410',
    ],
  },
  mezun: {
    label: 'Mezun',
    classes: ['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10'],
  },
};

export function classToGroup(cls) {
  for (const [key, val] of Object.entries(STUDENT_GROUPS)) {
    if (val.classes.includes(cls)) return key;
  }
  return null;
}

export function classLabel(cls) {
  if (cls.startsWith('m')) {
    const num = parseInt(cls.slice(1));
    const type = num <= 5 ? 'Sayısal' : 'Eşit Ağırlık';
    return `Mezun ${type} (${cls.toUpperCase()})`;
  }
  const grade = Math.floor(parseInt(cls) / 100);
  const section = cls.slice(1);
  const gradeNames = { 7: '7. Sınıf', 8: '8. Sınıf', 1: '9. Sınıf', 2: '10. Sınıf', 3: '11. Sınıf', 4: '12. Sınıf' };
  const name = gradeNames[grade] || `${grade}. Sınıf`;
  let type = '';
  if (grade === 3) type = parseInt(section) <= 3 ? ' Sayısal' : ' Eşit Ağırlık';
  if (grade === 4) type = parseInt(section) <= 5 ? ' Sayısal' : ' Eşit Ağırlık';
  return `${name}${type} (${cls})`;
}
