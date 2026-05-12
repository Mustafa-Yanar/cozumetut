export const BRANCHES = ['Türkçe', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya'];

export const TIME_SLOTS = [
  { id: '1', label: '15:00–15:30', start: '15:00', end: '15:30' },
  { id: '2', label: '15:45–16:15', start: '15:45', end: '16:15' },
  { id: '3', label: '16:30–17:00', start: '16:30', end: '17:00' },
  { id: '4', label: '17:15–17:45', start: '17:15', end: '17:45' },
  { id: '5', label: '18:00–18:30', start: '18:00', end: '18:30' },
];

// Slot ID 3 (16:30-17:00) is forbidden for mezun students
export const MEZUN_FORBIDDEN_SLOT = '3';

export const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];

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
  const gradeKey = grade === 10 ? 1 : grade === 20 ? 2 : grade;
  const name = gradeNames[grade] || `${grade}. Sınıf`;
  let type = '';
  if (grade === 3) {
    const sec = parseInt(section);
    type = sec <= 3 ? ' Sayısal' : ' Eşit Ağırlık';
  } else if (grade === 4) {
    const sec = parseInt(section);
    type = sec <= 5 ? ' Sayısal' : ' Eşit Ağırlık';
  }
  return `${name}${type} (${cls})`;
}
