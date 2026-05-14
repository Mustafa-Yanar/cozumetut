// Öğretmen kayıt branşları (tümü seçilebilir)
export const BRANCHES = ['Türkçe', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Fen Bilgisi', 'Sosyal Bilgiler', 'İnkılap Tarihi', 'İngilizce'];

// Sınıfa göre öğrencinin görebileceği branşlar
export function allowedBranchesForClass(cls) {
  const grade = Math.floor(parseInt(cls) / 100);
  if (grade === 7) return ['Türkçe', 'Matematik', 'Fen Bilgisi', 'Sosyal Bilgiler', 'İngilizce'];
  if (grade === 8) return ['Türkçe', 'Matematik', 'Fen Bilgisi', 'İnkılap Tarihi', 'İngilizce'];
  // Lise ve mezun: tüm lise branşları (İngilizce yok)
  return ['Türkçe', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya'];
}

// Hafta içi saatleri (Pazartesi–Cuma, index 0–4)
export const WEEKDAY_SLOTS = [
  { id: 'w1', label: '15:00–15:30', start: '15:00', end: '15:30' },
  { id: 'w2', label: '15:45–16:15', start: '15:45', end: '16:15' },
  { id: 'w3', label: '16:30–17:00', start: '16:30', end: '17:00' },
  { id: 'w4', label: '17:15–17:45', start: '17:15', end: '17:45' },
  { id: 'w5', label: '18:00–18:30', start: '18:00', end: '18:30' },
];

// Hafta sonu sadece ilk 3 slot (w1-w3) geçerlidir
export const WEEKEND_SLOT_COUNT = 3;

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

// Bir gün için geçerli slot listesini döndür
// Hafta sonu sadece ilk 3 slot (w1-w3) geçerlidir
export function slotsForDay(dayIndex) {
  return dayIndex >= 5 ? WEEKDAY_SLOTS.slice(0, WEEKEND_SLOT_COUNT) : WEEKDAY_SLOTS;
}

// Slot ID 'w3' (16:30-17:00) mezun öğrencilere yasak
export const MEZUN_FORBIDDEN_SLOT = 'w3';

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
