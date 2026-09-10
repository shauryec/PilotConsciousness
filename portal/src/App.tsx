import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { attentionItems, lessons, phases, resources, student, type OgmuiGrade } from './data/demo'
import { loadProfile, loadStaffWorkspace, type PortalProfile, type StaffWorkspace } from './lib/portal'
import { hasSupabaseConfig, supabase } from './lib/supabase'

type View = 'dashboard' | 'course' | 'record' | 'acs' | 'library'

const navItems: Array<{ id: View; label: string; short: string }> = [
  { id: 'dashboard', label: 'Dashboard', short: 'DB' },
  { id: 'course', label: 'Course', short: 'CR' },
  { id: 'record', label: 'Training Record', short: 'TR' },
  { id: 'acs', label: 'ACS Progress', short: 'AP' },
  { id: 'library', label: 'Documents & Videos', short: 'DV' },
]

const gradeLabels: Record<OgmuiGrade, string> = {
  O: 'Outstanding',
  G: 'Good',
  M: 'Minimal',
  U: 'Unsatisfactory',
  I: 'Incomplete',
}

function Grade({ value }: { value: OgmuiGrade }) {
  return <span className={`grade grade-${value.toLowerCase()}`} title={gradeLabels[value]}>{value}</span>
}

function ProgressRing() {
  const progress = Math.round((student.completedLessons / student.totalLessons) * 100)
  return (
    <div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}>
      <div><strong>{progress}%</strong><span>course</span></div>
    </div>
  )
}

function Dashboard({ navigate }: { navigate: (view: View) => void }) {
  return (
    <>
      <section className="welcome-row">
        <div>
          <p className="eyebrow">Wednesday · September 9</p>
          <h1>Good morning, Alex.</h1>
          <p className="lede">Your next lesson is ready. Review the assigned material before arriving at Falcon Field.</p>
        </div>
        <ProgressRing />
      </section>

      <section className="dashboard-grid">
        <article className="next-lesson panel panel-dark">
          <div className="panel-kicker"><span>Next lesson</span><span>Phase 01</span></div>
          <p className="lesson-number">09</p>
          <h2>Slow Flight and Stalls</h2>
          <p>Recognition, aerodynamic awareness, recovery, and risk controls in the Cirrus SR20.</p>
          <dl className="lesson-meta">
            <div><dt>Aircraft</dt><dd>Cirrus SR20</dd></div>
            <div><dt>Location</dt><dd>Falcon Field · KFFZ</dd></div>
            <div><dt>Preparation</dt><dd>2 required items</dd></div>
          </dl>
          <button className="button button-light" onClick={() => navigate('course')}>Open lesson briefing <span>→</span></button>
        </article>

        <article className="panel recent-debrief">
          <div className="panel-heading">
            <div><p className="eyebrow dark">Instructor debrief</p><h2>Lesson 08</h2></div>
            <span className="status-pill">Published</span>
          </div>
          <p className="quote">“Workload management remained strong with increased traffic and runway changes.”</p>
          <div className="debrief-split">
            <div><span>What worked</span><p>Traffic awareness, spacing, configuration, and timely radio calls.</p></div>
            <div><span>Next focus</span><p>Maintain the same outside scan while introducing slow-flight indications.</p></div>
          </div>
          <button className="text-button" onClick={() => navigate('record')}>Read complete grade sheet <span>→</span></button>
        </article>
      </section>

      <section className="lower-grid">
        <article className="panel phase-panel">
          <div className="panel-heading"><div><p className="eyebrow dark">Course position</p><h2>Phase 01 · Foundations</h2></div><strong>8 / 11</strong></div>
          <div className="phase-track" aria-label="Eight of eleven Phase 1 lessons complete">
            {Array.from({ length: 11 }, (_, index) => <span className={index < 8 ? 'complete' : index === 8 ? 'current' : ''} key={index} />)}
          </div>
          <div className="phase-list">
            {phases.map((phase) => (
              <div className={phase.status === 'current' ? 'active' : ''} key={phase.number}>
                <span>{String(phase.number).padStart(2, '0')}</span><strong>{phase.title}</strong><small>{phase.completed} of {phase.total}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel attention-panel">
          <div className="panel-heading"><div><p className="eyebrow dark">ACS attention</p><h2>Next opportunities</h2></div><button className="quiet-link" onClick={() => navigate('acs')}>View all</button></div>
          <div className="attention-list">
            {attentionItems.map((item) => (
              <div key={item.code}>
                <Grade value={item.grade} />
                <div><code>{item.code}</code><strong>{item.label}</strong><p>{item.note}</p></div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="assigned-strip">
        <div><p className="eyebrow dark">Newly assigned</p><h2>Prepare for Lesson 09</h2></div>
        {resources.slice(0, 2).map((resource) => (
          <button key={resource.title} onClick={() => navigate('library')}>
            <span>{resource.type === 'Video' ? '▶' : 'DOC'}</span>
            <div><strong>{resource.title}</strong><small>{resource.meta}</small></div>
            <b>→</b>
          </button>
        ))}
      </section>
    </>
  )
}

function CourseView() {
  const [selectedLesson, setSelectedLesson] = useState(lessons.find((lesson) => lesson.status === 'current') ?? lessons[0])
  return (
    <section className="workspace-view">
      <div className="view-heading"><div><p className="eyebrow dark">Active enrollment</p><h1>{student.course}</h1><p>{student.aircraft} · {student.airport} · ACS FAA-S-ACS-6C</p></div><span className="course-version">Course revision 1</span></div>
      <div className="course-layout">
        <div className="lesson-sequence panel">
          <h2>Phase 01 · Foundations</h2>
          {lessons.map((lesson) => (
            <button className={`${lesson.status} ${selectedLesson.id === lesson.id ? 'selected' : ''}`} key={lesson.id} onClick={() => setSelectedLesson(lesson)}>
              <span>{lesson.status === 'complete' ? '✓' : lesson.code.replace('Lesson ', '')}</span>
              <div><small>{lesson.code}</small><strong>{lesson.title}</strong></div>
              <b>→</b>
            </button>
          ))}
        </div>
        <article className="lesson-detail panel">
          <div className="panel-kicker dark"><span>{selectedLesson.code}</span><span>{selectedLesson.status}</span></div>
          <h2>{selectedLesson.title}</h2>
          <p>{selectedLesson.summary}</p>
          {selectedLesson.status === 'current' ? (
            <>
              <h3>Lesson objective</h3>
              <p>Recognize and manage the airplane near the aerodynamic limit, maintain coordinated control, and recover using the appropriate procedure.</p>
              <h3>Required preparation</h3>
              <ul className="check-list"><li>Lesson 09 Briefing Guide</li><li>Stall Recognition in the SR20 · 08:42</li></ul>
              <h3>Assigned ACS line items</h3>
              <div className="acs-tags"><span>PA.VII.A</span><span>PA.VII.B</span><span>PA.VII.C</span></div>
            </>
          ) : selectedLesson.grades ? (
            <>
              <h3>Published grades</h3>
              <div className="compact-grades">{selectedLesson.grades.map((grade) => <div key={grade.code}><Grade value={grade.grade} /><div><code>{grade.code}</code><strong>{grade.item}</strong><p>{grade.comment}</p></div></div>)}</div>
            </>
          ) : <p className="empty-state">This lesson has not begun.</p>}
        </article>
      </div>
    </section>
  )
}

function RecordView() {
  const completed = lessons.filter((lesson) => lesson.status === 'complete')
  return (
    <section className="workspace-view">
      <div className="view-heading"><div><p className="eyebrow dark">Permanent history</p><h1>Training Record</h1><p>Published lesson attempts, grades, and instructor comments.</p></div><button className="button button-outline">Export PDF</button></div>
      <div className="record-list">
        {completed.slice().reverse().map((lesson) => (
          <article className="panel" key={lesson.id}>
            <div className="record-head"><div><small>{lesson.date} · {lesson.code}</small><h2>{lesson.title}</h2></div><span className="status-pill">Complete</span></div>
            <p>{lesson.summary}</p>
            <div className="compact-grades">{lesson.grades?.map((grade) => <div key={grade.code}><Grade value={grade.grade} /><div><code>{grade.code}</code><strong>{grade.item}</strong><p>{grade.comment}</p></div></div>)}</div>
            <footer>Instructor · {student.instructor}<span>Published {lesson.date}</span></footer>
          </article>
        ))}
      </div>
    </section>
  )
}

function AcsView() {
  const rows = useMemo(() => lessons.flatMap((lesson) => lesson.grades?.map((grade) => ({ ...grade, lesson: lesson.code, date: lesson.date })) ?? []), [])
  return (
    <section className="workspace-view">
      <div className="view-heading"><div><p className="eyebrow dark">FAA-S-ACS-6C</p><h1>ACS Progress</h1><p>Every evaluated line item remains connected to the lesson where it was demonstrated.</p></div><div className="grade-key">{(['O','G','M','U','I'] as OgmuiGrade[]).map((grade) => <span key={grade}><Grade value={grade} />{gradeLabels[grade]}</span>)}</div></div>
      <article className="panel acs-table-wrap">
        <table className="acs-table">
          <thead><tr><th>ACS line item</th><th>Latest grade</th><th>Lesson</th><th>Instructor comment</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={`${row.code}-${row.lesson}`}><td><code>{row.code}</code><strong>{row.item}</strong></td><td><Grade value={row.grade} /></td><td>{row.lesson}<small>{row.date}</small></td><td>{row.comment}</td></tr>)}</tbody>
        </table>
      </article>
    </section>
  )
}

function LibraryView() {
  return (
    <section className="workspace-view">
      <div className="view-heading"><div><p className="eyebrow dark">Course library</p><h1>Documents & Videos</h1><p>Course material, aircraft references, and resources assigned by your instructor.</p></div></div>
      <div className="resource-grid">{resources.map((resource) => <article className="panel" key={resource.title}><span className="resource-type">{resource.type}</span><h2>{resource.title}</h2><p>{resource.meta}</p><footer><span>{resource.tag}</span><button>Open <b>→</b></button></footer></article>)}</div>
    </section>
  )
}

function Portal() {
  const [view, setView] = useState<View>('dashboard')
  const viewContent = view === 'dashboard' ? <Dashboard navigate={setView} /> : view === 'course' ? <CourseView /> : view === 'record' ? <RecordView /> : view === 'acs' ? <AcsView /> : <LibraryView />

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><span className="brand-star">✦</span><div><strong>Pilot Consciousness</strong><small>Training Portal</small></div></div>
        <nav>{navItems.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav>
        <div className="course-chip"><span>Active course</span><strong>Private Pilot</strong><small>Phase 01 · Lesson 09</small></div>
        <div className="account-chip"><span>{student.initials}</span><div><strong>{student.name}</strong><small>Student</small></div><button aria-label="Account options">•••</button></div>
      </aside>
      <main className="portal-main">
        <header className="mobile-header"><div className="brand-lockup"><span className="brand-star">✦</span><div><strong>Pilot Consciousness</strong><small>Training Portal</small></div></div><span>{student.initials}</span></header>
        <nav className="mobile-nav">{navItems.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav>
        <div className="main-inner">{viewContent}</div>
      </main>
      {!hasSupabaseConfig && <div className="demo-badge">Design preview · sample student</div>}
    </div>
  )
}

type StaffView = 'overview' | 'students' | 'courses' | 'library'

const staffNavItems: Array<{ id: StaffView; label: string; short: string }> = [
  { id: 'overview', label: 'Overview', short: 'OV' },
  { id: 'students', label: 'Students', short: 'ST' },
  { id: 'courses', label: 'Courses', short: 'CR' },
  { id: 'library', label: 'Resource Library', short: 'RL' },
]

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'PC'
}

function EmptyCollection({ label, detail }: { label: string; detail: string }) {
  return <div className="collection-empty"><span>—</span><div><strong>{label}</strong><p>{detail}</p></div></div>
}

function StaffOverview({ profile, workspace, navigate }: { profile: PortalProfile; workspace: StaffWorkspace; navigate: (view: StaffView) => void }) {
  const firstName = profile.full_name.split(/\s+/)[0] || profile.email
  const workspaceLabel = profile.role === 'owner' ? 'Owner workspace' : 'Instructor workspace'
  const setup = [
    { done: true, title: 'Owner account', detail: 'Your secure owner profile is active.' },
    { done: workspace.courses.length > 0, title: 'Create the first course', detail: 'Build the Private Pilot course from phases, lessons, and ACS items.' },
    { done: workspace.stats.students > 0, title: 'Add the first student', detail: 'Invite a student, then assign their course and instructor.' },
  ]

  return (
    <>
      <section className="staff-welcome">
        <div><p className="eyebrow dark">{workspaceLabel}</p><h1>Good morning, {firstName}.</h1><p className="lede">Your training operation at a glance. This dashboard is reading live data from your portal.</p></div>
        <span className="live-badge"><i />Live workspace</span>
      </section>
      <section className="metric-grid" aria-label="Portal totals">
        <article><span>Students</span><strong>{workspace.stats.students}</strong><small>invited accounts</small></article>
        <article><span>Active enrollments</span><strong>{workspace.stats.activeEnrollments}</strong><small>courses in progress</small></article>
        <article><span>Courses</span><strong>{workspace.stats.courses}</strong><small>active templates</small></article>
        <article><span>Draft grade sheets</span><strong>{workspace.stats.draftGradeSheets}</strong><small>not visible to students</small></article>
      </section>
      <section className="staff-grid">
        <article className="panel setup-panel">
          <div className="panel-heading"><div><p className="eyebrow dark">Initial setup</p><h2>Build the training workspace</h2></div><strong>{setup.filter((item) => item.done).length} / {setup.length}</strong></div>
          <div className="setup-list">{setup.map((item) => <div className={item.done ? 'done' : ''} key={item.title}><span>{item.done ? '✓' : '○'}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></div>)}</div>
        </article>
        <article className="panel roster-panel">
          <div className="panel-heading"><div><p className="eyebrow dark">Student roster</p><h2>Recently added</h2></div><button className="quiet-link" onClick={() => navigate('students')}>View roster</button></div>
          {workspace.students.length ? <div className="roster-list">{workspace.students.slice(0, 4).map((studentProfile) => <div key={studentProfile.id}><span>{initials(studentProfile.full_name)}</span><div><strong>{studentProfile.full_name}</strong><small>{studentProfile.email}</small></div><b>{studentProfile.active ? 'Active' : 'Inactive'}</b></div>)}</div> : <EmptyCollection label="No students yet" detail="The first invited student will appear here." />}
        </article>
      </section>
      <article className="panel course-summary">
        <div className="panel-heading"><div><p className="eyebrow dark">Course catalog</p><h2>Training courses</h2></div><button className="quiet-link" onClick={() => navigate('courses')}>View courses</button></div>
        {workspace.courses.length ? <div className="course-summary-list">{workspace.courses.slice(0, 3).map((course) => <div key={course.id}><span>{course.short_name.slice(0, 2).toUpperCase()}</span><div><strong>{course.name}</strong><small>{course.short_name}</small></div><b>{course.active ? 'Active' : 'Inactive'}</b></div>)}</div> : <EmptyCollection label="No course templates yet" detail="Private Pilot will become the first course, organized by phase, lesson, and ACS line item." />}
      </article>
    </>
  )
}

function StaffCollectionView({ view, workspace }: { view: Exclude<StaffView, 'overview'>; workspace: StaffWorkspace }) {
  const content = {
    students: { eyebrow: 'Accounts & enrollment', title: 'Students', detail: 'Invited student accounts and their training status.' },
    courses: { eyebrow: 'Syllabus builder', title: 'Courses', detail: 'Versioned training courses organized into phases, lessons, and ACS line items.' },
    library: { eyebrow: 'Documents & video', title: 'Resource Library', detail: 'Training material that can be assigned to a course, lesson, or student.' },
  }[view]

  return (
    <section className="workspace-view">
      <div className="view-heading"><div><p className="eyebrow dark">{content.eyebrow}</p><h1>{content.title}</h1><p>{content.detail}</p></div></div>
      <article className="panel collection-panel">
        {view === 'students' && (workspace.students.length ? <div className="directory-list">{workspace.students.map((studentProfile) => <div key={studentProfile.id}><span>{initials(studentProfile.full_name)}</span><div><strong>{studentProfile.full_name}</strong><small>{studentProfile.email}</small></div><b>{studentProfile.active ? 'Active' : 'Inactive'}</b></div>)}</div> : <EmptyCollection label="No student accounts" detail="Your invited students will be listed here with their enrollment status." />)}
        {view === 'courses' && (workspace.courses.length ? <div className="directory-list">{workspace.courses.map((course) => <div key={course.id}><span>{course.short_name.slice(0, 2).toUpperCase()}</span><div><strong>{course.name}</strong><small>{course.short_name}</small></div><b>{course.active ? 'Active' : 'Inactive'}</b></div>)}</div> : <EmptyCollection label="No courses yet" detail="The next step is to load the applicable ACS publication and create Private Pilot as the first course." />)}
        {view === 'library' && <EmptyCollection label="No resources yet" detail="Uploaded documents, lesson briefings, and training videos will appear here." />}
      </article>
    </section>
  )
}

function StaffPortal({ profile, workspace }: { profile: PortalProfile; workspace: StaffWorkspace }) {
  const [view, setView] = useState<StaffView>('overview')
  const content = view === 'overview' ? <StaffOverview profile={profile} workspace={workspace} navigate={setView} /> : <StaffCollectionView view={view} workspace={workspace} />
  const roleLabel = profile.role === 'owner' ? 'Owner' : 'Instructor'

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><span className="brand-star">✦</span><div><strong>Pilot Consciousness</strong><small>Training Portal</small></div></div>
        <nav>{staffNavItems.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav>
        <div className="course-chip"><span>Workspace status</span><strong>Portal foundation</strong><small>Owner account connected</small></div>
        <div className="account-chip"><span>{initials(profile.full_name)}</span><div><strong>{profile.full_name}</strong><small>{roleLabel}</small></div><button aria-label="Sign out" title="Sign out" onClick={() => void supabase?.auth.signOut()}>↗</button></div>
      </aside>
      <main className="portal-main">
        <header className="mobile-header"><div className="brand-lockup"><span className="brand-star">✦</span><div><strong>Pilot Consciousness</strong><small>Training Portal</small></div></div><button className="mobile-account" onClick={() => void supabase?.auth.signOut()} aria-label="Sign out">{initials(profile.full_name)}</button></header>
        <nav className="mobile-nav">{staffNavItems.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}><span>{item.short}</span>{item.label}</button>)}</nav>
        <div className="main-inner">{content}</div>
      </main>
    </div>
  )
}

function StudentWaitingRoom({ profile }: { profile: PortalProfile }) {
  return (
    <main className="waiting-page">
      <section className="waiting-panel panel">
        <div className="brand-lockup dark-brand"><span className="brand-star">✦</span><div><strong>Pilot Consciousness</strong><small>Training Portal</small></div></div>
        <div><p className="eyebrow dark">Account ready</p><h1>Welcome, {profile.full_name.split(/\s+/)[0]}.</h1><p>Your account is active, but no course has been assigned yet. Your dashboard will open here as soon as your instructor enrolls you.</p></div>
        <button className="button button-outline" onClick={() => void supabase?.auth.signOut()}>Sign out</button>
      </section>
    </main>
  )
}

function AccountState({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <main className="waiting-page"><section className="waiting-panel panel"><div className="brand-lockup dark-brand"><span className="brand-star">✦</span><div><strong>Pilot Consciousness</strong><small>Training Portal</small></div></div><div><p className="eyebrow dark">Secure portal</p><h1>{title}</h1><p>{detail}</p></div>{action}</section></main>
}

function AuthenticatedPortal({ session }: { session: Session }) {
  const [profile, setProfile] = useState<PortalProfile | null>(null)
  const [workspace, setWorkspace] = useState<StaffWorkspace | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    setError('')

    void loadProfile(session.user)
      .then(async (loadedProfile) => {
        if (!current) return
        setProfile(loadedProfile)
        if (loadedProfile.role === 'owner' || loadedProfile.role === 'instructor') {
          const loadedWorkspace = await loadStaffWorkspace()
          if (current) setWorkspace(loadedWorkspace)
        }
      })
      .catch((reason: unknown) => {
        if (current) setError(reason instanceof Error ? reason.message : 'The portal could not load your account.')
      })

    return () => { current = false }
  }, [session.user])

  if (error) return <AccountState title="We could not open your account." detail={error} action={<button className="button button-outline" onClick={() => void supabase?.auth.signOut()}>Return to sign in</button>} />
  if (!profile || ((profile.role === 'owner' || profile.role === 'instructor') && !workspace)) return <AccountState title="Opening your workspace…" detail="Checking your account and loading current training data." />
  if (!profile.active) return <AccountState title="This account is inactive." detail="Contact Pilot Consciousness if you believe this is an error." action={<button className="button button-outline" onClick={() => void supabase?.auth.signOut()}>Sign out</button>} />
  if (profile.role === 'student') return <StudentWaitingRoom profile={profile} />
  return <StaffPortal profile={profile} workspace={workspace!} />
}

function Login() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: false,
      },
    })
    setMessage(error ? error.message : 'Check your email for your secure sign-in link.')
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-lockup"><span className="brand-star">✦</span><div><strong>Pilot Consciousness</strong><small>Training Portal</small></div></div>
        <div><p className="eyebrow">Student access</p><h1>Continue your training.</h1><p>Enter the email address associated with your course. We will send a secure sign-in link.</p></div>
        <form onSubmit={sendMagicLink}><label htmlFor="email">Email address</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><button className="button button-light" type="submit">Send sign-in link <span>→</span></button>{message && <p className="form-message">{message}</p>}</form>
        <small>Access is limited to invited Pilot Consciousness students and instructors.</small>
      </section>
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) {
      setSession(null)
      return
    }

    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!hasSupabaseConfig) return <Portal />
  if (session === undefined) return <main className="login-page"><p>Loading secure portal…</p></main>
  return session ? <AuthenticatedPortal session={session} /> : <Login />
}
