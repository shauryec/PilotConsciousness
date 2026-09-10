export type OgmuiGrade = 'O' | 'G' | 'M' | 'U' | 'I'

export type LessonStatus = 'complete' | 'current' | 'upcoming'

export interface Lesson {
  id: string
  code: string
  title: string
  phase: number
  status: LessonStatus
  date?: string
  summary: string
  grades?: Array<{ code: string; item: string; grade: OgmuiGrade; comment: string }>
}

export const student = {
  name: 'Alex Morgan',
  initials: 'AM',
  course: 'Private Pilot — Airplane',
  aircraft: 'Cirrus SR20',
  airport: 'KFFZ',
  instructor: 'Shaurye Chakravarty',
  completedLessons: 8,
  totalLessons: 31,
  currentPhase: 1,
}

export const phases = [
  { number: 1, title: 'Foundations', status: 'current', completed: 8, total: 11 },
  { number: 2, title: 'Navigation & Integration', status: 'upcoming', completed: 0, total: 12 },
  { number: 3, title: 'Practical Test Preparation', status: 'upcoming', completed: 0, total: 8 },
] as const

export const lessons: Lesson[] = [
  {
    id: 'l07',
    code: 'Lesson 07',
    title: 'Normal and Crosswind Landings',
    phase: 1,
    status: 'complete',
    date: 'Sep 3, 2026',
    summary: 'Completed. Crosswind correction and centerline control improved throughout the lesson.',
    grades: [
      { code: 'PA.IV.B.S2', item: 'Establish and maintain a stabilized approach', grade: 'G', comment: 'Maintained a consistent sight picture and corrected early.' },
      { code: 'PA.IV.B.S7', item: 'Touch down at a proper pitch attitude', grade: 'M', comment: 'One firm touchdown; deviation identified and corrected on the following approach.' },
    ],
  },
  {
    id: 'l08',
    code: 'Lesson 08',
    title: 'Traffic Pattern Integration',
    phase: 1,
    status: 'complete',
    date: 'Sep 6, 2026',
    summary: 'Completed. Workload management remained strong with increased traffic and runway changes.',
    grades: [
      { code: 'PA.III.B.R1', item: 'Collision hazards and runway incursion avoidance', grade: 'G', comment: 'Maintained traffic awareness and verbalized the developing conflict.' },
      { code: 'PA.III.B.S3', item: 'Correct traffic pattern procedures', grade: 'G', comment: 'Spacing, configuration, and radio calls were timely.' },
    ],
  },
  {
    id: 'l09',
    code: 'Lesson 09',
    title: 'Slow Flight and Stalls',
    phase: 1,
    status: 'current',
    summary: 'Next lesson. Review aerodynamic indications, recognition, recovery, and risk controls.',
  },
  {
    id: 'l10',
    code: 'Lesson 10',
    title: 'Emergency Operations',
    phase: 1,
    status: 'upcoming',
    summary: 'Engine failure priorities, emergency approach planning, and checklist use.',
  },
  {
    id: 'l11',
    code: 'Lesson 11',
    title: 'Phase Review',
    phase: 1,
    status: 'upcoming',
    summary: 'Integrated review of Phase 1 knowledge, risk management, and flight skills.',
  },
]

export const attentionItems = [
  { code: 'PA.IV.B.S7', label: 'Normal landing touchdown', grade: 'M' as OgmuiGrade, note: 'Corrected promptly on the following approach' },
  { code: 'PA.VII.B.S4', label: 'Power-off stall recovery', grade: 'I' as OgmuiGrade, note: 'Scheduled for Lesson 09' },
  { code: 'PA.IX.A.S3', label: 'Emergency approach and landing', grade: 'I' as OgmuiGrade, note: 'Scheduled for Lesson 10' },
]

export const resources = [
  { type: 'Document', title: 'Lesson 09 Briefing Guide', meta: 'PDF · Assigned today', tag: 'Required' },
  { type: 'Video', title: 'Stall Recognition in the SR20', meta: '08:42 · Assigned by instructor', tag: 'Required' },
  { type: 'Document', title: 'Private Pilot Course Syllabus', meta: 'Revision 1 · Sep 2026', tag: 'Course' },
  { type: 'Document', title: 'Cirrus SR20 Normal Procedures', meta: 'PDF · Reference', tag: 'Aircraft' },
  { type: 'Video', title: 'Airspeed, Load Factor, and Stall Margin', meta: '12:18 · Reference', tag: 'Aerodynamics' },
]
