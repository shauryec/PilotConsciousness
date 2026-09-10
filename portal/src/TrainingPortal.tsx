import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import {
  addAcsItemToLesson,
  addLesson,
  addPhase,
  createCourseWithVersion,
  createLinkedResource,
  enrollStudent,
  getResourceUrl,
  saveGradeSheet,
  updateCourseDraft,
  updateLesson,
  updatePhase,
  uploadTrainingResource,
  type AcsItem,
  type CourseChangeEvent,
  type LessonAttempt,
  type OgmuiGrade,
  type PortalLesson,
  type PortalProfile,
  type PortalResource,
  type StaffWorkspace,
  type StudentWorkspace,
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

type StaffView = 'overview' | 'students' | 'courses' | 'grades' | 'library'

const staffNavItems: Array<{ id: StaffView; label: string; short: string }> = [
  { id: 'overview', label: 'Overview', short: 'OV' },
  { id: 'students', label: 'Students', short: 'ST' },
  { id: 'courses', label: 'Courses', short: 'CR' },
  { id: 'grades', label: 'Grade Sheets', short: 'GS' },
  { id: 'library', label: 'Resource Library', short: 'RL' },
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
}

function historyValue(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return 'Not set'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (field.endsWith('_at') && typeof value === 'string') return formatDateTime(value)
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
  const item = workspace.acsItems.find((entry) => entry.id === snapshot.acs_item_id)
  const lesson = workspace.lessons.find((entry) => entry.id === snapshot.lesson_id)
  return `${item?.code ?? 'ACS line item'} · ${lesson ? `Lesson ${lesson.lesson_number}` : 'lesson mapping'}`
}

function StaffOverview({ profile, workspace, navigate }: { profile: PortalProfile; workspace: StaffWorkspace; navigate: (view: StaffView) => void }) {
  const firstName = profile.full_name.split(/\s+/)[0] || profile.email
  const steps = [
    { done: workspace.courses.length > 0, label: 'Create a course', detail: 'Define its ACS publication and first revision.' },
    { done: workspace.phases.length > 0 && workspace.lessons.length > 0, label: 'Build the syllabus', detail: 'Add phases, lessons, objectives, standards, and ACS line items.' },
    { done: workspace.enrollments.length > 0, label: 'Enroll a student', detail: 'Connect an invited account to a course and instructor.' },
    { done: workspace.attempts.some((attempt) => attempt.status === 'published'), label: 'Publish a grade sheet', detail: 'Record OGMUI grades and durable instructor feedback.' },
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
      <article><span>Draft grade sheets</span><strong>{workspace.stats.draftGradeSheets}</strong><small>not visible to students</small></article>
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
        <button onClick={() => navigate('grades')}><span>03</span><div><strong>Grade sheet</strong><small>OGMUI evaluation and instructor comments</small></div><b>→</b></button>
      </article>
    </section>
  </>
}

function StudentsView({ profile, workspace, run }: { profile: PortalProfile; workspace: StaffWorkspace; run: Runner }) {
  const [studentId, setStudentId] = useState(workspace.students[0]?.id ?? '')
  const [versionId, setVersionId] = useState(workspace.versions[0]?.id ?? '')

  useEffect(() => {
    if (!studentId && workspace.students[0]) setStudentId(workspace.students[0].id)
    if (!versionId && workspace.versions[0]) setVersionId(workspace.versions[0].id)
  }, [studentId, versionId, workspace])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!studentId || !versionId) return
    await run(() => enrollStudent({ studentId, courseVersionId: versionId, instructorId: profile.id }), 'Student enrolled. Their course dashboard is now active.')
  }

  return <section className="workspace-view">
    <div className="view-heading"><div><p className="eyebrow dark">Accounts & enrollment</p><h1>Students</h1><p>Invite the account in Supabase, then assign the student to a course here.</p></div></div>
    <div className="split-workspace">
      <article className="panel form-panel">
        <p className="eyebrow dark">New enrollment</p><h2>Assign a course</h2>
        {workspace.students.length && workspace.versions.length ? <form className="portal-form" onSubmit={submit}>
          <label>Student<select value={studentId} onChange={(event) => setStudentId(event.target.value)}>{workspace.students.map((student) => <option value={student.id} key={student.id}>{student.full_name} · {student.email}</option>)}</select></label>
          <label>Course<select value={versionId} onChange={(event) => setVersionId(event.target.value)}>{workspace.versions.map((version) => <option value={version.id} key={version.id}>{courseName(workspace, version.id)}</option>)}</select></label>
          <button className="button button-primary" type="submit">Activate enrollment <span>→</span></button>
        </form> : <EmptyCollection label="Enrollment prerequisites" detail="A student account and at least one course revision are required." />}
      </article>
      <article className="panel collection-panel">
        <div className="panel-heading"><div><p className="eyebrow dark">Roster</p><h2>{workspace.students.length} student account{workspace.students.length === 1 ? '' : 's'}</h2></div></div>
        {workspace.students.length ? <div className="student-cards">{workspace.students.map((student) => {
          const enrollments = workspace.enrollments.filter((entry) => entry.student_id === student.id)
          return <div key={student.id}><span>{initials(student.full_name)}</span><div><strong>{student.full_name}</strong><small>{student.email}</small>{enrollments.map((entry) => <em key={entry.id}>{courseName(workspace, entry.course_version_id)} · {entry.status}</em>)}</div><b>{student.active ? 'Active' : 'Inactive'}</b></div>
        })}</div> : <EmptyCollection label="No student accounts" detail="Create the first invited user in Supabase Authentication. Their profile will appear here automatically." />}
      </article>
    </div>
  </section>
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
  const editable = version?.status === 'draft'
  const courseChanges = workspace.courseChanges.filter((event) => event.course_id === selectedCourse?.id).slice(0, 40)

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
      name: String(data.get('name')),
      shortName: String(data.get('shortName')),
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
            <div className="locked-field wide"><span>ACS publication</span><strong>{publication?.code} · {publication?.title}</strong><small>The canonical ACS publication remains fixed for this course revision.</small></div>
            <button className="button button-primary" type="submit">Save course changes</button>
          </form>
        </details>}
        {version && !editable && <div className="revision-lock" role="note"><strong>Revision locked</strong><span>Published course revisions cannot be changed. A new revision preserves existing student records.</span></div>}
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
              <div className="acs-builder-list">{selectedItems.map((item) => <div key={item.id}><code>{item.code}</code><strong>{item.description}</strong><small>{item.area_of_operation} · {item.task} · {item.element_type.replace('_', ' ')}</small></div>)}</div>
              {editable && <details className="inline-create" open={!selectedItems.length}><summary>Attach ACS line item</summary><form className="portal-form" onSubmit={createAcsItem}>
                <div className="form-grid"><label>ACS code<input name="code" placeholder="PA.IV.B.S2" required /></label><label>Element<select name="elementType" defaultValue="skill"><option value="knowledge">Knowledge</option><option value="risk_management">Risk management</option><option value="skill">Skill</option></select></label></div>
                <label>Area of operation<input name="area" required /></label><label>Task<input name="task" required /></label><label>Line-item description<textarea name="description" required /></label><button className="button button-primary" type="submit">Attach line item</button>
              </form></details>}
            </> : <EmptyCollection label="Select a lesson" detail="ACS line items are attached at lesson level and become the grade sheet." />}
          </article>
        </div>
        <article className="panel course-history">
          <div className="panel-heading"><div><p className="eyebrow dark">Permanent record</p><h2>Course change history</h2></div><span className="count-badge">{courseChanges.length}</span></div>
          <p className="history-intro">The baseline preserves the course as it existed when history was enabled. Every later change is stored with its editor, timestamp, and before-and-after values.</p>
          {courseChanges.length ? <div className="history-list">{courseChanges.map((event) => {
            const actor = event.changed_by ? workspace.profiles.find((profile) => profile.id === event.changed_by)?.full_name ?? 'Portal staff' : 'System baseline'
            const details = historyDetails(event)
            const actionLabel = event.action === 'baseline' ? 'Baseline recorded' : event.action === 'created' ? 'Created' : event.action === 'updated' ? 'Updated' : 'Deleted'
            return <details key={event.id}>
              <summary>
                <span className={`history-action ${event.action}`}>{actionLabel}</span>
                <div><strong>{historyEntityName(event, workspace)}</strong><small>{actor} · {formatDateTime(event.changed_at)}</small></div>
                <b>View record</b>
              </summary>
              <div className="history-diff" role="table" aria-label={`${historyEntityName(event, workspace)} changes`}>
                <div className="history-diff-head" role="row"><span role="columnheader">Field</span><span role="columnheader">Before</span><span role="columnheader">After</span></div>
                {details.map(({ field, before, after }) => <div role="row" key={field}><strong role="cell">{historyFieldLabels[field] ?? field}</strong><span role="cell">{event.action === 'created' || event.action === 'baseline' ? '—' : historyValue(before, field)}</span><span role="cell">{event.action === 'deleted' ? '—' : historyValue(after, field)}</span></div>)}
              </div>
            </details>
          })}</div> : <EmptyCollection label="No history recorded yet" detail="Install the course-history update to capture the current baseline and all future edits." />}
        </article>
      </div>
    </div> : <EmptyCollection label="No courses yet" detail="Create the first course above. Its first revision will be ready for phases, lessons, and ACS line items." />}
  </section>
}

interface GradeDraft { grade: OgmuiGrade; comment: string }

function GradeSheetsView({ profile, workspace, run }: { profile: PortalProfile; workspace: StaffWorkspace; run: Runner }) {
  const [enrollmentId, setEnrollmentId] = useState(workspace.enrollments.find((entry) => entry.status === 'active')?.id ?? '')
  const enrollment = workspace.enrollments.find((entry) => entry.id === enrollmentId)
  const version = workspace.versions.find((entry) => entry.id === enrollment?.course_version_id)
  const phaseIds = workspace.phases.filter((phase) => phase.course_version_id === version?.id).map((phase) => phase.id)
  const lessons = workspace.lessons.filter((lesson) => phaseIds.includes(lesson.phase_id))
  const [lessonId, setLessonId] = useState(lessons[0]?.id ?? '')
  const selectedLesson = lessons.find((lesson) => lesson.id === lessonId) ?? lessons[0]
  const mappings = workspace.lessonAcsItems.filter((mapping) => mapping.lesson_id === selectedLesson?.id)
  const items = mappings.map((mapping) => workspace.acsItems.find((item) => item.id === mapping.acs_item_id)).filter(Boolean) as AcsItem[]
  const [attemptId, setAttemptId] = useState<string | undefined>()
  const [conductedAt, setConductedAt] = useState(localDateTimeValue())
  const [groundMinutes, setGroundMinutes] = useState(30)
  const [trainingMinutes, setTrainingMinutes] = useState(90)
  const [whatWorked, setWhatWorked] = useState('')
  const [whatDidNotWork, setWhatDidNotWork] = useState('')
  const [correctiveAction, setCorrectiveAction] = useState('')
  const [nextPreparation, setNextPreparation] = useState('')
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, GradeDraft>>({})

  useEffect(() => {
    if (!enrollmentId && workspace.enrollments[0]) setEnrollmentId(workspace.enrollments[0].id)
    if (lessons[0] && !lessons.some((lesson) => lesson.id === lessonId)) setLessonId(lessons[0].id)
  }, [enrollmentId, lessonId, lessons, workspace.enrollments])

  function resetForm(nextLessonId = lessonId) {
    setLessonId(nextLessonId)
    setAttemptId(undefined)
    setConductedAt(localDateTimeValue())
    setGroundMinutes(30)
    setTrainingMinutes(90)
    setWhatWorked('')
    setWhatDidNotWork('')
    setCorrectiveAction('')
    setNextPreparation('')
    setGradeDrafts({})
  }

  function editAttempt(attempt: LessonAttempt) {
    setEnrollmentId(attempt.enrollment_id)
    setLessonId(attempt.lesson_id)
    setAttemptId(attempt.id)
    setConductedAt(localDateTimeValue(new Date(attempt.conducted_at)))
    setGroundMinutes(attempt.ground_minutes)
    setTrainingMinutes(attempt.training_minutes)
    setWhatWorked(attempt.what_worked ?? '')
    setWhatDidNotWork(attempt.what_did_not_work ?? '')
    setCorrectiveAction(attempt.corrective_action ?? '')
    setNextPreparation(attempt.next_lesson_preparation ?? '')
    const draft: Record<string, GradeDraft> = {}
    workspace.grades.filter((grade) => grade.lesson_attempt_id === attempt.id).forEach((grade) => { draft[grade.acs_item_id] = { grade: grade.grade, comment: grade.instructor_comment ?? '' } })
    setGradeDrafts(draft)
  }

  async function submit(status: 'draft' | 'published') {
    if (!enrollment || !selectedLesson || !items.length) return
    const result = await run(() => saveGradeSheet({
      attemptId,
      enrollmentId: enrollment.id,
      lessonId: selectedLesson.id,
      instructorId: profile.id,
      conductedAt,
      groundMinutes,
      trainingMinutes,
      whatWorked,
      whatDidNotWork,
      correctiveAction,
      nextPreparation,
      status,
      grades: items.map((item) => ({ acsItemId: item.id, grade: gradeDrafts[item.id]?.grade ?? 'I', comment: gradeDrafts[item.id]?.comment ?? '' })),
    }), status === 'published' ? 'Grade sheet published. The student can now read it.' : 'Draft grade sheet saved privately.')
    if (result) status === 'published' ? resetForm(selectedLesson.id) : setAttemptId(result)
  }

  const recentAttempts = workspace.attempts.slice(0, 12)
  return <section className="workspace-view">
    <div className="view-heading"><div><p className="eyebrow dark">Permanent training record</p><h1>Grade Sheets</h1><p>Evaluate the ACS line items assigned to a lesson, capture the debrief, then publish it to the student.</p></div><div className="grade-key">{(Object.keys(gradeLabels) as OgmuiGrade[]).map((grade) => <span key={grade}><Grade value={grade} />{gradeLabels[grade]}</span>)}</div></div>
    <div className="grade-workspace">
      <aside className="panel attempt-list"><div className="panel-heading"><div><p className="eyebrow dark">History</p><h2>Recent sheets</h2></div><button className="quiet-link" onClick={() => resetForm()}>New</button></div>{recentAttempts.length ? recentAttempts.map((attempt) => <button className={attempt.id === attemptId ? 'active' : ''} onClick={() => editAttempt(attempt)} key={attempt.id}><span className={attempt.status}>{attempt.status === 'published' ? '✓' : '•'}</span><div><strong>{studentName(workspace, workspace.enrollments.find((entry) => entry.id === attempt.enrollment_id)?.student_id ?? '')}</strong><small>{lessonName(workspace, attempt.lesson_id)} · Attempt {attempt.attempt_number}</small></div></button>) : <EmptyCollection label="No grade sheets" detail="Select an enrollment and lesson to create the first record." />}</aside>
      <article className="panel grade-editor">
        {workspace.enrollments.length ? <>
          <div className="form-grid portal-form"><label>Student & course<select value={enrollmentId} onChange={(event) => { setEnrollmentId(event.target.value); resetForm('') }}>{workspace.enrollments.map((entry) => <option value={entry.id} key={entry.id}>{studentName(workspace, entry.student_id)} · {courseName(workspace, entry.course_version_id)}</option>)}</select></label><label>Lesson<select value={selectedLesson?.id ?? ''} onChange={(event) => resetForm(event.target.value)}>{lessons.map((lesson) => <option value={lesson.id} key={lesson.id}>{lessonName(workspace, lesson.id)}</option>)}</select></label></div>
          {selectedLesson && items.length ? <>
            <div className="grade-editor-head"><div><p className="eyebrow dark">{attemptId ? 'Editing draft' : 'New grade sheet'}</p><h2>{selectedLesson.title}</h2><p>{studentName(workspace, enrollment?.student_id ?? '')}</p></div><span>{items.length} ACS item{items.length === 1 ? '' : 's'}</span></div>
            <div className="form-grid portal-form"><label>Conducted at<input type="datetime-local" value={conductedAt} onChange={(event) => setConductedAt(event.target.value)} /></label><label>Ground / training minutes<div className="paired-input"><input type="number" min="0" value={groundMinutes} onChange={(event) => setGroundMinutes(Number(event.target.value))} /><input type="number" min="0" value={trainingMinutes} onChange={(event) => setTrainingMinutes(Number(event.target.value))} /></div></label></div>
            <div className="grade-lines">{items.map((item) => <div key={item.id}><div><code>{item.code}</code><strong>{item.description}</strong><small>{item.element_type.replace('_', ' ')}</small></div><label>OGMUI<select aria-label={`${item.code} grade`} value={gradeDrafts[item.id]?.grade ?? 'I'} onChange={(event) => setGradeDrafts((current) => ({ ...current, [item.id]: { grade: event.target.value as OgmuiGrade, comment: current[item.id]?.comment ?? '' } }))}>{(Object.keys(gradeLabels) as OgmuiGrade[]).map((grade) => <option value={grade} key={grade}>{grade} · {gradeLabels[grade]}</option>)}</select></label><label>Instructor comment<textarea aria-label={`${item.code} instructor comment`} value={gradeDrafts[item.id]?.comment ?? ''} onChange={(event) => setGradeDrafts((current) => ({ ...current, [item.id]: { grade: current[item.id]?.grade ?? 'I', comment: event.target.value } }))} /></label></div>)}</div>
            <div className="debrief-editor portal-form"><div className="form-grid"><label>What worked<textarea value={whatWorked} onChange={(event) => setWhatWorked(event.target.value)} /></label><label>What did not work<textarea value={whatDidNotWork} onChange={(event) => setWhatDidNotWork(event.target.value)} /></label><label>Corrective action<textarea value={correctiveAction} onChange={(event) => setCorrectiveAction(event.target.value)} /></label><label>Next-lesson preparation<textarea value={nextPreparation} onChange={(event) => setNextPreparation(event.target.value)} /></label></div><div className="editor-actions"><button className="button button-outline" type="button" onClick={() => void submit('draft')}>Save draft</button><button className="button button-primary" type="button" onClick={() => void submit('published')}>Publish to student <span>→</span></button></div></div>
          </> : <EmptyCollection label="This lesson has no ACS line items" detail="Open Courses, select this lesson, and attach the ACS items that should appear on its grade sheet." />}
        </> : <EmptyCollection label="No active enrollments" detail="Enroll a student before creating a grade sheet." />}
      </article>
    </div>
  </section>
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
      <article className="panel collection-panel"><div className="panel-heading"><div><p className="eyebrow dark">Current library</p><h2>{workspace.resources.length} resource{workspace.resources.length === 1 ? '' : 's'}</h2></div></div>{workspace.resources.length ? <div className="resource-admin-list">{workspace.resources.map((resource) => <button onClick={() => void open(resource)} key={resource.id}><span>{resource.kind === 'video' ? '▶' : resource.kind === 'document' ? 'DOC' : '↗'}</span><div><strong>{resource.title}</strong><small>{resource.description || resource.kind} · {workspace.assignments.filter((entry) => entry.resource_id === resource.id).length} assignment</small></div><b>Open</b></button>)}</div> : <EmptyCollection label="No training resources" detail="Your first uploaded document or training video will appear here." />}</article>
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

  const content = view === 'overview' ? <StaffOverview profile={profile} workspace={workspace} navigate={setView} /> : view === 'students' ? <StudentsView profile={profile} workspace={workspace} run={run} /> : view === 'courses' ? <CoursesView workspace={workspace} run={run} /> : view === 'grades' ? <GradeSheetsView profile={profile} workspace={workspace} run={run} /> : <LibraryView profile={profile} workspace={workspace} run={run} />

  return <div className={`portal-shell ${busy ? 'is-busy' : ''}`}>
    <aside className="sidebar"><Brand /><nav>{staffNavItems.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav><div className="course-chip"><span>Training model</span><strong>Course → Phase → Lesson</strong><small>ACS → OGMUI → Feedback</small></div><div className="account-chip"><span>{initials(profile.full_name)}</span><div><strong>{profile.full_name}</strong><small>{profile.role === 'owner' ? 'Owner' : 'Instructor'}</small></div><button aria-label="Sign out" title="Sign out" onClick={() => void supabase?.auth.signOut()}>↗</button></div></aside>
    <main className="portal-main"><header className="mobile-header"><Brand /><button className="mobile-account" onClick={() => void supabase?.auth.signOut()} aria-label="Sign out">{initials(profile.full_name)}</button></header><nav className="mobile-nav">{staffNavItems.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav><div className="main-inner">{content}</div></main>
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

function StudentDashboard({ profile, workspace, navigate }: { profile: PortalProfile; workspace: StudentWorkspace; navigate: (view: StudentView) => void }) {
  const completed = new Set(workspace.attempts.map((attempt) => attempt.lesson_id))
  const phaseOrder = new Map(workspace.phases.map((phase) => [phase.id, phase.phase_number]))
  const lessons = [...workspace.lessons].sort((a, b) => (phaseOrder.get(a.phase_id) ?? 0) - (phaseOrder.get(b.phase_id) ?? 0) || a.lesson_number - b.lesson_number)
  const nextLesson = lessons.find((lesson) => !completed.has(lesson.id))
  const latest = workspace.attempts[0]
  const latestLesson = workspace.lessons.find((lesson) => lesson.id === latest?.lesson_id)
  const progress = lessons.length ? Math.round((completed.size / lessons.length) * 100) : 0
  const currentPhase = workspace.phases.find((phase) => phase.id === nextLesson?.phase_id)

  return <>
    <section className="welcome-row"><div><p className="eyebrow dark">Active course · Revision {workspace.version.revision}</p><h1>Welcome back, {profile.full_name.split(/\s+/)[0]}.</h1><p className="lede">Your syllabus, assigned preparation, ACS progress, and every published instructor comment stay together here.</p></div><div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}><div><strong>{progress}%</strong><span>course</span></div></div></section>
    <section className="dashboard-grid">
      <article className="next-lesson panel panel-dark"><div className="panel-kicker"><span>{nextLesson ? 'Next lesson' : 'Course status'}</span><span>{currentPhase ? `Phase ${String(currentPhase.phase_number).padStart(2, '0')}` : 'Complete'}</span></div><p className="lesson-number">{nextLesson ? String(nextLesson.lesson_number).padStart(2, '0') : '✓'}</p><h2>{nextLesson?.title ?? 'All assigned lessons complete'}</h2><p>{nextLesson?.objective ?? 'Your instructor will review completion and next steps with you.'}</p>{nextLesson && <dl className="lesson-meta"><div><dt>Type</dt><dd>{nextLesson.kind}</dd></div><div><dt>Planned time</dt><dd>{nextLesson.planned_ground_minutes + nextLesson.planned_training_minutes} min</dd></div><div><dt>Preparation</dt><dd>{nextLesson.preparation ? 'Assigned' : 'None listed'}</dd></div></dl>}<button className="button button-light" onClick={() => navigate('course')}>Open course <span>→</span></button></article>
      <article className="panel recent-debrief"><div className="panel-heading"><div><p className="eyebrow dark">Latest instructor debrief</p><h2>{latestLesson ? `Lesson ${latestLesson.lesson_number}` : 'No published record yet'}</h2></div>{latest && <span className="status-pill">Published</span>}</div>{latest ? <><p className="quote">“{latest.what_worked || 'Review the complete grade sheet for instructor feedback.'}”</p><div className="debrief-split"><div><span>What worked</span><p>{latest.what_worked || 'No comment entered.'}</p></div><div><span>What did not work</span><p>{latest.what_did_not_work || 'No comment entered.'}</p></div></div><button className="text-button" onClick={() => navigate('record')}>Read complete grade sheet <span>→</span></button></> : <EmptyCollection label="Your first debrief will appear here" detail="Published grade sheets remain available throughout your course." />}</article>
    </section>
    <section className="lower-grid"><article className="panel phase-panel"><div className="panel-heading"><div><p className="eyebrow dark">Course position</p><h2>{workspace.course.name}</h2></div><strong>{completed.size} / {lessons.length}</strong></div><div className="phase-list">{workspace.phases.map((phase) => { const phaseLessons = workspace.lessons.filter((lesson) => lesson.phase_id === phase.id); const done = phaseLessons.filter((lesson) => completed.has(lesson.id)).length; return <div className={phase.id === currentPhase?.id ? 'active' : ''} key={phase.id}><span>{String(phase.phase_number).padStart(2, '0')}</span><strong>{phase.title}</strong><small>{done} of {phaseLessons.length}</small></div> })}</div></article><article className="panel attention-panel"><div className="panel-heading"><div><p className="eyebrow dark">Assigned resources</p><h2>Course library</h2></div><button className="quiet-link" onClick={() => navigate('library')}>View all</button></div>{workspace.resources.length ? <div className="attention-list">{workspace.resources.slice(0, 3).map((resource) => <div key={resource.id}><span className="resource-mini">{resource.kind === 'video' ? '▶' : 'DOC'}</span><div><strong>{resource.title}</strong><p>{resource.description || resource.kind}</p></div></div>)}</div> : <EmptyCollection label="No resources assigned" detail="Documents and videos from your instructor will appear here." />}</article></section>
  </>
}

function StudentCourse({ workspace }: { workspace: StudentWorkspace }) {
  const phaseOrder = new Map(workspace.phases.map((phase) => [phase.id, phase.phase_number]))
  const ordered = [...workspace.lessons].sort((a, b) => (phaseOrder.get(a.phase_id) ?? 0) - (phaseOrder.get(b.phase_id) ?? 0) || a.lesson_number - b.lesson_number)
  const [lessonId, setLessonId] = useState(ordered[0]?.id ?? '')
  const lesson = workspace.lessons.find((entry) => entry.id === lessonId) ?? ordered[0]
  const attempt = workspace.attempts.find((entry) => entry.lesson_id === lesson?.id)
  const items = workspace.lessonAcsItems.filter((mapping) => mapping.lesson_id === lesson?.id).map((mapping) => workspace.acsItems.find((item) => item.id === mapping.acs_item_id)).filter(Boolean) as AcsItem[]
  const grades = workspace.grades.filter((grade) => grade.lesson_attempt_id === attempt?.id)

  return <section className="workspace-view"><div className="view-heading"><div><p className="eyebrow dark">Active enrollment</p><h1>{workspace.course.name}</h1><p>{workspace.publication.code} · Course revision {workspace.version.revision}</p></div></div><div className="course-layout"><div className="lesson-sequence panel">{workspace.phases.map((phase) => <div className="student-phase" key={phase.id}><h2>Phase {String(phase.phase_number).padStart(2, '0')} · {phase.title}</h2>{ordered.filter((entry) => entry.phase_id === phase.id).map((entry) => { const complete = workspace.attempts.some((attemptEntry) => attemptEntry.lesson_id === entry.id); return <button className={`${complete ? 'complete' : ''} ${entry.id === lesson?.id ? 'selected' : ''}`} key={entry.id} onClick={() => setLessonId(entry.id)}><span>{complete ? '✓' : entry.lesson_number}</span><div><small>{entry.kind}</small><strong>{entry.title}</strong></div><b>→</b></button> })}</div>)}</div><article className="lesson-detail panel">{lesson ? <><div className="panel-kicker dark"><span>Lesson {lesson.lesson_number}</span><span>{attempt ? 'complete' : 'upcoming'}</span></div><h2>{lesson.title}</h2><p>{lesson.objective}</p><h3>Completion standard</h3><p>{lesson.completion_standard}</p><h3>Preparation</h3><p>{lesson.preparation || 'No preparation has been listed.'}</p><h3>ACS line items</h3>{items.length ? <div className="compact-grades">{items.map((item) => { const grade = grades.find((entry) => entry.acs_item_id === item.id); return <div key={item.id}>{grade ? <Grade value={grade.grade} /> : <span className="grade grade-i">—</span>}<div><code>{item.code}</code><strong>{item.description}</strong><p>{grade?.instructor_comment || 'Not yet evaluated.'}</p></div></div> })}</div> : <p className="empty-state">No ACS line items have been assigned.</p>}</> : <EmptyCollection label="No lessons yet" detail="Your instructor is still building this course." />}</article></div></section>
}

function StudentRecord({ workspace }: { workspace: StudentWorkspace }) {
  return <section className="workspace-view"><div className="view-heading"><div><p className="eyebrow dark">Permanent history</p><h1>Training Record</h1><p>Every published attempt, OGMUI grade, and instructor comment remains available here.</p></div></div><div className="record-list">{workspace.attempts.length ? workspace.attempts.map((attempt) => { const lesson = workspace.lessons.find((entry) => entry.id === attempt.lesson_id); const grades = workspace.grades.filter((entry) => entry.lesson_attempt_id === attempt.id); return <article className="panel" key={attempt.id}><div className="record-head"><div><small>{formatDate(attempt.conducted_at)} · Lesson {lesson?.lesson_number} · Attempt {attempt.attempt_number}</small><h2>{lesson?.title}</h2></div><span className="status-pill">Published</span></div><div className="record-debrief"><div><span>What worked</span><p>{attempt.what_worked || 'No comment entered.'}</p></div><div><span>What did not work</span><p>{attempt.what_did_not_work || 'No comment entered.'}</p></div><div><span>Corrective action</span><p>{attempt.corrective_action || 'No corrective action entered.'}</p></div><div><span>Next preparation</span><p>{attempt.next_lesson_preparation || 'No preparation entered.'}</p></div></div><div className="compact-grades">{grades.map((grade) => { const item = workspace.acsItems.find((entry) => entry.id === grade.acs_item_id); return <div key={grade.id}><Grade value={grade.grade} /><div><code>{item?.code}</code><strong>{item?.description}</strong><p>{grade.instructor_comment || 'No line-item comment entered.'}</p></div></div> })}</div><footer>Instructor · {workspace.instructor?.full_name ?? 'Pilot Consciousness'}<span>{attempt.ground_minutes} ground · {attempt.training_minutes} training min</span></footer></article> }) : <EmptyCollection label="No published grade sheets" detail="Your instructor’s comments will remain here after the first lesson is published." />}</div></section>
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
  const nextLesson = workspace.lessons.find((lesson) => !workspace.attempts.some((attempt) => attempt.lesson_id === lesson.id))
  return <div className="portal-shell"><aside className="sidebar"><Brand /><nav>{studentNavItems.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav><div className="course-chip"><span>Active course</span><strong>{workspace.course.short_name}</strong><small>{nextLesson ? `Next · Lesson ${nextLesson.lesson_number}` : 'Course lessons complete'}</small></div><div className="account-chip"><span>{initials(profile.full_name)}</span><div><strong>{profile.full_name}</strong><small>Student</small></div><button aria-label="Sign out" title="Sign out" onClick={() => void supabase?.auth.signOut()}>↗</button></div></aside><main className="portal-main"><header className="mobile-header"><Brand /><button className="mobile-account" onClick={() => void supabase?.auth.signOut()} aria-label="Sign out">{initials(profile.full_name)}</button></header><nav className="mobile-nav">{studentNavItems.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav><div className="main-inner">{content}</div></main></div>
}

export function StudentWaitingRoom({ profile }: { profile: PortalProfile }) {
  return <main className="waiting-page"><section className="waiting-panel panel"><div className="dark-brand"><Brand /></div><div><p className="eyebrow dark">Account ready</p><h1>Welcome, {profile.full_name.split(/\s+/)[0]}.</h1><p>Your account is active, but no course has been assigned yet. Your dashboard will open here as soon as your instructor enrolls you.</p></div><button className="button button-outline" onClick={() => void supabase?.auth.signOut()}>Sign out</button></section></main>
}
