import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type PortalRole = 'owner' | 'instructor' | 'student'
export type OgmuiGrade = 'O' | 'G' | 'M' | 'U' | 'I'
export type LessonKind = 'flight' | 'ground' | 'simulator' | 'review'
export type ResourceKind = 'document' | 'video' | 'link'

export interface PortalProfile {
  id: string
  email: string
  full_name: string
  role: PortalRole
  active: boolean
  created_at?: string
}

export interface AcsPublication {
  id: string
  code: string
  title: string
  revision: string
  effective_date: string | null
}

export interface AcsItem {
  id: string
  publication_id: string
  code: string
  area_of_operation: string
  task: string
  element_type: 'knowledge' | 'risk_management' | 'skill'
  description: string
  sort_order: number
}

export interface PortalCourse {
  id: string
  name: string
  short_name: string
  active: boolean
  created_at: string
}

export interface CourseVersion {
  id: string
  course_id: string
  acs_publication_id: string
  revision: number
  status: 'draft' | 'published' | 'retired'
  published_at: string | null
  created_at: string
}

export interface PortalPhase {
  id: string
  course_version_id: string
  phase_number: number
  title: string
  objective: string | null
  completion_standard: string | null
}

export interface PortalLesson {
  id: string
  phase_id: string
  lesson_number: number
  title: string
  kind: LessonKind
  objective: string
  completion_standard: string
  planned_ground_minutes: number
  planned_training_minutes: number
  preparation: string | null
}

export interface LessonAcsItem {
  lesson_id: string
  acs_item_id: string
  sort_order: number
}

export interface PortalEnrollment {
  id: string
  student_id: string
  instructor_id: string
  course_version_id: string
  status: 'active' | 'completed' | 'withdrawn'
  enrolled_at: string
  completed_at: string | null
}

export interface LessonAttempt {
  id: string
  enrollment_id: string
  lesson_id: string
  attempt_number: number
  conducted_at: string
  instructor_id: string
  ground_minutes: number
  training_minutes: number
  flight_minutes: number
  simulator_minutes: number
  opened_at: string
  closed_at: string | null
  what_worked: string | null
  what_did_not_work: string | null
  corrective_action: string | null
  next_lesson_preparation: string | null
  status: 'draft' | 'published'
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface GradeRecord {
  id: string
  lesson_attempt_id: string
  acs_item_id: string
  grade: OgmuiGrade
  instructor_comment: string | null
}

export interface LessonAttemptItem {
  id: string
  lesson_attempt_id: string
  acs_item_id: string
  source: 'planned' | 'carryover_incomplete' | 'repeat_unsatisfactory'
  remediation_requirement_id: string | null
  sort_order: number
  created_at: string
}

export interface RemediationRequirement {
  id: string
  enrollment_id: string
  acs_item_id: string
  source_attempt_id: string
  required_lesson_id: string | null
  reason: 'U' | 'I'
  opened_at: string
  resolved_at: string | null
  resolved_by_attempt_id: string | null
}

export interface PortalResource {
  id: string
  title: string
  kind: ResourceKind
  description: string | null
  storage_path: string | null
  external_url: string | null
  revision: string | null
  created_by: string
  active: boolean
  created_at: string
}

export interface ResourceAssignment {
  id: string
  resource_id: string
  course_version_id: string | null
  lesson_id: string | null
  enrollment_id: string | null
  lesson_attempt_id: string | null
  required: boolean
  assigned_at: string
}

export interface CourseChangeEvent {
  id: number
  entity_type: 'course' | 'course_version' | 'phase' | 'lesson' | 'lesson_acs_item'
  entity_id: string
  course_id: string | null
  course_version_id: string | null
  action: 'baseline' | 'created' | 'updated' | 'deleted'
  changed_by: string | null
  changed_at: string
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
}

export interface TrainingAuditEvent {
  id: number
  entity_type: 'enrollment' | 'lesson_attempt' | 'attempt_item' | 'grade' | 'remediation'
  entity_id: string
  enrollment_id: string | null
  student_id: string | null
  action: 'baseline' | 'created' | 'updated' | 'deleted'
  changed_by: string | null
  changed_at: string
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
}

export interface StaffWorkspace {
  profiles: PortalProfile[]
  students: PortalProfile[]
  courses: PortalCourse[]
  versions: CourseVersion[]
  publications: AcsPublication[]
  phases: PortalPhase[]
  lessons: PortalLesson[]
  acsItems: AcsItem[]
  lessonAcsItems: LessonAcsItem[]
  enrollments: PortalEnrollment[]
  attempts: LessonAttempt[]
  attemptItems: LessonAttemptItem[]
  grades: GradeRecord[]
  remediations: RemediationRequirement[]
  resources: PortalResource[]
  assignments: ResourceAssignment[]
  courseChanges: CourseChangeEvent[]
  trainingAudit: TrainingAuditEvent[]
  stats: { students: number; activeEnrollments: number; courses: number; draftGradeSheets: number }
}

export interface StudentWorkspace {
  enrollment: PortalEnrollment
  instructor: PortalProfile | null
  course: PortalCourse
  version: CourseVersion
  publication: AcsPublication
  phases: PortalPhase[]
  lessons: PortalLesson[]
  acsItems: AcsItem[]
  lessonAcsItems: LessonAcsItem[]
  attempts: LessonAttempt[]
  attemptItems: LessonAttemptItem[]
  grades: GradeRecord[]
  remediations: RemediationRequirement[]
  resources: PortalResource[]
  assignments: ResourceAssignment[]
}

function client() {
  if (!supabase) throw new Error('The portal backend is not configured.')
  return supabase
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

function isMissingTable(error: { code?: string } | null) {
  return Boolean(error && ['42P01', 'PGRST205'].includes(error.code ?? ''))
}

export async function loadProfile(user: User): Promise<PortalProfile> {
  const { data, error } = await client().from('profiles').select('id, email, full_name, role, active, created_at').eq('id', user.id).single()
  throwIfError(error)
  return data as PortalProfile
}

export async function loadStaffWorkspace(): Promise<StaffWorkspace> {
  const db = client()
  const results = await Promise.all([
    db.from('profiles').select('id, email, full_name, role, active, created_at').order('created_at', { ascending: false }),
    db.from('courses').select('*').order('created_at', { ascending: false }),
    db.from('course_versions').select('*').order('revision', { ascending: false }),
    db.from('acs_publications').select('*').order('created_at', { ascending: false }),
    db.from('phases').select('*').order('phase_number'),
    db.from('lessons').select('*').order('lesson_number'),
    db.from('acs_items').select('*').order('sort_order'),
    db.from('lesson_acs_items').select('*').order('sort_order'),
    db.from('enrollments').select('*').order('enrolled_at', { ascending: false }),
    db.from('lesson_attempts').select('*').order('conducted_at', { ascending: false }),
    db.from('grades').select('id, lesson_attempt_id, acs_item_id, grade, instructor_comment'),
    db.from('resources').select('*').eq('active', true).order('created_at', { ascending: false }),
    db.from('resource_assignments').select('*').order('assigned_at', { ascending: false }),
    db.from('course_change_log').select('*').order('changed_at', { ascending: false }).limit(250),
    db.from('lesson_attempt_items').select('*').order('sort_order'),
    db.from('remediation_requirements').select('*').order('opened_at', { ascending: false }),
    db.from('training_audit_log').select('*').order('changed_at', { ascending: false }).limit(500),
  ])

  results.slice(0, 13).forEach((result) => throwIfError(result.error))
  const historyResult = results[13]
  if (historyResult.error && !isMissingTable(historyResult.error)) throwIfError(historyResult.error)
  results.slice(14).forEach((result) => { if (result.error && !isMissingTable(result.error)) throwIfError(result.error) })
  const profiles = (results[0].data ?? []) as PortalProfile[]
  const courses = (results[1].data ?? []) as PortalCourse[]
  const enrollments = (results[8].data ?? []) as PortalEnrollment[]
  const attempts = (results[9].data ?? []) as LessonAttempt[]

  return {
    profiles,
    students: profiles.filter((profile) => profile.role === 'student'),
    courses,
    versions: (results[2].data ?? []) as CourseVersion[],
    publications: (results[3].data ?? []) as AcsPublication[],
    phases: (results[4].data ?? []) as PortalPhase[],
    lessons: (results[5].data ?? []) as PortalLesson[],
    acsItems: (results[6].data ?? []) as AcsItem[],
    lessonAcsItems: (results[7].data ?? []) as LessonAcsItem[],
    enrollments,
    attempts,
    attemptItems: results[14].error ? [] : (results[14].data ?? []) as LessonAttemptItem[],
    grades: (results[10].data ?? []) as GradeRecord[],
    remediations: results[15].error ? [] : (results[15].data ?? []) as RemediationRequirement[],
    resources: (results[11].data ?? []) as PortalResource[],
    assignments: (results[12].data ?? []) as ResourceAssignment[],
    courseChanges: historyResult.error ? [] : (historyResult.data ?? []) as CourseChangeEvent[],
    trainingAudit: results[16].error ? [] : (results[16].data ?? []) as TrainingAuditEvent[],
    stats: {
      students: profiles.filter((profile) => profile.role === 'student').length,
      activeEnrollments: enrollments.filter((enrollment) => enrollment.status === 'active').length,
      courses: courses.filter((course) => course.active).length,
      draftGradeSheets: attempts.filter((attempt) => attempt.status === 'draft').length,
    },
  }
}

export async function loadStudentWorkspace(studentId: string): Promise<StudentWorkspace | null> {
  const db = client()
  const enrollmentResult = await db.from('enrollments').select('*').eq('student_id', studentId).eq('status', 'active').order('enrolled_at', { ascending: false }).limit(1).maybeSingle()
  throwIfError(enrollmentResult.error)
  if (!enrollmentResult.data) return null
  const enrollment = enrollmentResult.data as PortalEnrollment

  const [versionResult, instructorResult] = await Promise.all([
    db.from('course_versions').select('*').eq('id', enrollment.course_version_id).single(),
    db.from('profiles').select('id, email, full_name, role, active, created_at').eq('id', enrollment.instructor_id).maybeSingle(),
  ])
  throwIfError(versionResult.error)
  throwIfError(instructorResult.error)
  const version = versionResult.data as CourseVersion

  const [courseResult, publicationResult, phasesResult, attemptsResult] = await Promise.all([
    db.from('courses').select('*').eq('id', version.course_id).single(),
    db.from('acs_publications').select('*').eq('id', version.acs_publication_id).single(),
    db.from('phases').select('*').eq('course_version_id', version.id).order('phase_number'),
    db.from('lesson_attempts').select('*').eq('enrollment_id', enrollment.id).order('conducted_at', { ascending: false }),
  ])
  ;[courseResult.error, publicationResult.error, phasesResult.error, attemptsResult.error].forEach(throwIfError)
  const phases = (phasesResult.data ?? []) as PortalPhase[]
  const phaseIds = phases.map((phase) => phase.id)
  const lessonsResult = phaseIds.length ? await db.from('lessons').select('*').in('phase_id', phaseIds).order('lesson_number') : { data: [], error: null }
  throwIfError(lessonsResult.error)
  const lessons = (lessonsResult.data ?? []) as PortalLesson[]
  const lessonIds = lessons.map((lesson) => lesson.id)
  const attempts = (attemptsResult.data ?? []) as LessonAttempt[]
  const attemptIds = attempts.map((attempt) => attempt.id)

  const [lessonAcsResult, gradesResult, assignmentResult, attemptItemsResult, remediationResult] = await Promise.all([
    lessonIds.length ? db.from('lesson_acs_items').select('*').in('lesson_id', lessonIds).order('sort_order') : Promise.resolve({ data: [], error: null }),
    attemptIds.length ? db.from('grades').select('id, lesson_attempt_id, acs_item_id, grade, instructor_comment').in('lesson_attempt_id', attemptIds) : Promise.resolve({ data: [], error: null }),
    db.from('resource_assignments').select('*').order('assigned_at', { ascending: false }),
    attemptIds.length ? db.from('lesson_attempt_items').select('*').in('lesson_attempt_id', attemptIds).order('sort_order') : Promise.resolve({ data: [], error: null }),
    db.from('remediation_requirements').select('*').eq('enrollment_id', enrollment.id).order('opened_at', { ascending: false }),
  ])
  ;[lessonAcsResult.error, gradesResult.error, assignmentResult.error].forEach(throwIfError)
  if (attemptItemsResult.error && !isMissingTable(attemptItemsResult.error)) throwIfError(attemptItemsResult.error)
  if (remediationResult.error && !isMissingTable(remediationResult.error)) throwIfError(remediationResult.error)
  const lessonAcsItems = (lessonAcsResult.data ?? []) as LessonAcsItem[]
  const attemptItems = attemptItemsResult.error ? [] : (attemptItemsResult.data ?? []) as LessonAttemptItem[]
  const acsIds = [...new Set([...lessonAcsItems.map((item) => item.acs_item_id), ...attemptItems.map((item) => item.acs_item_id)])]
  const acsResult = acsIds.length ? await db.from('acs_items').select('*').in('id', acsIds).order('sort_order') : { data: [], error: null }
  throwIfError(acsResult.error)

  const allAssignments = (assignmentResult.data ?? []) as ResourceAssignment[]
  const assignments = allAssignments.filter((assignment) =>
    assignment.enrollment_id === enrollment.id || assignment.course_version_id === version.id ||
    (assignment.lesson_id ? lessonIds.includes(assignment.lesson_id) : false) ||
    (assignment.lesson_attempt_id ? attemptIds.includes(assignment.lesson_attempt_id) : false),
  )
  const resourceIds = [...new Set(assignments.map((assignment) => assignment.resource_id))]
  const resourceResult = resourceIds.length ? await db.from('resources').select('*').in('id', resourceIds).eq('active', true).order('created_at', { ascending: false }) : { data: [], error: null }
  throwIfError(resourceResult.error)

  return {
    enrollment,
    instructor: instructorResult.data as PortalProfile | null,
    course: courseResult.data as PortalCourse,
    version,
    publication: publicationResult.data as AcsPublication,
    phases,
    lessons,
    acsItems: (acsResult.data ?? []) as AcsItem[],
    lessonAcsItems,
    attempts,
    attemptItems,
    grades: (gradesResult.data ?? []) as GradeRecord[],
    remediations: remediationResult.error ? [] : (remediationResult.data ?? []) as RemediationRequirement[],
    resources: (resourceResult.data ?? []) as PortalResource[],
    assignments,
  }
}

export async function createCourseWithVersion(input: { name: string; shortName: string; acsCode: string; acsTitle: string; acsRevision: string }) {
  const db = client()
  const code = input.acsCode.trim()
  const existing = await db.from('acs_publications').select('*').eq('code', code).maybeSingle()
  throwIfError(existing.error)
  let publication = existing.data as AcsPublication | null
  if (!publication) {
    const inserted = await db.from('acs_publications').insert({ code, title: input.acsTitle.trim(), revision: input.acsRevision.trim() }).select('*').single()
    throwIfError(inserted.error)
    publication = inserted.data as AcsPublication
  }
  const courseResult = await db.from('courses').insert({ name: input.name.trim(), short_name: input.shortName.trim() }).select('*').single()
  throwIfError(courseResult.error)
  const course = courseResult.data as PortalCourse
  const versionResult = await db.from('course_versions').insert({ course_id: course.id, acs_publication_id: publication.id, revision: 1, status: 'draft' }).select('*').single()
  throwIfError(versionResult.error)
  return { course, version: versionResult.data as CourseVersion, publication }
}

async function requireDraftVersion(versionId: string) {
  const result = await client().from('course_versions').select('status').eq('id', versionId).single()
  throwIfError(result.error)
  if (!result.data) throw new Error('Course revision not found.')
  if (result.data.status !== 'draft') throw new Error('Published course revisions are locked. Create a new revision to make changes.')
}

export async function updateCourseDraft(input: { courseId: string; courseVersionId: string; name: string; shortName: string }) {
  const db = client()
  const version = await db.from('course_versions').select('status').eq('id', input.courseVersionId).eq('course_id', input.courseId).single()
  throwIfError(version.error)
  if (!version.data) throw new Error('Course revision not found.')
  if (version.data.status !== 'draft') throw new Error('Published course revisions are locked. Create a new revision to make changes.')
  const result = await db.from('courses').update({ name: input.name.trim(), short_name: input.shortName.trim() }).eq('id', input.courseId).select('*').single()
  throwIfError(result.error)
  return result.data as PortalCourse
}

export async function updatePhase(input: { id: string; courseVersionId: string; phaseNumber: number; title: string; objective: string; completionStandard: string }) {
  await requireDraftVersion(input.courseVersionId)
  const result = await client().from('phases').update({
    phase_number: input.phaseNumber,
    title: input.title.trim(),
    objective: input.objective.trim() || null,
    completion_standard: input.completionStandard.trim() || null,
  }).eq('id', input.id).eq('course_version_id', input.courseVersionId).select('*').single()
  throwIfError(result.error)
  return result.data as PortalPhase
}

export async function updateLesson(input: { id: string; phaseId: string; courseVersionId: string; lessonNumber: number; title: string; kind: LessonKind; objective: string; completionStandard: string; plannedGroundMinutes: number; plannedTrainingMinutes: number; preparation: string }) {
  await requireDraftVersion(input.courseVersionId)
  const result = await client().from('lessons').update({
    lesson_number: input.lessonNumber,
    title: input.title.trim(),
    kind: input.kind,
    objective: input.objective.trim(),
    completion_standard: input.completionStandard.trim(),
    planned_ground_minutes: input.plannedGroundMinutes,
    planned_training_minutes: input.plannedTrainingMinutes,
    preparation: input.preparation.trim() || null,
  }).eq('id', input.id).eq('phase_id', input.phaseId).select('*').single()
  throwIfError(result.error)
  return result.data as PortalLesson
}

export async function addPhase(input: { courseVersionId: string; phaseNumber: number; title: string; objective: string; completionStandard: string }) {
  const result = await client().from('phases').insert({ course_version_id: input.courseVersionId, phase_number: input.phaseNumber, title: input.title.trim(), objective: input.objective.trim() || null, completion_standard: input.completionStandard.trim() || null }).select('*').single()
  throwIfError(result.error)
  return result.data as PortalPhase
}

export async function addLesson(input: { phaseId: string; lessonNumber: number; title: string; kind: LessonKind; objective: string; completionStandard: string; plannedGroundMinutes: number; plannedTrainingMinutes: number; preparation: string }) {
  const result = await client().from('lessons').insert({ phase_id: input.phaseId, lesson_number: input.lessonNumber, title: input.title.trim(), kind: input.kind, objective: input.objective.trim(), completion_standard: input.completionStandard.trim(), planned_ground_minutes: input.plannedGroundMinutes, planned_training_minutes: input.plannedTrainingMinutes, preparation: input.preparation.trim() || null }).select('*').single()
  throwIfError(result.error)
  return result.data as PortalLesson
}

export async function addAcsItemToLesson(input: { publicationId: string; lessonId: string; code: string; areaOfOperation: string; task: string; elementType: AcsItem['element_type']; description: string }) {
  const db = client()
  const code = input.code.trim()
  const existing = await db.from('acs_items').select('*').eq('publication_id', input.publicationId).eq('code', code).maybeSingle()
  throwIfError(existing.error)
  let item = existing.data as AcsItem | null
  if (!item) {
    const last = await db.from('acs_items').select('sort_order').eq('publication_id', input.publicationId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
    throwIfError(last.error)
    const inserted = await db.from('acs_items').insert({ publication_id: input.publicationId, code, area_of_operation: input.areaOfOperation.trim(), task: input.task.trim(), element_type: input.elementType, description: input.description.trim(), sort_order: (last.data?.sort_order ?? 0) + 1 }).select('*').single()
    throwIfError(inserted.error)
    item = inserted.data as AcsItem
  }
  const countResult = await db.from('lesson_acs_items').select('*', { count: 'exact', head: true }).eq('lesson_id', input.lessonId)
  throwIfError(countResult.error)
  const mapping = await db.from('lesson_acs_items').upsert({ lesson_id: input.lessonId, acs_item_id: item.id, sort_order: (countResult.count ?? 0) + 1 }, { onConflict: 'lesson_id,acs_item_id' })
  throwIfError(mapping.error)
  return item
}

export async function enrollStudent(input: { studentId: string; instructorId: string; courseVersionId: string }) {
  const existing = await client().from('enrollments').select('id').eq('student_id', input.studentId).eq('course_version_id', input.courseVersionId).eq('status', 'active').maybeSingle()
  throwIfError(existing.error)
  if (existing.data) throw new Error('This student already has an active enrollment in that course.')
  const result = await client().from('enrollments').insert({ student_id: input.studentId, instructor_id: input.instructorId, course_version_id: input.courseVersionId, status: 'active' }).select('*').single()
  throwIfError(result.error)
  return result.data as PortalEnrollment
}

export async function openLessonAttempt(input: { enrollmentId: string; lessonId: string; instructorId: string }) {
  const db = client()
  const alreadyOpen = await db.from('lesson_attempts').select('id, lesson_id').eq('enrollment_id', input.enrollmentId).eq('status', 'draft').maybeSingle()
  throwIfError(alreadyOpen.error)
  if (alreadyOpen.data) {
    if (alreadyOpen.data.lesson_id === input.lessonId) return alreadyOpen.data.id as string
    throw new Error('This student already has an open lesson. Close it before opening another.')
  }

  const [mappingResult, remediationResult, latestResult] = await Promise.all([
    db.from('lesson_acs_items').select('*').eq('lesson_id', input.lessonId).order('sort_order'),
    db.from('remediation_requirements').select('*').eq('enrollment_id', input.enrollmentId).is('resolved_at', null).order('opened_at'),
    db.from('lesson_attempts').select('attempt_number').eq('enrollment_id', input.enrollmentId).eq('lesson_id', input.lessonId).order('attempt_number', { ascending: false }).limit(1).maybeSingle(),
  ])
  throwIfError(mappingResult.error)
  throwIfError(remediationResult.error)
  throwIfError(latestResult.error)
  const mappings = (mappingResult.data ?? []) as LessonAcsItem[]
  const remediations = (remediationResult.data ?? []) as RemediationRequirement[]
  const requiredRepeat = remediations.find((requirement) => requirement.reason === 'U' && requirement.required_lesson_id !== input.lessonId)
  if (requiredRepeat) throw new Error('An Unsatisfactory result requires its assigned repeat lesson to be opened next.')

  const items = new Map<string, { acs_item_id: string; source: LessonAttemptItem['source']; remediation_requirement_id: string | null; sort_order: number }>()
  mappings.forEach((mapping) => items.set(mapping.acs_item_id, { acs_item_id: mapping.acs_item_id, source: 'planned', remediation_requirement_id: null, sort_order: mapping.sort_order }))
  remediations.forEach((requirement, index) => items.set(requirement.acs_item_id, {
    acs_item_id: requirement.acs_item_id,
    source: requirement.reason === 'U' ? 'repeat_unsatisfactory' : 'carryover_incomplete',
    remediation_requirement_id: requirement.id,
    sort_order: index - remediations.length,
  }))
  if (!items.size) throw new Error('Attach at least one ACS line item before opening this lesson.')

  const now = new Date().toISOString()
  const inserted = await db.from('lesson_attempts').insert({
    enrollment_id: input.enrollmentId,
    lesson_id: input.lessonId,
    attempt_number: (latestResult.data?.attempt_number ?? 0) + 1,
    conducted_at: now,
    opened_at: now,
    instructor_id: input.instructorId,
    status: 'draft',
  }).select('id').single()
  throwIfError(inserted.error)
  if (!inserted.data) throw new Error('The lesson could not be opened.')
  const attemptId = inserted.data.id as string
  const itemResult = await db.from('lesson_attempt_items').insert([...items.values()].map((item) => ({ ...item, lesson_attempt_id: attemptId })))
  if (itemResult.error) {
    await db.from('lesson_attempts').delete().eq('id', attemptId).eq('status', 'draft')
    throwIfError(itemResult.error)
  }
  return attemptId
}

export async function saveGradeSheet(input: { attemptId: string; conductedAt: string; groundMinutes: number; flightMinutes: number; simulatorMinutes: number; remarks: string; status: 'draft' | 'published'; grades: Array<{ acsItemId: string; grade: OgmuiGrade | ''; comment: string }> }) {
  const db = client()
  const selectedGrades = input.grades.filter((grade): grade is { acsItemId: string; grade: OgmuiGrade; comment: string } => Boolean(grade.grade))
  if (input.status === 'published' && selectedGrades.length !== input.grades.length) throw new Error('Grade every ACS line item before closing the lesson.')
  if (input.status === 'published' && input.groundMinutes + input.flightMinutes + input.simulatorMinutes <= 0) throw new Error('Enter ground, flight, or simulator time before closing the lesson.')
  const missingComment = selectedGrades.find((grade) => ['U', 'I'].includes(grade.grade) && !grade.comment.trim())
  if (missingComment) throw new Error('Unsatisfactory and Incomplete grades require an instructor comment.')

  if (selectedGrades.length) {
    const gradeResult = await db.from('grades').upsert(selectedGrades.map((grade) => ({ lesson_attempt_id: input.attemptId, acs_item_id: grade.acsItemId, grade: grade.grade, instructor_comment: grade.comment.trim() || null })), { onConflict: 'lesson_attempt_id,acs_item_id' })
    throwIfError(gradeResult.error)
  }

  const closedAt = input.status === 'published' ? new Date().toISOString() : null
  const attemptResult = await db.from('lesson_attempts').update({
    conducted_at: new Date(input.conductedAt).toISOString(),
    ground_minutes: input.groundMinutes,
    flight_minutes: input.flightMinutes,
    simulator_minutes: input.simulatorMinutes,
    training_minutes: input.flightMinutes + input.simulatorMinutes,
    what_worked: input.remarks.trim() || null,
    status: input.status,
    closed_at: closedAt,
    published_at: closedAt,
  }).eq('id', input.attemptId).eq('status', 'draft').select('id').single()
  throwIfError(attemptResult.error)
  return input.attemptId
}

type AssignmentTarget = { course_version_id: string } | { lesson_id: string } | { enrollment_id: string }

async function assignResource(resourceId: string, target: AssignmentTarget, required: boolean) {
  const result = await client().from('resource_assignments').insert({ resource_id: resourceId, ...target, required })
  throwIfError(result.error)
}

export async function createLinkedResource(input: { title: string; kind: ResourceKind; description: string; revision: string; externalUrl: string; createdBy: string; target: AssignmentTarget; required: boolean }) {
  const result = await client().from('resources').insert({ title: input.title.trim(), kind: input.kind, description: input.description.trim() || null, external_url: input.externalUrl.trim(), revision: input.revision.trim() || null, created_by: input.createdBy }).select('*').single()
  throwIfError(result.error)
  const resource = result.data as PortalResource
  await assignResource(resource.id, input.target, input.required)
  return resource
}

export async function uploadTrainingResource(input: { title: string; kind: Exclude<ResourceKind, 'link'>; description: string; revision: string; file: File; createdBy: string; target: AssignmentTarget; required: boolean }) {
  const db = client()
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')
  const storagePath = `${input.createdBy}/${crypto.randomUUID()}-${safeName}`
  const upload = await db.storage.from('training-resources').upload(storagePath, input.file, { contentType: input.file.type || undefined })
  throwIfError(upload.error)
  const result = await db.from('resources').insert({ title: input.title.trim(), kind: input.kind, description: input.description.trim() || null, storage_path: storagePath, revision: input.revision.trim() || null, created_by: input.createdBy }).select('*').single()
  throwIfError(result.error)
  const resource = result.data as PortalResource
  await assignResource(resource.id, input.target, input.required)
  return resource
}

export async function getResourceUrl(resource: PortalResource) {
  if (resource.external_url) return resource.external_url
  if (!resource.storage_path) throw new Error('This resource has no file attached.')
  const result = await client().storage.from('training-resources').createSignedUrl(resource.storage_path, 60 * 10)
  throwIfError(result.error)
  if (!result.data) throw new Error('A secure resource link could not be created.')
  return result.data.signedUrl
}
