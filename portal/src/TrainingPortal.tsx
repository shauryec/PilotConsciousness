import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import {
  addAcsItemToLesson,
  addLesson,
  addPhase,
  createCourseWithVersion,
  createLinkedResource,
  enrollStudent,
  getResourceUrl,
  openLessonAttempt,
  saveGradeSheet,
  updateAcsItem,
  updateClosedGradeSheet,
  updateCourseDraft,
  updateEnrollment,
  updateLesson,
  updatePhase,
  updateResource,
  updateStudentProfile,
  uploadTrainingResource,
  type AcsItem,
  type CourseChangeEvent,
  type LessonAttemptItem,
  type LessonAttempt,
  type OgmuiGrade,
  type PortalLesson,
  type PortalProfile,
  type PortalResource,
  type StaffWorkspace,
  type StudentWorkspace,
  type TrainingAuditEvent,
} from './lib/portal'
import { supabase } from './lib/supabase'

const gradeLabels: Record<OgmuiGrade, string> = {
  O: 'Outstanding',
  G: 'Good',
  M: 'Minimal',
  U: 'Unsatisfactory',
  I: 'Incomplete',
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'PC'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function localDateTimeValue(value = new Date()) {
  const offset = value.getTimezoneOffset()
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

function hoursFromMinutes(minutes: number) {
  return Number(((minutes ?? 0) / 60).toFixed(1))
}

function minutesFromHours(hours: number) {
  return Math.round(Math.max(0, hours || 0) * 60)
}

function elapsedTenths(openedAt: string, closedAt?: string | null, now = Date.now()) {
  const start = new Date(openedAt).getTime()
  const end = closedAt ? new Date(closedAt).getTime() : now
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / (6 * 60_000)) / 10)
}

function Grade({ value }: { value: OgmuiGrade }) {
  return <span className={`grade grade-${value.toLowerCase()}`} title={gradeLabels[value]}>{value}</span>
}

function Brand() {
  return <div className="brand-lockup"><span className="brand-star">✦</span><div><strong>Pilot Consciousness</strong><small>Training Portal</small></div></div>
}

function EmptyCollection({ label, detail }: { label: string; detail: string }) {
  return <div className="collection-empty"><span>—</span><div><strong>{label}</strong><p>{detail}</p></div></div>
}

type Runner = <T>(action: () => Promise<T>, success: string) => Promise<T | undefined>

type StaffView = 'overview' | 'students' | 'courses' | 'lessons' | 'library' | 'audit'

const staffNavItems: Array<{ id: StaffView; label: string; short: string }> = [
  { id: 'overview', label: 'Overview', short: 'OV' },
  { id: 'students', label: 'Students', short: 'ST' },
  { id: 'courses', label: 'Courses', short: 'CR' },
  { id: 'lessons', label: 'Lessons', short: 'LS' },
  { id: 'library', label: 'Resource Library', short: 'RL' },
  { id: 'audit', label: 'Audit Log', short: 'AL' },
]

function courseName(workspace: StaffWorkspace, versionId: string) {
  const version = workspace.versions.find((entry) => entry.id === versionId)
  const course = workspace.courses.find((entry) => entry.id === version?.course_id)
  return course ? `${course.name} · Revision ${version?.revision}` : 'Unknown course'
}

function studentName(workspace: StaffWorkspace, studentId: string) {
  return workspace.profiles.find((entry) => entry.id === studentId)?.full_name ?? 'Unknown student'
}

function lessonName(workspace: StaffWorkspace, lessonId: string) {
  const lesson = workspace.lessons.find((entry) => entry.id === lessonId)
  return lesson ? `Lesson ${lesson.lesson_number} · ${lesson.title}` : 'Unknown lesson'
}

const historyFields: Record<CourseChangeEvent['entity_type'], string[]> = {
  course: ['name', 'short_name', 'active'],
  course_version: ['revision', 'status', 'published_at'],
  phase: ['phase_number', 'title', 'objective', 'completion_standard'],
  lesson: ['lesson_number', 'title', 'kind', 'objective', 'completion_standard', 'planned_ground_minutes', 'planned_training_minutes', 'preparation'],
  lesson_acs_item: ['sort_order'],
  acs_publication: ['code', 'title', 'revision', 'effective_date'],
  acs_item: ['code', 'area_of_operation', 'task', 'element_type', 'description', 'sort_order'],
}

const historyFieldLabels: Record<string, string> = {
  name: 'Course name',
  short_name: 'Short name',
  active: 'Active',
  revision: 'Revision',
  status: 'Status',
  published_at: 'Published',
  phase_number: 'Phase number',
  title: 'Title',
  objective: 'Objective',
  completion_standard: 'Completion standard',
  lesson_number: 'Lesson number',
  kind: 'Lesson type',
  planned_ground_minutes: 'Ground minutes',
  planned_training_minutes: 'Training minutes',
  preparation: 'Student preparation',
  sort_order: 'ACS order',
  code: 'Code',
  area_of_operation: 'Area of operation',
  task: 'Task',
  element_type: 'Element type',
  description: 'Description',
  effective_date: 'Effective date',
}

function historyValue(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return 'Not set'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (field.endsWith('_at') && typeof value === 'string') return formatDateTime(value)
  if (['ground_minutes', 'flight_minutes', 'simulator_minutes'].includes(field) && typeof value === 'number') return `${hoursFromMinutes(value).toFixed(1)} hr`
  return String(value)
}

function historyDetails(event: CourseChangeEvent) {
  const before = event.before_data ?? {}
  const after = event.after_data ?? {}
  return historyFields[event.entity_type]
    .filter((field) => event.action !== 'updated' || JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }))
}

function historyEntityName(event: CourseChangeEvent, workspace: StaffWorkspace) {
  const snapshot = event.after_data ?? event.before_data ?? {}
  if (event.entity_type === 'course') return String(snapshot.name ?? 'Course')
  if (event.entity_type === 'course_version') return `Course revision ${snapshot.revision ?? ''}`.trim()
  if (event.entity_type === 'phase') return `Phase ${snapshot.phase_number ?? ''} · ${snapshot.title ?? 'Untitled'}`
  if (event.entity_type === 'lesson') return `Lesson ${snapshot.lesson_number ?? ''} · ${snapshot.title ?? 'Untitled'}`
  if (event.entity_type === 'acs_publication') return `ACS publication · ${snapshot.code ?? ''}`
  if (event.entity_type === 'acs_item') return `ACS item · ${snapshot.code ?? ''}`
  const item = workspace.acsItems.find((entry) => entry.id === snapshot.acs_item_id)
  const lesson = workspace.lessons.find((entry) => entry.id === snapshot.lesson_id)
  return `${item?.code ?? 'ACS line item'} · ${lesson ? `Lesson ${lesson.lesson_number}` : 'lesson mapping'}`
}

const trainingHistoryFields: Record<TrainingAuditEvent['entity_type'], string[]> = {
  enrollment: ['status', 'enrolled_at', 'completed_at'],
  lesson_attempt: ['attempt_number', 'status', 'opened_at', 'conducted_at', 'closed_at', 'ground_minutes', 'flight_minutes', 'simulator_minutes', 'what_worked', 'what_did_not_work', 'corrective_action', 'next_lesson_preparation'],
  attempt_item: ['source', 'sort_order'],
  grade: ['grade', 'instructor_comment'],
  remediation: ['reason', 'opened_at', 'resolved_at'],
  profile: ['email', 'full_name', 'role', 'active'],
  resource: ['title', 'kind', 'description', 'revision', 'active'],
  resource_assignment: ['required', 'assigned_at'],
}

Object.assign(historyFieldLabels, {
  enrolled_at: 'Enrolled',
  completed_at: 'Course completed',
  attempt_number: 'Attempt',
  opened_at: 'Opened',
  conducted_at: 'Conducted',
  closed_at: 'Closed',
  ground_minutes: 'Ground hours',
  flight_minutes: 'Flight hours',
  simulator_minutes: 'Simulator hours',
  what_worked: 'Remarks',
  what_did_not_work: 'What did not work',
  corrective_action: 'Corrective action',
  next_lesson_preparation: 'Next preparation',
  source: 'Line-item source',
  grade: 'OGMUI grade',
  instructor_comment: 'Instructor comment',
  reason: 'Open requirement',
  resolved_at: 'Resolved',
  email: 'Email',
  full_name: 'Full name',
  role: 'Role',
  required: 'Required',
  assigned_at: 'Assigned',
})

function trainingHistoryDetails(event: TrainingAuditEvent) {
  const before = event.before_data ?? {}
  const after = event.after_data ?? {}
  return trainingHistoryFields[event.entity_type]
    .filter((field) => event.action !== 'updated' || JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }))
}

function trainingEntityName(event: TrainingAuditEvent, workspace: StaffWorkspace) {
  const snapshot = event.after_data ?? event.before_data ?? {}
  if (event.entity_type === 'enrollment') return `Enrollment · ${studentName(workspace, event.student_id ?? '')}`
  if (event.entity_type === 'lesson_attempt') return `${lessonName(workspace, String(snapshot.lesson_id ?? ''))} · Attempt ${snapshot.attempt_number ?? ''}`
  if (event.entity_type === 'grade') return `Grade · ${workspace.acsItems.find((item) => item.id === snapshot.acs_item_id)?.code ?? 'ACS line item'}`
  if (event.entity_type === 'attempt_item') return `Lesson line item · ${workspace.acsItems.find((item) => item.id === snapshot.acs_item_id)?.code ?? 'ACS'}`
  if (event.entity_type === 'profile') return `Student profile · ${snapshot.full_name ?? snapshot.email ?? ''}`
  if (event.entity_type === 'resource') return `Resource · ${snapshot.title ?? ''}`
  if (event.entity_type === 'resource_assignment') return 'Resource assignment'
  return `${snapshot.reason === 'U' ? 'Repeat required' : 'Incomplete carryover'} · ${workspace.acsItems.find((item) => item.id === snapshot.acs_item_id)?.code ?? 'ACS line item'}`
}

function StaffOverview({ profile, workspace, navigate }: { profile: PortalProfile; workspace: StaffWorkspace; navigate: (view: StaffView) => void }) {
  const firstName = profile.full_name.split(/\s+/)[0] || profile.email
  const steps = [
    { done: workspace.courses.length > 0, label: 'Create a course', detail: 'Define its ACS publication and first revision.' },
    { done: workspace.phases.length > 0 && workspace.lessons.length > 0, label: 'Build the syllabus', detail: 'Add phases, lessons, objectives, standards, and ACS line items.' },
    { done: workspace.enrollments.length > 0, label: 'Enroll a student', detail: 'Connect an invited account to a course and instructor.' },
    { done: workspace.attempts.some((attempt) => attempt.status === 'published'), label: 'Close a lesson', detail: 'Record OGMUI grades and instructor remarks.' },
  ]

  return <>
    <section className="staff-welcome">
      <div><p className="eyebrow dark">{profile.role === 'owner' ? 'Owner workspace' : 'Instructor workspace'}</p><h1>Good morning, {firstName}.</h1><p className="lede">Build courses, manage enrollments, publish training records, and keep every ACS evaluation connected to the lesson where it occurred.</p></div>
      <span className="live-badge"><i />Live workspace</span>
    </section>
    <section className="metric-grid" aria-label="Portal totals">
      <article><span>Students</span><strong>{workspace.stats.students}</strong><small>invited accounts</small></article>
      <article><span>Active enrollments</span><strong>{workspace.stats.activeEnrollments}</strong><small>courses in progress</small></article>
      <article><span>Courses</span><strong>{workspace.stats.courses}</strong><small>active course families</small></article>
      <article><span>Open lessons</span><strong>{workspace.stats.draftGradeSheets}</strong><small>currently in progress</small></article>
    </section>
    <section className="staff-grid">
      <article className="panel setup-panel">
        <div className="panel-heading"><div><p className="eyebrow dark">Operational checklist</p><h2>Training system readiness</h2></div><strong>{steps.filter((step) => step.done).length} / {steps.length}</strong></div>
        <div className="setup-list">{steps.map((step) => <div className={step.done ? 'done' : ''} key={step.label}><span>{step.done ? '✓' : '○'}</span><div><strong>{step.label}</strong><p>{step.detail}</p></div></div>)}</div>
      </article>
      <article className="panel quick-actions">
        <p className="eyebrow dark">Work queue</p><h2>Continue building</h2>
        <button onClick={() => navigate('courses')}><span>01</span><div><strong>Course & syllabus</strong><small>Phases, lessons, and ACS line items</small></div><b>→</b></button>
        <button onClick={() => navigate('students')}><span>02</span><div><strong>Student enrollment</strong><small>Assign an invited account to a course</small></div><b>→</b></button>
        <button onClick={() => navigate('lessons')}><span>03</span><div><strong>Lesson operations</strong><small>Open, grade, and close a lesson</small></div><b>→</b></button>
      </article>
    </section>
  </>
}

function StaffGradeSheetRecord({ attempt, workspace, run }: { attempt: LessonAttempt; workspace: StaffWorkspace; run: Runner }) {
  const lesson = workspace.lessons.find((entry) => entry.id === attempt.lesson_id)
  const records = workspace.attemptItems.filter((entry) => entry.lesson_attempt_id === attempt.id).sort((a, b) => a.sort_order - b.sort_order)
  const existingGrades = workspace.grades.filter((entry) => entry.lesson_attempt_id === attempt.id)
  const itemIds = records.length ? records.map((entry) => entry.acs_item_id) : existingGrades.map((entry) => entry.acs_item_id)
  const items = itemIds.map((id) => workspace.acsItems.find((item) => item.id === id)).filter(Boolean) as AcsItem[]
  const [editing, setEditing] = useState(false)
  const [conductedAt, setConductedAt] = useState(localDateTimeValue(new Date(attempt.conducted_at)))
  const [groundHours, setGroundHours] = useState(hoursFromMinutes(attempt.ground_minutes ?? 0))
  const [flightHours, setFlightHours] = useState(hoursFromMinutes(attempt.flight_minutes ?? attempt.training_minutes ?? 0))
  const [simulatorHours, setSimulatorHours] = useState(hoursFromMinutes(attempt.simulator_minutes ?? 0))
  const [remarks, setRemarks] = useState(attempt.what_worked ?? '')
  const [drafts, setDrafts] = useState<Record<string, GradeDraft>>(() => Object.fromEntries(existingGrades.map((grade) => [grade.acs_item_id, { grade: grade.grade, comment: grade.instructor_comment ?? '' }])))

  useEffect(() => {
    setConductedAt(localDateTimeValue(new Date(attempt.conducted_at)))
    setGroundHours(hoursFromMinutes(attempt.ground_minutes ?? 0))
    setFlightHours(hoursFromMinutes(attempt.flight_minutes ?? attempt.training_minutes ?? 0))
    setSimulatorHours(hoursFromMinutes(attempt.simulator_minutes ?? 0))
    setRemarks(attempt.what_worked ?? '')
    setDrafts(Object.fromEntries(existingGrades.map((grade) => [grade.acs_item_id, { grade: grade.grade, comment: grade.instructor_comment ?? '' }])))
  }, [attempt.updated_at])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (items.some((item) => !drafts[item.id]?.grade)) return
    const result = await run(() => updateClosedGradeSheet({
      attemptId: attempt.id,
      conductedAt,
      groundMinutes: minutesFromHours(groundHours),
      flightMinutes: minutesFromHours(flightHours),
      simulatorMinutes: minutesFromHours(simulatorHours),
      remarks,
      grades: items.map((item) => ({ acsItemId: item.id, grade: drafts[item.id].grade as OgmuiGrade, comment: drafts[item.id].comment })),
    }), `Lesson ${lesson?.lesson_number ?? ''} grade sheet corrected. The prior values remain in the audit log.`)
    if (result) setEditing(false)
  }

  return <article className="student-grade-sheet panel"><header><div><small>{formatDate(attempt.conducted_at)} · Attempt {attempt.attempt_number}</small><h3>Lesson {lesson?.lesson_number} · {lesson?.title}</h3></div><div><span className="status-pill">Closed</span><button className="button button-outline compact-button" type="button" onClick={() => setEditing((value) => !value)}>{editing ? 'Cancel edit' : 'Edit record'}</button></div></header>{editing ? <form className="portal-form record-edit-form" onSubmit={save}><div className="form-grid record-time-grid"><label>Date & time<input type="datetime-local" value={conductedAt} onChange={(event) => setConductedAt(event.target.value)} /></label><label>Ground hours<input type="number" min="0" step="0.1" value={groundHours} onChange={(event) => setGroundHours(Number(event.target.value))} /></label><label>Flight hours<input type="number" min="0" step="0.1" value={flightHours} onChange={(event) => setFlightHours(Number(event.target.value))} /></label><label>Simulator hours<input type="number" min="0" step="0.1" value={simulatorHours} onChange={(event) => setSimulatorHours(Number(event.target.value))} /></label></div><label>Lesson remarks<textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label><div className="record-grade-edit">{items.map((item) => { const selected = drafts[item.id]?.grade ?? ''; const unresolved = selected === 'U' || selected === 'I'; return <div key={item.id}><div><code>{item.code}</code><strong>{item.description}</strong></div><div className="quick-grade" role="group" aria-label={`${item.code} grade`}>{(Object.keys(gradeLabels) as OgmuiGrade[]).map((grade) => <button className={`quick-grade-${grade.toLowerCase()} ${selected === grade ? 'selected' : ''}`} type="button" aria-pressed={selected === grade} title={gradeLabels[grade]} onClick={() => setDrafts((current) => ({ ...current, [item.id]: { grade, comment: current[item.id]?.comment ?? '' } }))} key={grade}>{grade}</button>)}</div><label>Remarks{unresolved && <b className="required-note">Required for U/I</b>}<textarea required={unresolved} value={drafts[item.id]?.comment ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { grade: current[item.id]?.grade ?? '', comment: event.target.value } }))} /></label></div>})}</div><div className="correction-note"><strong>This is an audited correction.</strong><span>The current grade sheet will update; its prior values, editor, and timestamp remain in the service log.</span></div><button className="button button-primary" type="submit">Save corrected record</button></form> : <><div className="record-facts"><span><b>{elapsedTenths(attempt.opened_at ?? attempt.created_at, attempt.closed_at).toFixed(1)}</b> elapsed</span><span><b>{hoursFromMinutes(attempt.ground_minutes).toFixed(1)}</b> ground</span><span><b>{hoursFromMinutes(attempt.flight_minutes ?? attempt.training_minutes).toFixed(1)}</b> flight</span><span><b>{hoursFromMinutes(attempt.simulator_minutes).toFixed(1)}</b> simulator</span></div>{attempt.what_worked && <div className="record-remarks"><span>Remarks</span><p>{attempt.what_worked}</p></div>}<div className="compact-grades">{existingGrades.map((grade) => { const item = workspace.acsItems.find((entry) => entry.id === grade.acs_item_id); return <div key={grade.id}><Grade value={grade.grade} /><div><code>{item?.code}</code><strong>{item?.description}</strong><p>{grade.instructor_comment || 'No line-item remarks entered.'}</p></div></div> })}</div></>}</article>
}

function StudentsView({ profile, workspace, run }: { profile: PortalProfile; workspace: StaffWorkspace; run: Runner }) {
  const [studentId, setStudentId] = useState(workspace.students[0]?.id ?? '')
  const [versionId, setVersionId] = useState(workspace.versions[0]?.id ?? '')
  const selectedStudent = workspace.students.find((student) => student.id === studentId) ?? workspace.students[0]
  const enrollments = workspace.enrollments.filter((entry) => entry.student_id === selectedStudent?.id)
  const instructors = workspace.profiles.filter((entry) => entry.role === 'owner' || entry.role === 'instructor')

  useEffect(() => {
    if (!studentId && workspace.students[0]) setStudentId(workspace.students[0].id)
    if (!versionId && workspace.versions[0]) setVersionId(workspace.versions[0].id)
  }, [studentId, versionId, workspace])

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!studentId || !versionId) return
    await run(() => enrollStudent({ studentId, courseVersionId: versionId, instructorId: profile.id }), 'Student enrolled. Their course dashboard is now active.')
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedStudent) return
    const data = new FormData(event.currentTarget)
    await run(() => updateStudentProfile({ id: selectedStudent.id, fullName: String(data.get('fullName')), active: data.get('active') === 'on' }), 'Student profile saved.')
  }

  async function saveEnrollment(event: FormEvent<HTMLFormElement>, enrollmentId: string) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await run(() => updateEnrollment({ id: enrollmentId, instructorId: String(data.get('instructorId')), courseVersionId: String(data.get('courseVersionId')), status: String(data.get('status')) as 'active' | 'completed' | 'withdrawn' }), 'Enrollment saved.')
  }

  return <section className="workspace-view"><div className="view-heading"><div><p className="eyebrow dark">Student files</p><h1>Students</h1><p>Profiles, enrollments, grade sheets, time, and corrections live with the student.</p></div></div><details className="panel create-drawer"><summary>Enroll a student</summary>{workspace.students.length && workspace.versions.length ? <form className="portal-form form-grid" onSubmit={enroll}><label>Student<select value={studentId} onChange={(event) => setStudentId(event.target.value)}>{workspace.students.map((student) => <option value={student.id} key={student.id}>{student.full_name} · {student.email}</option>)}</select></label><label>Course<select value={versionId} onChange={(event) => setVersionId(event.target.value)}>{workspace.versions.map((version) => <option value={version.id} key={version.id}>{courseName(workspace, version.id)}</option>)}</select></label><button className="button button-primary" type="submit">Activate enrollment</button></form> : <EmptyCollection label="Enrollment prerequisites" detail="A student account and course are required." />}</details><div className="student-file-layout"><aside className="panel student-directory"><p className="eyebrow dark">Roster</p>{workspace.students.map((student) => <button className={student.id === selectedStudent?.id ? 'active' : ''} onClick={() => setStudentId(student.id)} key={student.id}><span>{initials(student.full_name)}</span><div><strong>{student.full_name}</strong><small>{workspace.enrollments.filter((entry) => entry.student_id === student.id).length} enrollment(s)</small></div></button>)}</aside><div className="student-file">{selectedStudent ? <><article className="panel student-profile-head"><div><span className="profile-initials">{initials(selectedStudent.full_name)}</span><div><p className="eyebrow dark">Student profile</p><h2>{selectedStudent.full_name}</h2><p>{selectedStudent.email}</p></div></div><details className="edit-drawer"><summary>Edit profile</summary><form className="portal-form form-grid" onSubmit={saveProfile}><label>Full name<input name="fullName" defaultValue={selectedStudent.full_name} required /></label><div className="locked-field"><span>Login email</span><strong>{selectedStudent.email}</strong><small>Authentication email changes require account administration.</small></div><label className="check-field"><input name="active" type="checkbox" defaultChecked={selectedStudent.active} />Account active</label><button className="button button-primary" type="submit">Save profile</button></form></details></article>{enrollments.length ? enrollments.map((enrollment) => { const attempts = workspace.attempts.filter((attempt) => attempt.enrollment_id === enrollment.id); return <section className="enrollment-file" key={enrollment.id}><article className="panel enrollment-head"><div><p className="eyebrow dark">{enrollment.status} enrollment</p><h2>{courseName(workspace, enrollment.course_version_id)}</h2><small>Enrolled {formatDate(enrollment.enrolled_at)} · {attempts.filter((attempt) => attempt.status === 'published').length} closed lesson(s)</small></div><details className="edit-drawer"><summary>Edit enrollment</summary><form className="portal-form form-grid" onSubmit={(event) => void saveEnrollment(event, enrollment.id)}><label>Course revision<select name="courseVersionId" defaultValue={enrollment.course_version_id}>{workspace.versions.map((version) => <option value={version.id} key={version.id}>{courseName(workspace, version.id)}</option>)}</select></label><label>Instructor<select name="instructorId" defaultValue={enrollment.instructor_id}>{instructors.map((instructor) => <option value={instructor.id} key={instructor.id}>{instructor.full_name}</option>)}</select></label><label>Status<select name="status" defaultValue={enrollment.status}><option value="active">Active</option><option value="completed">Completed</option><option value="withdrawn">Withdrawn</option></select></label><button className="button button-primary" type="submit">Save enrollment</button></form></details></article>{attempts.some((attempt) => attempt.status === 'draft') && <div className="student-open-banner"><strong>Lesson currently open</strong><span>{lessonName(workspace, attempts.find((attempt) => attempt.status === 'draft')!.lesson_id)}</span></div>}<div className="student-grade-sheets"><div className="section-heading"><h2>Grade sheets</h2><span>{attempts.filter((attempt) => attempt.status === 'published').length} records</span></div>{attempts.filter((attempt) => attempt.status === 'published').map((attempt) => <StaffGradeSheetRecord attempt={attempt} workspace={workspace} run={run} key={attempt.id} />)}{!attempts.some((attempt) => attempt.status === 'published') && <EmptyCollection label="No grade sheets yet" detail="Closed lessons will appear in this student file." />}</div></section> }) : <EmptyCollection label="No enrollments" detail="Enroll this student in a course to begin their training file." />}</> : <EmptyCollection label="No students" detail="Invite the first student account to begin." />}</div></div></section>
}

function CoursesView({ workspace, run }: { workspace: StaffWorkspace; run: Runner }) {
  const [courseId, setCourseId] = useState(workspace.courses[0]?.id ?? '')
  const selectedCourse = workspace.courses.find((course) => course.id === courseId) ?? workspace.courses[0]
  const version = workspace.versions.find((entry) => entry.course_id === selectedCourse?.id)
  const publication = workspace.publications.find((entry) => entry.id === version?.acs_publication_id)
  const phases = workspace.phases.filter((phase) => phase.course_version_id === version?.id).sort((a, b) => a.phase_number - b.phase_number)
  const [phaseId, setPhaseId] = useState(phases[0]?.id ?? '')
  const currentPhase = phases.find((phase) => phase.id === phaseId) ?? phases[0]
  const lessons = workspace.lessons.filter((lesson) => phases.some((phase) => phase.id === lesson.phase_id)).sort((a, b) => a.lesson_number - b.lesson_number)
  const phaseLessons = workspace.lessons.filter((lesson) => lesson.phase_id === currentPhase?.id).sort((a, b) => a.lesson_number - b.lesson_number)
  const [lessonId, setLessonId] = useState(phaseLessons[0]?.id ?? '')
  const selectedLesson = workspace.lessons.find((lesson) => lesson.id === lessonId) ?? phaseLessons[0]
  const selectedMappings = workspace.lessonAcsItems.filter((mapping) => mapping.lesson_id === selectedLesson?.id)
  const selectedItems = selectedMappings.map((mapping) => workspace.acsItems.find((item) => item.id === mapping.acs_item_id)).filter(Boolean) as AcsItem[]
  const editable = Boolean(version)

  useEffect(() => {
    if (!courseId && workspace.courses[0]) setCourseId(workspace.courses[0].id)
    if (currentPhase && !phases.some((phase) => phase.id === phaseId)) setPhaseId(currentPhase.id)
    if (phaseLessons[0] && !phaseLessons.some((lesson) => lesson.id === lessonId)) setLessonId(phaseLessons[0].id)
  }, [courseId, currentPhase, lessonId, phaseId, phaseLessons, phases, workspace.courses])

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const created = await run(() => createCourseWithVersion({
      name: String(data.get('name')),
      shortName: String(data.get('shortName')),
      acsCode: String(data.get('acsCode')),
      acsTitle: String(data.get('acsTitle')),
      acsRevision: String(data.get('acsRevision')),
    }), 'Course revision created. Add its first phase and lesson.')
    if (created) { setCourseId(created.course.id); form.reset() }
  }

  async function createPhase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!version) return
    const form = event.currentTarget
    const data = new FormData(form)
    const created = await run(() => addPhase({ courseVersionId: version.id, phaseNumber: Number(data.get('phaseNumber')), title: String(data.get('title')), objective: String(data.get('objective')), completionStandard: String(data.get('completionStandard')) }), 'Phase added to the syllabus.')
    if (created) { setPhaseId(created.id); form.reset() }
  }

  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentPhase) return
    const form = event.currentTarget
    const data = new FormData(form)
    const created = await run(() => addLesson({
      phaseId: currentPhase.id,
      lessonNumber: Number(data.get('lessonNumber')),
      title: String(data.get('title')),
      kind: String(data.get('kind')) as 'flight' | 'ground' | 'simulator' | 'review',
      objective: String(data.get('objective')),
      completionStandard: String(data.get('completionStandard')),
      plannedGroundMinutes: Number(data.get('groundMinutes')),
      plannedTrainingMinutes: Number(data.get('trainingMinutes')),
      preparation: String(data.get('preparation')),
    }), 'Lesson added to the course.')
    if (created) { setLessonId(created.id); form.reset() }
  }

  async function createAcsItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!publication || !selectedLesson) return
    const form = event.currentTarget
    const data = new FormData(form)
    await run(() => addAcsItemToLesson({ publicationId: publication.id, lessonId: selectedLesson.id, code: String(data.get('code')), areaOfOperation: String(data.get('area')), task: String(data.get('task')), elementType: String(data.get('elementType')) as AcsItem['element_type'], description: String(data.get('description')) }), 'ACS line item attached to the lesson.')
    form.reset()
  }

  async function editCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCourse || !version) return
    const data = new FormData(event.currentTarget)
    await run(() => updateCourseDraft({
      courseId: selectedCourse.id,
      courseVersionId: version.id,
      publicationId: version.acs_publication_id,
      name: String(data.get('name')),
      shortName: String(data.get('shortName')),
      active: data.get('active') === 'on',
      versionStatus: String(data.get('versionStatus')) as 'draft' | 'published' | 'retired',
      acsCode: String(data.get('acsCode')),
      acsTitle: String(data.get('acsTitle')),
      acsRevision: String(data.get('acsRevision')),
    }), 'Course details saved.')
  }

  async function editPhase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentPhase || !version) return
    const data = new FormData(event.currentTarget)
    await run(() => updatePhase({
      id: currentPhase.id,
      courseVersionId: version.id,
      phaseNumber: Number(data.get('phaseNumber')),
      title: String(data.get('title')),
      objective: String(data.get('objective')),
      completionStandard: String(data.get('completionStandard')),
    }), `Phase ${Number(data.get('phaseNumber'))} saved.`)
  }

  async function editLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedLesson || !currentPhase || !version) return
    const data = new FormData(event.currentTarget)
    await run(() => updateLesson({
      id: selectedLesson.id,
      phaseId: currentPhase.id,
      courseVersionId: version.id,
      lessonNumber: Number(data.get('lessonNumber')),
      title: String(data.get('title')),
      kind: String(data.get('kind')) as PortalLesson['kind'],
      objective: String(data.get('objective')),
      completionStandard: String(data.get('completionStandard')),
      plannedGroundMinutes: Number(data.get('groundMinutes')),
      plannedTrainingMinutes: Number(data.get('trainingMinutes')),
      preparation: String(data.get('preparation')),
    }), `Lesson ${Number(data.get('lessonNumber'))} saved.`)
  }

  async function editAcsItem(event: FormEvent<HTMLFormElement>, item: AcsItem) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await run(() => updateAcsItem({
      id: item.id,
      code: String(data.get('code')),
      areaOfOperation: String(data.get('area')),
      task: String(data.get('task')),
      elementType: String(data.get('elementType')) as AcsItem['element_type'],
      description: String(data.get('description')),
    }), `${String(data.get('code'))} saved.`)
  }

  return <section className="workspace-view">
    <div className="view-heading"><div><p className="eyebrow dark">Syllabus builder</p><h1>Courses</h1><p>Each course is versioned, divided into phases and lessons, and evaluated against its ACS publication.</p></div></div>
    <details className="panel create-drawer" open={!workspace.courses.length}>
      <summary>Create a new course</summary>
      <form className="portal-form form-grid" onSubmit={createCourse}>
        <label>Course name<input name="name" placeholder="Private Pilot — Airplane" required /></label>
        <label>Short name<input name="shortName" placeholder="Private Pilot" required /></label>
        <label>ACS document code<input name="acsCode" defaultValue="FAA-S-ACS-6C" required /></label>
        <label>ACS revision<input name="acsRevision" defaultValue="6C" required /></label>
        <label className="wide">ACS publication title<input name="acsTitle" defaultValue="Private Pilot for Airplane Category Airman Certification Standards" required /></label>
        <button className="button button-primary" type="submit">Create course <span>→</span></button>
      </form>
    </details>
    {workspace.courses.length ? <div className="builder-layout">
      <aside className="panel course-catalog"><p className="eyebrow dark">Course catalog</p>{workspace.courses.map((course) => <button className={course.id === selectedCourse?.id ? 'active' : ''} onClick={() => { setCourseId(course.id); setPhaseId(''); setLessonId('') }} key={course.id}><span>{course.short_name.slice(0, 2).toUpperCase()}</span><div><strong>{course.name}</strong><small>{workspace.versions.filter((entry) => entry.course_id === course.id).length} revision</small></div></button>)}</aside>
      <div className="builder-main">
        <article className="panel builder-header"><div><p className="eyebrow dark">{publication?.code ?? 'ACS publication'}</p><h2>{selectedCourse?.name}</h2><p>{publication?.title} · Revision {version?.revision} · {version?.status}</p></div><span>{phases.length} phases · {lessons.length} lessons</span></article>
        {selectedCourse && version && editable && <details className="panel edit-drawer" key={`${selectedCourse.id}-${selectedCourse.name}-${selectedCourse.short_name}`}>
          <summary>Edit course details</summary>
          <form className="portal-form form-grid" onSubmit={editCourse}>
            <label>Course name<input name="name" defaultValue={selectedCourse.name} required /></label>
            <label>Short name<input name="shortName" defaultValue={selectedCourse.short_name} required /></label>
            <label>Course status<select name="versionStatus" defaultValue={version.status}><option value="draft">Draft</option><option value="published">Published</option><option value="retired">Retired</option></select></label>
            <label className="check-field"><input name="active" type="checkbox" defaultChecked={selectedCourse.active} />Course active</label>
            <label>ACS document code<input name="acsCode" defaultValue={publication?.code ?? ''} required /></label>
            <label>ACS revision<input name="acsRevision" defaultValue={publication?.revision ?? ''} required /></label>
            <label className="wide">ACS publication title<input name="acsTitle" defaultValue={publication?.title ?? ''} required /></label>
            <button className="button button-primary" type="submit">Save course changes</button>
          </form>
        </details>}
        {version && <div className="revision-lock" role="note"><strong>Changes are audited</strong><span>Edits update the working course while the service log preserves every previous value.</span></div>}
        <div className="builder-columns">
          <article className="panel builder-panel">
            <div className="panel-heading"><div><p className="eyebrow dark">Course structure</p><h2>Phases & lessons</h2></div></div>
            <div className="phase-tabs">{phases.map((phase) => <button className={phase.id === currentPhase?.id ? 'active' : ''} onClick={() => { setPhaseId(phase.id); setLessonId('') }} key={phase.id}><span>{String(phase.phase_number).padStart(2, '0')}</span>{phase.title}</button>)}</div>
            {currentPhase ? <>
              {editable && <details className="inline-create edit-entity" key={`${currentPhase.id}-${currentPhase.title}-${currentPhase.phase_number}`}>
                <summary>Edit phase {currentPhase.phase_number}</summary>
                <form className="portal-form" onSubmit={editPhase}>
                  <div className="form-grid"><label>Phase number<input name="phaseNumber" type="number" min="1" defaultValue={currentPhase.phase_number} required /></label><label>Phase title<input name="title" defaultValue={currentPhase.title} required /></label></div>
                  <label>Objective<textarea name="objective" defaultValue={currentPhase.objective ?? ''} /></label>
                  <label>Completion standard<textarea name="completionStandard" defaultValue={currentPhase.completion_standard ?? ''} /></label>
                  <button className="button button-primary" type="submit">Save phase changes</button>
                </form>
              </details>}
              <div className="lesson-builder-list">{phaseLessons.map((lesson) => <button className={lesson.id === selectedLesson?.id ? 'active' : ''} onClick={() => setLessonId(lesson.id)} key={lesson.id}><span>{lesson.lesson_number}</span><div><strong>{lesson.title}</strong><small>{lesson.kind} · {lesson.planned_ground_minutes + lesson.planned_training_minutes} planned min</small></div><b>→</b></button>)}</div>
              {editable && <details className="inline-create"><summary>Add lesson</summary><form className="portal-form" onSubmit={createLesson}>
                <div className="form-grid"><label>Lesson number<input name="lessonNumber" type="number" min="1" defaultValue={(phaseLessons.at(-1)?.lesson_number ?? 0) + 1} required /></label><label>Lesson type<select name="kind" defaultValue="flight"><option value="flight">Flight</option><option value="ground">Ground</option><option value="simulator">Simulator</option><option value="review">Review</option></select></label></div>
                <label>Lesson title<input name="title" required /></label><label>Objective<textarea name="objective" required /></label><label>Completion standard<textarea name="completionStandard" required /></label><label>Student preparation<textarea name="preparation" /></label>
                <div className="form-grid"><label>Ground minutes<input name="groundMinutes" type="number" min="0" defaultValue="30" required /></label><label>Training minutes<input name="trainingMinutes" type="number" min="0" defaultValue="90" required /></label></div>
                <button className="button button-primary" type="submit">Add lesson</button>
              </form></details>}
            </> : <EmptyCollection label="No phases yet" detail="Add the first phase to establish the course sequence." />}
            {editable && <details className="inline-create"><summary>Add phase</summary><form className="portal-form" onSubmit={createPhase}>
              <label>Phase number<input name="phaseNumber" type="number" min="1" defaultValue={(phases.at(-1)?.phase_number ?? 0) + 1} required /></label><label>Phase title<input name="title" placeholder="Foundations" required /></label><label>Objective<textarea name="objective" /></label><label>Completion standard<textarea name="completionStandard" /></label><button className="button button-primary" type="submit">Add phase</button>
            </form></details>}
          </article>
          <article className="panel builder-panel">
            <div className="panel-heading"><div><p className="eyebrow dark">Grading standard</p><h2>{selectedLesson ? `Lesson ${selectedLesson.lesson_number} ACS` : 'ACS line items'}</h2></div><span className="count-badge">{selectedItems.length}</span></div>
            {selectedLesson ? <>
              <div className="lesson-summary"><span>{selectedLesson.kind}</span><strong>{selectedLesson.title}</strong><p>{selectedLesson.objective}</p><small>{selectedLesson.planned_ground_minutes} ground · {selectedLesson.planned_training_minutes} training min</small></div>
              {editable && currentPhase && version && <details className="inline-create edit-entity" key={`${selectedLesson.id}-${selectedLesson.title}-${selectedLesson.lesson_number}`}>
                <summary>Edit lesson {selectedLesson.lesson_number}</summary>
                <form className="portal-form" onSubmit={editLesson}>
                  <div className="form-grid"><label>Lesson number<input name="lessonNumber" type="number" min="1" defaultValue={selectedLesson.lesson_number} required /></label><label>Lesson type<select name="kind" defaultValue={selectedLesson.kind}><option value="flight">Flight</option><option value="ground">Ground</option><option value="simulator">Simulator</option><option value="review">Review</option></select></label></div>
                  <label>Lesson title<input name="title" defaultValue={selectedLesson.title} required /></label>
                  <label>Objective<textarea name="objective" defaultValue={selectedLesson.objective} required /></label>
                  <label>Completion standard<textarea name="completionStandard" defaultValue={selectedLesson.completion_standard} required /></label>
                  <label>Student preparation<textarea name="preparation" defaultValue={selectedLesson.preparation ?? ''} /></label>
                  <div className="form-grid"><label>Ground minutes<input name="groundMinutes" type="number" min="0" defaultValue={selectedLesson.planned_ground_minutes} required /></label><label>Training minutes<input name="trainingMinutes" type="number" min="0" defaultValue={selectedLesson.planned_training_minutes} required /></label></div>
                  <button className="button button-primary" type="submit">Save lesson changes</button>
                </form>
              </details>}
              <div className="acs-builder-list">{selectedItems.map((item) => <div key={item.id}><code>{item.code}</code><strong>{item.description}</strong><small>{item.area_of_operation} · {item.task} · {item.element_type.replace('_', ' ')}</small><details className="line-item-edit"><summary>Edit line item</summary><form className="portal-form" onSubmit={(event) => void editAcsItem(event, item)}><div className="form-grid"><label>ACS code<input name="code" defaultValue={item.code} required /></label><label>Element<select name="elementType" defaultValue={item.element_type}><option value="knowledge">Knowledge</option><option value="risk_management">Risk management</option><option value="skill">Skill</option></select></label></div><label>Area of operation<input name="area" defaultValue={item.area_of_operation} required /></label><label>Task<input name="task" defaultValue={item.task} required /></label><label>Description<textarea name="description" defaultValue={item.description} required /></label><button className="button button-primary" type="submit">Save line item</button></form></details></div>)}</div>
              {editable && <details className="inline-create" open={!selectedItems.length}><summary>Attach ACS line item</summary><form className="portal-form" onSubmit={createAcsItem}>
                <div className="form-grid"><label>ACS code<input name="code" placeholder="PA.IV.B.S2" required /></label><label>Element<select name="elementType" defaultValue="skill"><option value="knowledge">Knowledge</option><option value="risk_management">Risk management</option><option value="skill">Skill</option></select></label></div>
                <label>Area of operation<input name="area" required /></label><label>Task<input name="task" required /></label><label>Line-item description<textarea name="description" required /></label><button className="button button-primary" type="submit">Attach line item</button>
              </form></details>}
            </> : <EmptyCollection label="Select a lesson" detail="ACS line items are attached at lesson level and become the grade sheet." />}
          </article>
        </div>
      </div>
    </div> : <EmptyCollection label="No courses yet" detail="Create the first course above. Its first revision will be ready for phases, lessons, and ACS line items." />}
  </section>
}

interface GradeDraft { grade: OgmuiGrade | ''; comment: string }

function LessonsView({ profile, workspace, run }: { profile: PortalProfile; workspace: StaffWorkspace; run: Runner }) {
  const [enrollmentId, setEnrollmentId] = useState(workspace.enrollments.find((entry) => entry.status === 'active')?.id ?? '')
  const enrollment = workspace.enrollments.find((entry) => entry.id === enrollmentId)
  const version = workspace.versions.find((entry) => entry.id === enrollment?.course_version_id)
  const phaseIds = workspace.phases.filter((phase) => phase.course_version_id === version?.id).map((phase) => phase.id)
  const lessons = workspace.lessons.filter((lesson) => phaseIds.includes(lesson.phase_id))
  const [lessonId, setLessonId] = useState(lessons[0]?.id ?? '')
  const repeatRequirement = workspace.remediations.find((entry) => entry.enrollment_id === enrollmentId && !entry.resolved_at && entry.reason === 'U')
  const openAttempt = workspace.attempts.find((entry) => entry.enrollment_id === enrollmentId && entry.status === 'draft')
  const selectedLesson = lessons.find((lesson) => lesson.id === (openAttempt?.lesson_id ?? lessonId)) ?? lessons[0]
  const selectedPhase = workspace.phases.find((phase) => phase.id === selectedLesson?.phase_id)
  const plannedMappings = workspace.lessonAcsItems.filter((mapping) => mapping.lesson_id === selectedLesson?.id)
  const currentAttemptItems = openAttempt ? workspace.attemptItems.filter((item) => item.lesson_attempt_id === openAttempt.id).sort((a, b) => a.sort_order - b.sort_order) : []
  const displayItems: LessonAttemptItem[] = openAttempt ? currentAttemptItems : plannedMappings.map((mapping, index) => ({ id: `planned-${mapping.acs_item_id}`, lesson_attempt_id: '', acs_item_id: mapping.acs_item_id, source: 'planned', remediation_requirement_id: null, sort_order: index, created_at: '' }))
  const items = displayItems.map((entry) => workspace.acsItems.find((item) => item.id === entry.acs_item_id)).filter(Boolean) as AcsItem[]
  const [conductedAt, setConductedAt] = useState(localDateTimeValue())
  const [groundHours, setGroundHours] = useState(0)
  const [flightHours, setFlightHours] = useState(0)
  const [simulatorHours, setSimulatorHours] = useState(0)
  const [remarks, setRemarks] = useState('')
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, GradeDraft>>({})
  const [expandedRemarks, setExpandedRemarks] = useState<Set<string>>(new Set())
  const [clockNow, setClockNow] = useState(Date.now())

  useEffect(() => {
    if (!enrollmentId && workspace.enrollments[0]) setEnrollmentId(workspace.enrollments[0].id)
    if (lessons[0] && !lessons.some((lesson) => lesson.id === lessonId)) setLessonId(lessons[0].id)
    if (repeatRequirement?.required_lesson_id && repeatRequirement.required_lesson_id !== lessonId) setLessonId(repeatRequirement.required_lesson_id)
  }, [enrollmentId, lessonId, lessons, workspace.enrollments])

  useEffect(() => {
    if (!openAttempt) {
      setConductedAt(localDateTimeValue())
      setGroundHours(0)
      setFlightHours(0)
      setSimulatorHours(0)
      setRemarks('')
      setGradeDrafts({})
      setExpandedRemarks(new Set())
      return
    }
    setLessonId(openAttempt.lesson_id)
    setConductedAt(localDateTimeValue(new Date(openAttempt.conducted_at)))
    setGroundHours(hoursFromMinutes(openAttempt.ground_minutes ?? 0))
    setFlightHours(hoursFromMinutes(openAttempt.flight_minutes ?? openAttempt.training_minutes ?? 0))
    setSimulatorHours(hoursFromMinutes(openAttempt.simulator_minutes ?? 0))
    setRemarks(openAttempt.what_worked ?? '')
    const draft: Record<string, GradeDraft> = {}
    workspace.grades.filter((grade) => grade.lesson_attempt_id === openAttempt.id).forEach((grade) => { draft[grade.acs_item_id] = { grade: grade.grade, comment: grade.instructor_comment ?? '' } })
    setGradeDrafts(draft)
    setExpandedRemarks(new Set(Object.entries(draft).filter(([, value]) => ['U', 'I'].includes(value.grade) || Boolean(value.comment)).map(([id]) => id)))
  }, [openAttempt?.id])

  useEffect(() => {
    if (!openAttempt) return
    setClockNow(Date.now())
    const timer = window.setInterval(() => setClockNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [openAttempt?.id])

  async function openLesson() {
    if (!enrollment || !selectedLesson) return
    await run(() => openLessonAttempt({ enrollmentId: enrollment.id, lessonId: selectedLesson.id, instructorId: profile.id }), `Lesson ${selectedLesson.lesson_number} is open. Review the objectives and ACS items with the student.`)
  }

  async function editSelectedLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedLesson || !selectedPhase || !version) return
    const data = new FormData(event.currentTarget)
    await run(() => updateLesson({
      id: selectedLesson.id,
      phaseId: selectedPhase.id,
      courseVersionId: version.id,
      lessonNumber: Number(data.get('lessonNumber')),
      title: String(data.get('title')),
      kind: String(data.get('kind')) as PortalLesson['kind'],
      objective: String(data.get('objective')),
      completionStandard: String(data.get('completionStandard')),
      plannedGroundMinutes: Number(data.get('groundMinutes')),
      plannedTrainingMinutes: Number(data.get('trainingMinutes')),
      preparation: String(data.get('preparation')),
    }), `Lesson ${selectedLesson.lesson_number} definition saved.`)
  }

  async function submit(status: 'draft' | 'published') {
    if (!openAttempt || !selectedLesson || !items.length) return
    let savedGroundHours = groundHours
    let savedFlightHours = flightHours
    let savedSimulatorHours = simulatorHours
    if (status === 'published' && savedGroundHours + savedFlightHours + savedSimulatorHours === 0) {
      const automaticHours = elapsedTenths(openAttempt.opened_at ?? openAttempt.created_at)
      if (selectedLesson.kind === 'flight') savedFlightHours = automaticHours
      else if (selectedLesson.kind === 'simulator') savedSimulatorHours = automaticHours
      else savedGroundHours = automaticHours
    }
    await run(() => saveGradeSheet({
      attemptId: openAttempt.id,
      conductedAt,
      groundMinutes: minutesFromHours(savedGroundHours),
      flightMinutes: minutesFromHours(savedFlightHours),
      simulatorMinutes: minutesFromHours(savedSimulatorHours),
      remarks,
      status,
      grades: items.map((item) => ({ acsItemId: item.id, grade: gradeDrafts[item.id]?.grade ?? '', comment: gradeDrafts[item.id]?.comment ?? '' })),
    }), status === 'published' ? 'Lesson closed. The permanent grade sheet is now visible to the student.' : 'Open lesson record saved.')
  }

  const openRemediations = workspace.remediations.filter((entry) => entry.enrollment_id === enrollmentId && !entry.resolved_at)
  return <section className="workspace-view">
    <div className="view-heading"><div><p className="eyebrow dark">Today’s training</p><h1>Lessons</h1><p>Open the lesson with the student, review its objectives and line items, then grade and close it after training.</p></div><div className="grade-key">{(Object.keys(gradeLabels) as OgmuiGrade[]).map((grade) => <span key={grade}><Grade value={grade} />{gradeLabels[grade]}</span>)}</div></div>
    <div className="lesson-operations">
      <article className="panel grade-editor">
        {workspace.enrollments.length ? <>
          <div className="form-grid portal-form"><label>Student & course<select disabled={Boolean(openAttempt)} value={enrollmentId} onChange={(event) => setEnrollmentId(event.target.value)}>{workspace.enrollments.filter((entry) => entry.status === 'active').map((entry) => <option value={entry.id} key={entry.id}>{studentName(workspace, entry.student_id)} · {courseName(workspace, entry.course_version_id)}</option>)}</select></label><label>{repeatRequirement ? 'Required repeat lesson' : 'Lesson'}<select disabled={Boolean(openAttempt || repeatRequirement)} value={selectedLesson?.id ?? ''} onChange={(event) => setLessonId(event.target.value)}>{lessons.map((lesson) => <option value={lesson.id} key={lesson.id}>{lessonName(workspace, lesson.id)}</option>)}</select></label></div>
          {selectedLesson && items.length ? <>
            <div className="grade-editor-head"><div><p className="eyebrow dark">{openAttempt ? `Open since ${formatDateTime(openAttempt.opened_at ?? openAttempt.created_at)}` : repeatRequirement ? 'Repeat required' : 'Ready to open'}</p><h2>{selectedLesson.title}</h2><p>{studentName(workspace, enrollment?.student_id ?? '')} · Attempt {(workspace.attempts.filter((entry) => entry.enrollment_id === enrollmentId && entry.lesson_id === selectedLesson.id).at(0)?.attempt_number ?? 0) + (openAttempt ? 0 : 1)}</p></div><span>{items.length + (openAttempt ? 0 : openRemediations.filter((entry) => !plannedMappings.some((mapping) => mapping.acs_item_id === entry.acs_item_id)).length)} ACS item{items.length === 1 ? '' : 's'}</span></div>
            <div className="lesson-opening-brief"><div><span>Objective</span><p>{selectedLesson.objective}</p></div><div><span>Completion standard</span><p>{selectedLesson.completion_standard}</p></div></div>
            <details className="edit-drawer inline-lesson-edit" key={`${selectedLesson.id}-${selectedLesson.title}`}><summary>Edit lesson definition</summary><form className="portal-form" onSubmit={editSelectedLesson}><div className="form-grid"><label>Lesson number<input name="lessonNumber" type="number" min="1" defaultValue={selectedLesson.lesson_number} required /></label><label>Type<select name="kind" defaultValue={selectedLesson.kind}><option value="flight">Flight</option><option value="ground">Ground</option><option value="simulator">Simulator</option><option value="review">Review</option></select></label></div><label>Title<input name="title" defaultValue={selectedLesson.title} required /></label><label>Objective<textarea name="objective" defaultValue={selectedLesson.objective} required /></label><label>Completion standard<textarea name="completionStandard" defaultValue={selectedLesson.completion_standard} required /></label><label>Student preparation<textarea name="preparation" defaultValue={selectedLesson.preparation ?? ''} /></label><div className="form-grid"><label>Ground minutes<input name="groundMinutes" type="number" min="0" defaultValue={selectedLesson.planned_ground_minutes} required /></label><label>Training minutes<input name="trainingMinutes" type="number" min="0" defaultValue={selectedLesson.planned_training_minutes} required /></label></div><button className="button button-primary" type="submit">Save lesson definition</button></form></details>
            {!openAttempt ? <>
              {openRemediations.length > 0 && <div className="carryover-alert"><strong>{openRemediations.length} unresolved line item{openRemediations.length === 1 ? '' : 's'} will be added</strong><span>{repeatRequirement ? 'An Unsatisfactory result requires this repeat lesson.' : 'Incomplete items remain open and carry into this lesson.'}</span></div>}
              <div className="opening-items">{items.map((item) => <div key={item.id}><code>{item.code}</code><strong>{item.description}</strong></div>)}</div>
              <button className="button button-primary open-lesson-button" type="button" onClick={() => void openLesson()}>Open lesson with student <span>→</span></button>
            </> : <>
              <div className="time-entry portal-form"><label>Lesson date & time<input type="datetime-local" value={conductedAt} onChange={(event) => setConductedAt(event.target.value)} /></label><label>Ground hours<input type="number" min="0" step="0.1" value={groundHours} onChange={(event) => setGroundHours(Number(event.target.value))} /></label><label>Flight hours<input type="number" min="0" step="0.1" value={flightHours} onChange={(event) => setFlightHours(Number(event.target.value))} /></label><label>Simulator hours<input type="number" min="0" step="0.1" value={simulatorHours} onChange={(event) => setSimulatorHours(Number(event.target.value))} /></label><div className="elapsed-time"><span>Elapsed lesson time</span><strong>{elapsedTenths(openAttempt.opened_at ?? openAttempt.created_at, null, clockNow).toFixed(1)} hr</strong><small>Counted automatically from Open to Close; if the time fields remain blank, it records under the lesson type.</small></div></div>
              <div className="grade-lines">{items.map((item, index) => {
                const attemptItem = displayItems[index]
                const selectedGrade = gradeDrafts[item.id]?.grade ?? ''
                const unresolved = ['U', 'I'].includes(selectedGrade)
                const isExpanded = expandedRemarks.has(item.id)
                const setGrade = (grade: OgmuiGrade) => {
                  setGradeDrafts((current) => ({ ...current, [item.id]: { grade, comment: current[item.id]?.comment ?? '' } }))
                  if (grade === 'U' || grade === 'I') setExpandedRemarks((current) => new Set(current).add(item.id))
                }
                return <div className="grade-line" key={item.id}><div className="grade-line-item"><code>{item.code}</code><strong>{item.description}</strong><small>{attemptItem.source === 'planned' ? item.element_type.replace('_', ' ') : attemptItem.source === 'repeat_unsatisfactory' ? 'repeat required · prior unsatisfactory' : 'carryover · prior incomplete'}</small></div><div className="quick-grade" role="group" aria-label={`${item.code} OGMUI grade`}>{(Object.keys(gradeLabels) as OgmuiGrade[]).map((grade) => <button className={`quick-grade-${grade.toLowerCase()} ${selectedGrade === grade ? 'selected' : ''}`} type="button" aria-label={`${grade} · ${gradeLabels[grade]}`} aria-pressed={selectedGrade === grade} title={gradeLabels[grade]} onClick={() => setGrade(grade)} key={grade}>{grade}</button>)}</div><button className={`remarks-toggle ${unresolved ? 'required' : ''} ${isExpanded ? 'open' : ''}`} type="button" aria-expanded={isExpanded} onClick={() => setExpandedRemarks((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next })}>{unresolved ? 'Remarks required' : gradeDrafts[item.id]?.comment ? 'Remarks added' : 'Add remarks'} <span>{isExpanded ? '−' : '+'}</span></button>{isExpanded && <label className="line-comment">Remarks{unresolved && <b className="required-note">Required for U/I</b>}<textarea aria-label={`${item.code} remarks`} required={unresolved} placeholder="Add detailed remarks for this ACS item…" value={gradeDrafts[item.id]?.comment ?? ''} onChange={(event) => setGradeDrafts((current) => ({ ...current, [item.id]: { grade: current[item.id]?.grade ?? '', comment: event.target.value } }))} /></label>}</div>
              })}</div>
              <div className="debrief-editor portal-form"><label>Lesson remarks<textarea value={remarks} placeholder="Overall lesson remarks…" onChange={(event) => setRemarks(event.target.value)} /></label><div className="close-rule"><strong>Closing creates the permanent record and stops the lesson clock.</strong><span>Every line item must be graded. U and I require remarks; U automatically requires another attempt of this lesson.</span></div><div className="editor-actions"><button className="button button-outline" type="button" onClick={() => void submit('draft')}>Save open record</button><button className="button button-primary" type="button" onClick={() => void submit('published')}>Close lesson record <span>→</span></button></div></div>
            </>}
          </> : <EmptyCollection label="This lesson has no ACS line items" detail="Open Courses, select this lesson, and attach its ACS items." />}
        </> : <EmptyCollection label="No active enrollments" detail="Enroll a student before opening a lesson." />}
      </article>
    </div>
  </section>
}

function AuditView({ workspace }: { workspace: StaffWorkspace }) {
  const [scope, setScope] = useState<'student' | 'course'>('student')
  const [studentId, setStudentId] = useState(workspace.students[0]?.id ?? '')
  const [courseId, setCourseId] = useState(workspace.courses[0]?.id ?? '')
  const studentEvents = workspace.trainingAudit.filter((event) => !studentId || event.student_id === studentId)
  const courseEvents = workspace.courseChanges.filter((event) => !courseId || event.course_id === courseId)
  const actionLabel = (action: CourseChangeEvent['action'] | TrainingAuditEvent['action']) => action === 'baseline' ? 'Baseline' : action === 'created' ? 'Created' : action === 'updated' ? 'Updated' : 'Deleted'

  return <section className="workspace-view">
    <div className="view-heading"><div><p className="eyebrow dark">Service history</p><h1>Audit Log</h1><p>Technical before-and-after history for verification and correction review. Normal student records remain under Students.</p></div></div>
    <article className="panel audit-panel">
      <div className="audit-controls">
        <div className="audit-tabs" role="tablist" aria-label="Audit scope"><button className={scope === 'student' ? 'active' : ''} onClick={() => setScope('student')} role="tab">Student changes</button><button className={scope === 'course' ? 'active' : ''} onClick={() => setScope('course')} role="tab">Course changes</button></div>
        {scope === 'student' ? <label>Student<select value={studentId} onChange={(event) => setStudentId(event.target.value)}>{workspace.students.map((student) => <option value={student.id} key={student.id}>{student.full_name}</option>)}</select></label> : <label>Course<select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{workspace.courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select></label>}
      </div>
      <div className="audit-summary"><strong>{scope === 'student' ? studentEvents.length : courseEvents.length} recorded event{(scope === 'student' ? studentEvents.length : courseEvents.length) === 1 ? '' : 's'}</strong><span>Open any entry to inspect its before-and-after values.</span></div>
      {scope === 'course' ? courseEvents.length ? <div className="history-list audit-history">{courseEvents.map((event) => {
        const actor = event.changed_by ? workspace.profiles.find((profile) => profile.id === event.changed_by)?.full_name ?? 'Portal staff' : 'System baseline'
        return <details key={`course-${event.id}`}><summary><span className={`history-action ${event.action}`}>{actionLabel(event.action)}</span><div><strong>{historyEntityName(event, workspace)}</strong><small>{actor} · {formatDateTime(event.changed_at)}</small></div><b>View record</b></summary><AuditDiff action={event.action} details={historyDetails(event)} /></details>
      })}</div> : <EmptyCollection label="No course history yet" detail="The audit migration will capture the current structure as its baseline." /> : studentEvents.length ? <div className="history-list audit-history">{studentEvents.map((event) => {
        const actor = event.changed_by ? workspace.profiles.find((profile) => profile.id === event.changed_by)?.full_name ?? 'Portal staff' : 'System baseline'
        return <details key={`training-${event.id}`}><summary><span className={`history-action ${event.action}`}>{actionLabel(event.action)}</span><div><strong>{trainingEntityName(event, workspace)}</strong><small>{actor} · {formatDateTime(event.changed_at)}</small></div><b>View record</b></summary><AuditDiff action={event.action} details={trainingHistoryDetails(event)} /></details>
      })}</div> : <EmptyCollection label="No student history yet" detail="Opening, grading, closing, and carrying forward lessons will be recorded here." />}
    </article>
  </section>
}

function AuditDiff({ action, details }: { action: 'baseline' | 'created' | 'updated' | 'deleted'; details: Array<{ field: string; before: unknown; after: unknown }> }) {
  return <div className="history-diff" role="table"><div className="history-diff-head" role="row"><span role="columnheader">Field</span><span role="columnheader">Before</span><span role="columnheader">After</span></div>{details.map(({ field, before, after }) => <div role="row" key={field}><strong role="cell">{historyFieldLabels[field] ?? field}</strong><span role="cell">{action === 'created' || action === 'baseline' ? '—' : historyValue(before, field)}</span><span role="cell">{action === 'deleted' ? '—' : historyValue(after, field)}</span></div>)}</div>
}

function LibraryView({ profile, workspace, run }: { profile: PortalProfile; workspace: StaffWorkspace; run: Runner }) {
  const [kind, setKind] = useState<'document' | 'video' | 'link'>('document')
  const [file, setFile] = useState<File | null>(null)
  const [targetValue, setTargetValue] = useState(workspace.versions[0] ? `course:${workspace.versions[0].id}` : '')

  function parseTarget(value: string) {
    const [type, id] = value.split(':')
    if (type === 'course') return { course_version_id: id }
    if (type === 'lesson') return { lesson_id: id }
    return { enrollment_id: id }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!targetValue) return
    const form = event.currentTarget
    const data = new FormData(form)
    const common = { title: String(data.get('title')), kind, description: String(data.get('description')), revision: String(data.get('revision')), createdBy: profile.id, target: parseTarget(targetValue), required: data.get('required') === 'on' }
    const result = kind === 'link'
      ? await run(() => createLinkedResource({ ...common, externalUrl: String(data.get('externalUrl')) }), 'Resource published to the selected training scope.')
      : file ? await run(() => uploadTrainingResource({ ...common, kind, file }), 'File uploaded privately and assigned.') : undefined
    if (result) { form.reset(); setFile(null) }
  }

  async function open(resource: PortalResource) {
    const url = await getResourceUrl(resource)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function saveResource(event: FormEvent<HTMLFormElement>, resource: PortalResource) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await run(() => updateResource({ id: resource.id, title: String(data.get('title')), description: String(data.get('description')), revision: String(data.get('revision')), externalUrl: resource.external_url ? String(data.get('externalUrl')) : undefined, active: data.get('active') === 'on' }), 'Resource saved.')
  }

  return <section className="workspace-view">
    <div className="view-heading"><div><p className="eyebrow dark">Documents & video</p><h1>Resource Library</h1><p>Upload private course files or assign trusted links to a course, lesson, or individual student enrollment.</p></div></div>
    <div className="split-workspace">
      <article className="panel form-panel"><p className="eyebrow dark">New resource</p><h2>Publish training material</h2>
        {workspace.versions.length ? <form className="portal-form" onSubmit={submit}>
          <label>Title<input name="title" required /></label><div className="form-grid"><label>Type<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="document">Document</option><option value="video">Video</option><option value="link">External link</option></select></label><label>Revision<input name="revision" placeholder="1.0" /></label></div><label>Description<textarea name="description" /></label>
          {kind === 'link' ? <label>Web address<input name="externalUrl" type="url" placeholder="https://" required /></label> : <label>File<input className="file-input" type="file" accept={kind === 'video' ? 'video/*' : '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt'} onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label>}
          <label>Assign to<select value={targetValue} onChange={(event) => setTargetValue(event.target.value)} required><optgroup label="Course revisions">{workspace.versions.map((version) => <option value={`course:${version.id}`} key={version.id}>{courseName(workspace, version.id)}</option>)}</optgroup><optgroup label="Lessons">{workspace.lessons.map((lesson) => <option value={`lesson:${lesson.id}`} key={lesson.id}>{lessonName(workspace, lesson.id)}</option>)}</optgroup><optgroup label="Student enrollments">{workspace.enrollments.map((entry) => <option value={`enrollment:${entry.id}`} key={entry.id}>{studentName(workspace, entry.student_id)} · {courseName(workspace, entry.course_version_id)}</option>)}</optgroup></select></label>
          <label className="check-field"><input name="required" type="checkbox" />Required preparation</label><button className="button button-primary" type="submit">Publish resource <span>→</span></button>
        </form> : <EmptyCollection label="Create a course first" detail="Resources must be assigned to a course, lesson, or enrollment." />}
      </article>
      <article className="panel collection-panel"><div className="panel-heading"><div><p className="eyebrow dark">Current library</p><h2>{workspace.resources.length} resource{workspace.resources.length === 1 ? '' : 's'}</h2></div></div>{workspace.resources.length ? <div className="resource-admin-list">{workspace.resources.map((resource) => <div className="resource-admin-record" key={resource.id}><div><span>{resource.kind === 'video' ? '▶' : resource.kind === 'document' ? 'DOC' : '↗'}</span><div><strong>{resource.title}</strong><small>{resource.description || resource.kind} · {workspace.assignments.filter((entry) => entry.resource_id === resource.id).length} assignment</small></div><button className="text-button" onClick={() => void open(resource)}>Open</button></div><details className="line-item-edit"><summary>Edit resource</summary><form className="portal-form" onSubmit={(event) => void saveResource(event, resource)}><label>Title<input name="title" defaultValue={resource.title} required /></label><div className="form-grid"><label>Revision<input name="revision" defaultValue={resource.revision ?? ''} /></label><label className="check-field"><input name="active" type="checkbox" defaultChecked={resource.active} />Active</label></div><label>Description<textarea name="description" defaultValue={resource.description ?? ''} /></label>{resource.external_url && <label>Web address<input name="externalUrl" type="url" defaultValue={resource.external_url} required /></label>}<button className="button button-primary" type="submit">Save resource</button></form></details></div>)}</div> : <EmptyCollection label="No training resources" detail="Your first uploaded document or training video will appear here." />}</article>
    </div>
  </section>
}

export function StaffPortal({ profile, workspace, refresh }: { profile: PortalProfile; workspace: StaffWorkspace; refresh: () => Promise<void> }) {
  const [view, setView] = useState<StaffView>('overview')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'saving' | 'success' | 'error'; title: string; text: string } | null>(null)

  const run: Runner = async (action, success) => {
    if (busy) return undefined
    setBusy(true)
    setNotice({ kind: 'saving', title: 'Saving…', text: 'Keep this page open while the portal confirms the change.' })
    try {
      const result = await action()
      await refresh()
      setNotice({ kind: 'success', title: 'Saved', text: success })
      return result
    } catch (reason) {
      setNotice({ kind: 'error', title: 'Not saved', text: reason instanceof Error ? reason.message : 'The change could not be saved.' })
      return undefined
    } finally {
      setBusy(false)
    }
  }

  const content = view === 'overview' ? <StaffOverview profile={profile} workspace={workspace} navigate={setView} /> : view === 'students' ? <StudentsView profile={profile} workspace={workspace} run={run} /> : view === 'courses' ? <CoursesView workspace={workspace} run={run} /> : view === 'lessons' ? <LessonsView profile={profile} workspace={workspace} run={run} /> : view === 'audit' ? <AuditView workspace={workspace} /> : <LibraryView profile={profile} workspace={workspace} run={run} />

  return <div className={`portal-shell ${busy ? 'is-busy' : ''}`}>
    <aside className="sidebar"><Brand /><nav>{staffNavItems.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav><div className="course-chip"><span>Training model</span><strong>Course → Phase → Lesson</strong><small>ACS → OGMUI → Feedback</small></div><div className="account-chip"><span>{initials(profile.full_name)}</span><div><strong>{profile.full_name}</strong><small>{profile.role === 'owner' ? 'Owner' : 'Instructor'}</small></div><button aria-label="Sign out" title="Sign out" onClick={() => void supabase?.auth.signOut()}>↗</button></div></aside>
    <main className="portal-main"><header className="mobile-header"><Brand /><button className="mobile-account" onClick={() => void supabase?.auth.signOut()} aria-label="Sign out">{initials(profile.full_name)}</button></header><nav className="mobile-nav staff-mobile-nav">{staffNavItems.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav><div className="main-inner">{content}</div></main>
    {notice && <div className={`save-status ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite"><span className="save-status-mark" aria-hidden="true">{notice.kind === 'saving' ? '•••' : notice.kind === 'success' ? '✓' : '!'}</span><div><strong>{notice.title}</strong><small>{notice.text}</small></div>{notice.kind !== 'saving' && <button onClick={() => setNotice(null)} aria-label="Dismiss save status">×</button>}</div>}
  </div>
}

type StudentView = 'dashboard' | 'course' | 'record' | 'acs' | 'library'

const studentNavItems: Array<{ id: StudentView; label: string; short: string }> = [
  { id: 'dashboard', label: 'Dashboard', short: 'DB' },
  { id: 'course', label: 'Course', short: 'CR' },
  { id: 'record', label: 'Training Record', short: 'TR' },
  { id: 'acs', label: 'ACS Progress', short: 'AP' },
  { id: 'library', label: 'Documents & Videos', short: 'DV' },
]

function latestStudentGrade(workspace: StudentWorkspace, acsItemId: string) {
  const closedAttempts = workspace.attempts.filter((attempt) => attempt.status === 'published')
  for (const attempt of closedAttempts) {
    const grade = workspace.grades.find((entry) => entry.lesson_attempt_id === attempt.id && entry.acs_item_id === acsItemId)
    if (grade) return { grade, attempt }
  }
  return undefined
}

function studentCourseItemIds(workspace: StudentWorkspace) {
  return [...new Set(workspace.lessonAcsItems.map((mapping) => mapping.acs_item_id))]
}

function studentLessonComplete(workspace: StudentWorkspace, lessonId: string) {
  const ids = workspace.lessonAcsItems.filter((mapping) => mapping.lesson_id === lessonId).map((mapping) => mapping.acs_item_id)
  return ids.length > 0 && ids.every((id) => ['O', 'G', 'M'].includes(latestStudentGrade(workspace, id)?.grade.grade ?? ''))
}

function StudentDashboard({ profile, workspace, navigate }: { profile: PortalProfile; workspace: StudentWorkspace; navigate: (view: StudentView) => void }) {
  const phaseOrder = new Map(workspace.phases.map((phase) => [phase.id, phase.phase_number]))
  const lessons = [...workspace.lessons].sort((a, b) => (phaseOrder.get(a.phase_id) ?? 0) - (phaseOrder.get(b.phase_id) ?? 0) || a.lesson_number - b.lesson_number)
  const closedAttempts = workspace.attempts.filter((attempt) => attempt.status === 'published')
  const openAttempt = workspace.attempts.find((attempt) => attempt.status === 'draft')
  const repeat = workspace.remediations.find((entry) => !entry.resolved_at && entry.reason === 'U')
  const nextLesson = workspace.lessons.find((lesson) => lesson.id === (openAttempt?.lesson_id ?? repeat?.required_lesson_id)) ?? lessons.find((lesson) => !studentLessonComplete(workspace, lesson.id))
  const latest = closedAttempts[0]
  const latestLesson = workspace.lessons.find((lesson) => lesson.id === latest?.lesson_id)
  const courseItems = studentCourseItemIds(workspace)
  const completedItems = courseItems.filter((id) => ['O', 'G', 'M'].includes(latestStudentGrade(workspace, id)?.grade.grade ?? '')).length
  const progress = courseItems.length ? Math.round((completedItems / courseItems.length) * 100) : 0
  const unresolved = workspace.remediations.filter((entry) => !entry.resolved_at)
  const currentPhase = workspace.phases.find((phase) => phase.id === nextLesson?.phase_id)
  const courseComplete = courseItems.length > 0 && completedItems === courseItems.length && !unresolved.length && !openAttempt

  return <>
    <section className="welcome-row"><div><p className="eyebrow dark">Active course · Revision {workspace.version.revision}</p><h1>Welcome back, {profile.full_name.split(/\s+/)[0]}.</h1><p className="lede">Course completion is based on ACS line items. Unsatisfactory and Incomplete items remain open until they are completed.</p></div><div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}><div><strong>{progress}%</strong><span>ACS items</span></div></div></section>
    <section className="dashboard-grid">
      <article className="next-lesson panel panel-dark"><div className="panel-kicker"><span>{openAttempt ? 'Lesson open' : repeat ? 'Repeat required' : nextLesson ? 'Next lesson' : 'Course status'}</span><span>{currentPhase ? `Phase ${String(currentPhase.phase_number).padStart(2, '0')}` : courseComplete ? 'Complete' : 'Awaiting review'}</span></div><p className="lesson-number">{nextLesson ? String(nextLesson.lesson_number).padStart(2, '0') : courseComplete ? '✓' : '—'}</p><h2>{nextLesson?.title ?? (courseComplete ? 'All ACS requirements complete' : 'Instructor review required')}</h2><p>{openAttempt ? 'Review the objectives and line items below with your instructor before training begins.' : repeat ? 'A prior Unsatisfactory result requires another attempt of this lesson.' : nextLesson?.objective ?? 'Your instructor will review course completion and next steps.'}</p>{nextLesson && <dl className="lesson-meta"><div><dt>Type</dt><dd>{nextLesson.kind}</dd></div><div><dt>Planned time</dt><dd>{nextLesson.planned_ground_minutes + nextLesson.planned_training_minutes} min</dd></div><div><dt>Open items</dt><dd>{unresolved.length}</dd></div></dl>}<button className="button button-light" onClick={() => navigate('course')}>{openAttempt ? 'Review open lesson' : 'Open course'} <span>→</span></button></article>
      <article className="panel recent-debrief"><div className="panel-heading"><div><p className="eyebrow dark">Latest instructor remarks</p><h2>{latestLesson ? `Lesson ${latestLesson.lesson_number}` : 'No published record yet'}</h2></div>{latest && <span className="status-pill">Published</span>}</div>{latest ? <><p className="quote">“{latest.what_worked || 'Review the complete grade sheet for line-item remarks.'}”</p><button className="text-button" onClick={() => navigate('record')}>Read complete grade sheet <span>→</span></button></> : <EmptyCollection label="Your first remarks will appear here" detail="Published grade sheets remain available throughout your course." />}</article>
    </section>
    {unresolved.length > 0 && <section className="carryover-strip panel"><div><p className="eyebrow dark">Must be completed</p><h2>{unresolved.length} open ACS line item{unresolved.length === 1 ? '' : 's'}</h2></div><div>{unresolved.slice(0, 4).map((entry) => { const item = workspace.acsItems.find((candidate) => candidate.id === entry.acs_item_id); return <span key={entry.id}><Grade value={entry.reason} /><b>{item?.code}</b>{entry.reason === 'U' ? 'Repeat lesson required' : 'Carries forward'}</span> })}</div></section>}
    <section className="lower-grid"><article className="panel phase-panel"><div className="panel-heading"><div><p className="eyebrow dark">Course position</p><h2>{workspace.course.name}</h2></div><strong>{completedItems} / {courseItems.length} ACS</strong></div><div className="phase-list">{workspace.phases.map((phase) => { const phaseLessons = workspace.lessons.filter((lesson) => lesson.phase_id === phase.id); const done = phaseLessons.filter((lesson) => studentLessonComplete(workspace, lesson.id)).length; return <div className={phase.id === currentPhase?.id ? 'active' : ''} key={phase.id}><span>{String(phase.phase_number).padStart(2, '0')}</span><strong>{phase.title}</strong><small>{done} of {phaseLessons.length} lessons</small></div> })}</div></article><article className="panel attention-panel"><div className="panel-heading"><div><p className="eyebrow dark">Assigned resources</p><h2>Course library</h2></div><button className="quiet-link" onClick={() => navigate('library')}>View all</button></div>{workspace.resources.length ? <div className="attention-list">{workspace.resources.slice(0, 3).map((resource) => <div key={resource.id}><span className="resource-mini">{resource.kind === 'video' ? '▶' : 'DOC'}</span><div><strong>{resource.title}</strong><p>{resource.description || resource.kind}</p></div></div>)}</div> : <EmptyCollection label="No resources assigned" detail="Documents and videos from your instructor will appear here." />}</article></section>
  </>
}

function StudentCourse({ workspace }: { workspace: StudentWorkspace }) {
  const phaseOrder = new Map(workspace.phases.map((phase) => [phase.id, phase.phase_number]))
  const ordered = [...workspace.lessons].sort((a, b) => (phaseOrder.get(a.phase_id) ?? 0) - (phaseOrder.get(b.phase_id) ?? 0) || a.lesson_number - b.lesson_number)
  const openAttempt = workspace.attempts.find((entry) => entry.status === 'draft')
  const [lessonId, setLessonId] = useState(openAttempt?.lesson_id ?? ordered[0]?.id ?? '')
  const lesson = workspace.lessons.find((entry) => entry.id === lessonId) ?? ordered[0]
  const lessonOpenAttempt = openAttempt?.lesson_id === lesson?.id ? openAttempt : undefined
  const latestClosedAttempt = workspace.attempts.find((entry) => entry.lesson_id === lesson?.id && entry.status === 'published')
  const displayItemRecords = lessonOpenAttempt ? workspace.attemptItems.filter((item) => item.lesson_attempt_id === lessonOpenAttempt.id).sort((a, b) => a.sort_order - b.sort_order) : workspace.lessonAcsItems.filter((mapping) => mapping.lesson_id === lesson?.id).map((mapping, index) => ({ id: `planned-${mapping.acs_item_id}`, lesson_attempt_id: '', acs_item_id: mapping.acs_item_id, source: 'planned' as const, remediation_requirement_id: null, sort_order: index, created_at: '' }))
  const items = displayItemRecords.map((entry) => workspace.acsItems.find((item) => item.id === entry.acs_item_id)).filter(Boolean) as AcsItem[]
  const grades = workspace.grades.filter((grade) => grade.lesson_attempt_id === latestClosedAttempt?.id)
  const repeat = workspace.remediations.find((entry) => !entry.resolved_at && entry.reason === 'U' && entry.required_lesson_id === lesson?.id)

  useEffect(() => { if (openAttempt?.lesson_id) setLessonId(openAttempt.lesson_id) }, [openAttempt?.lesson_id])

  return <section className="workspace-view"><div className="view-heading"><div><p className="eyebrow dark">Active enrollment</p><h1>{workspace.course.name}</h1><p>{workspace.publication.code} · Course revision {workspace.version.revision}</p></div></div><div className="course-layout"><div className="lesson-sequence panel">{workspace.phases.map((phase) => <div className="student-phase" key={phase.id}><h2>Phase {String(phase.phase_number).padStart(2, '0')} · {phase.title}</h2>{ordered.filter((entry) => entry.phase_id === phase.id).map((entry) => { const complete = studentLessonComplete(workspace, entry.id); const isOpen = openAttempt?.lesson_id === entry.id; const mustRepeat = workspace.remediations.some((requirement) => !requirement.resolved_at && requirement.reason === 'U' && requirement.required_lesson_id === entry.id); return <button className={`${complete ? 'complete' : ''} ${isOpen ? 'open' : ''} ${mustRepeat ? 'repeat' : ''} ${entry.id === lesson?.id ? 'selected' : ''}`} key={entry.id} onClick={() => setLessonId(entry.id)}><span>{complete ? '✓' : isOpen ? '•' : entry.lesson_number}</span><div><small>{isOpen ? 'open now' : mustRepeat ? 'repeat required' : entry.kind}</small><strong>{entry.title}</strong></div><b>→</b></button> })}</div>)}</div><article className="lesson-detail panel">{lesson ? <><div className="panel-kicker dark"><span>Lesson {lesson.lesson_number}</span><span>{lessonOpenAttempt ? 'open' : repeat ? 'repeat required' : studentLessonComplete(workspace, lesson.id) ? 'complete' : 'upcoming'}</span></div><h2>{lesson.title}</h2>{lessonOpenAttempt && <div className="student-open-banner"><strong>Lesson record opened {formatDateTime(lessonOpenAttempt.opened_at ?? lessonOpenAttempt.created_at)}</strong><span>Review the objective, completion standard, and every line item with your instructor.</span></div>}<p>{lesson.objective}</p><h3>Completion standard</h3><p>{lesson.completion_standard}</p><h3>Preparation</h3><p>{lesson.preparation || 'No preparation has been listed.'}</p><h3>{lessonOpenAttempt ? 'Items open for this attempt' : 'ACS line items'}</h3>{items.length ? <div className="compact-grades">{items.map((item, index) => { const grade = grades.find((entry) => entry.acs_item_id === item.id); const source = displayItemRecords[index]?.source; return <div key={item.id}>{!lessonOpenAttempt && grade ? <Grade value={grade.grade} /> : <span className="grade grade-i">{source === 'repeat_unsatisfactory' ? 'U' : source === 'carryover_incomplete' ? 'I' : '—'}</span>}<div><code>{item.code}</code><strong>{item.description}</strong><p>{lessonOpenAttempt ? source === 'repeat_unsatisfactory' ? 'Repeat item from an Unsatisfactory result.' : source === 'carryover_incomplete' ? 'Incomplete item carried forward from a prior lesson.' : 'Planned for this lesson.' : grade?.instructor_comment || 'Not yet evaluated.'}</p></div></div> })}</div> : <p className="empty-state">No ACS line items have been assigned.</p>}</> : <EmptyCollection label="No lessons yet" detail="Your instructor is still building this course." />}</article></div></section>
}

function StudentRecord({ workspace }: { workspace: StudentWorkspace }) {
  const openAttempt = workspace.attempts.find((attempt) => attempt.status === 'draft')
  const openLesson = workspace.lessons.find((lesson) => lesson.id === openAttempt?.lesson_id)
  const closedAttempts = workspace.attempts.filter((attempt) => attempt.status === 'published')
  const openItems = openAttempt ? workspace.attemptItems.filter((item) => item.lesson_attempt_id === openAttempt.id) : []
  const unresolved = workspace.remediations.filter((entry) => !entry.resolved_at)
  return <section className="workspace-view"><div className="view-heading"><div><p className="eyebrow dark">Permanent history</p><h1>Training Record</h1><p>Every closed attempt, time entry, OGMUI grade, and instructor comment remains available here.</p></div></div>
    {openAttempt && <article className="panel open-record-card"><div><p className="eyebrow dark">Currently open</p><h2>Lesson {openLesson?.lesson_number} · {openLesson?.title}</h2><span>Opened {formatDateTime(openAttempt.opened_at ?? openAttempt.created_at)} · {openItems.length} line items</span></div><b>Not yet closed or graded</b></article>}
    {unresolved.length > 0 && <div className="record-requirements panel"><strong>{unresolved.length} requirement{unresolved.length === 1 ? '' : 's'} remain open</strong><span>{unresolved.filter((entry) => entry.reason === 'U').length} repeat-required · {unresolved.filter((entry) => entry.reason === 'I').length} incomplete carryover</span></div>}
    <div className="record-list">{closedAttempts.length ? closedAttempts.map((attempt) => { const lesson = workspace.lessons.find((entry) => entry.id === attempt.lesson_id); const grades = workspace.grades.filter((entry) => entry.lesson_attempt_id === attempt.id); return <article className="panel" key={attempt.id}><div className="record-head"><div><small>{formatDate(attempt.conducted_at)} · Lesson {lesson?.lesson_number} · Attempt {attempt.attempt_number}</small><h2>{lesson?.title}</h2></div><span className="status-pill">Closed</span></div>{attempt.what_worked && <div className="record-debrief"><div><span>Remarks</span><p>{attempt.what_worked}</p></div></div>}<div className="compact-grades">{grades.map((grade) => { const item = workspace.acsItems.find((entry) => entry.id === grade.acs_item_id); return <div key={grade.id}><Grade value={grade.grade} /><div><code>{item?.code}</code><strong>{item?.description}</strong><p>{grade.instructor_comment || 'No line-item remarks entered.'}</p></div></div> })}</div><footer>Instructor · {workspace.instructor?.full_name ?? 'Pilot Consciousness'}<span>{elapsedTenths(attempt.opened_at ?? attempt.created_at, attempt.closed_at).toFixed(1)} elapsed · {hoursFromMinutes(attempt.ground_minutes ?? 0).toFixed(1)} ground · {hoursFromMinutes(attempt.flight_minutes ?? attempt.training_minutes ?? 0).toFixed(1)} flight · {hoursFromMinutes(attempt.simulator_minutes ?? 0).toFixed(1)} simulator hr</span></footer></article> }) : <EmptyCollection label="No closed lesson records" detail="The first permanent grade sheet will appear after your instructor closes a lesson." />}</div>
  </section>
}

function StudentAcs({ workspace }: { workspace: StudentWorkspace }) {
  const rows = useMemo(() => workspace.acsItems.map((item) => {
    const relevant = workspace.grades.filter((grade) => grade.acs_item_id === item.id).map((grade) => ({ grade, attempt: workspace.attempts.find((attempt) => attempt.id === grade.lesson_attempt_id) })).filter((entry) => entry.attempt).sort((a, b) => new Date(b.attempt!.conducted_at).getTime() - new Date(a.attempt!.conducted_at).getTime())
    return { item, latest: relevant[0] }
  }), [workspace])
  return <section className="workspace-view"><div className="view-heading"><div><p className="eyebrow dark">{workspace.publication.code}</p><h1>ACS Progress</h1><p>The latest OGMUI result for every evaluated ACS line item, linked back to its lesson.</p></div><div className="grade-key">{(Object.keys(gradeLabels) as OgmuiGrade[]).map((grade) => <span key={grade}><Grade value={grade} />{gradeLabels[grade]}</span>)}</div></div><article className="panel acs-table-wrap">{rows.length ? <table className="acs-table"><thead><tr><th>ACS line item</th><th>Latest grade</th><th>Lesson</th><th>Instructor comment</th></tr></thead><tbody>{rows.map(({ item, latest }) => { const lesson = workspace.lessons.find((entry) => entry.id === latest?.attempt?.lesson_id); return <tr key={item.id}><td><code>{item.code}</code><strong>{item.description}</strong></td><td>{latest ? <Grade value={latest.grade.grade} /> : '—'}</td><td>{lesson ? `Lesson ${lesson.lesson_number}` : 'Not evaluated'}{latest?.attempt && <small>{formatDate(latest.attempt.conducted_at)}</small>}</td><td>{latest?.grade.instructor_comment || '—'}</td></tr> })}</tbody></table> : <EmptyCollection label="No ACS items yet" detail="ACS progress will populate as your course and grade sheets are built." />}</article></section>
}

function StudentLibrary({ workspace }: { workspace: StudentWorkspace }) {
  const [message, setMessage] = useState('')
  async function open(resource: PortalResource) {
    try { const url = await getResourceUrl(resource); window.open(url, '_blank', 'noopener,noreferrer') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'This resource could not be opened.') }
  }
  return <section className="workspace-view"><div className="view-heading"><div><p className="eyebrow dark">Course library</p><h1>Documents & Videos</h1><p>Course material, lesson preparation, and resources assigned by your instructor.</p></div></div>{message && <div className="workspace-notice error">{message}</div>}<div className="resource-grid">{workspace.resources.length ? workspace.resources.map((resource) => { const required = workspace.assignments.some((assignment) => assignment.resource_id === resource.id && assignment.required); return <article className="panel" key={resource.id}><span className="resource-type">{resource.kind}{required ? ' · Required' : ''}</span><h2>{resource.title}</h2><p>{resource.description || 'Assigned training resource.'}</p><footer><span>{resource.revision ? `Revision ${resource.revision}` : 'Current'}</span><button onClick={() => void open(resource)}>Open <b>→</b></button></footer></article> }) : <EmptyCollection label="No resources assigned" detail="Assigned course documents and videos will appear here." />}</div></section>
}

export function StudentPortal({ profile, workspace }: { profile: PortalProfile; workspace: StudentWorkspace }) {
  const [view, setView] = useState<StudentView>('dashboard')
  const content = view === 'dashboard' ? <StudentDashboard profile={profile} workspace={workspace} navigate={setView} /> : view === 'course' ? <StudentCourse workspace={workspace} /> : view === 'record' ? <StudentRecord workspace={workspace} /> : view === 'acs' ? <StudentAcs workspace={workspace} /> : <StudentLibrary workspace={workspace} />
  const openAttempt = workspace.attempts.find((attempt) => attempt.status === 'draft')
  const repeat = workspace.remediations.find((entry) => !entry.resolved_at && entry.reason === 'U')
  const nextLesson = workspace.lessons.find((lesson) => lesson.id === (openAttempt?.lesson_id ?? repeat?.required_lesson_id)) ?? workspace.lessons.find((lesson) => !studentLessonComplete(workspace, lesson.id))
  return <div className="portal-shell"><aside className="sidebar"><Brand /><nav>{studentNavItems.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav><div className="course-chip"><span>{openAttempt ? 'Lesson open' : repeat ? 'Repeat required' : 'Active course'}</span><strong>{workspace.course.short_name}</strong><small>{nextLesson ? `Lesson ${nextLesson.lesson_number} · ${nextLesson.title}` : 'All ACS items complete'}</small></div><div className="account-chip"><span>{initials(profile.full_name)}</span><div><strong>{profile.full_name}</strong><small>Student</small></div><button aria-label="Sign out" title="Sign out" onClick={() => void supabase?.auth.signOut()}>↗</button></div></aside><main className="portal-main"><header className="mobile-header"><Brand /><button className="mobile-account" onClick={() => void supabase?.auth.signOut()} aria-label="Sign out">{initials(profile.full_name)}</button></header><nav className="mobile-nav">{studentNavItems.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav><div className="main-inner">{content}</div></main></div>
}

export function StudentWaitingRoom({ profile }: { profile: PortalProfile }) {
  return <main className="waiting-page"><section className="waiting-panel panel"><div className="dark-brand"><Brand /></div><div><p className="eyebrow dark">Account ready</p><h1>Welcome, {profile.full_name.split(/\s+/)[0]}.</h1><p>Your account is active, but no course has been assigned yet. Your dashboard will open here as soon as your instructor enrolls you.</p></div><button className="button button-outline" onClick={() => void supabase?.auth.signOut()}>Sign out</button></section></main>
}
