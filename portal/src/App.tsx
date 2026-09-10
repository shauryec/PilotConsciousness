import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { StaffPortal, StudentPortal, StudentWaitingRoom } from './TrainingPortal'
import { loadProfile, loadStaffWorkspace, loadStudentWorkspace, type PortalProfile, type StaffWorkspace, type StudentWorkspace } from './lib/portal'
import { hasSupabaseConfig, supabase } from './lib/supabase'

function Brand() {
  return <div className="brand-lockup"><span className="brand-star">✦</span><div><strong>Pilot Consciousness</strong><small>Training Portal</small></div></div>
}

function AccountState({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <main className="waiting-page"><section className="waiting-panel panel"><div className="dark-brand"><Brand /></div><div><p className="eyebrow dark">Secure portal</p><h1>{title}</h1><p>{detail}</p></div>{action}</section></main>
}

function AuthenticatedPortal({ session }: { session: Session }) {
  const [profile, setProfile] = useState<PortalProfile | null>(null)
  const [staffWorkspace, setStaffWorkspace] = useState<StaffWorkspace | null>(null)
  const [studentWorkspace, setStudentWorkspace] = useState<StudentWorkspace | null | undefined>(undefined)
  const [error, setError] = useState('')

  async function refreshStaff() {
    setStaffWorkspace(await loadStaffWorkspace())
  }

  useEffect(() => {
    let current = true
    setError('')
    void loadProfile(session.user).then(async (loadedProfile) => {
      if (!current) return
      setProfile(loadedProfile)
      if (loadedProfile.role === 'owner' || loadedProfile.role === 'instructor') {
        const workspace = await loadStaffWorkspace()
        if (current) setStaffWorkspace(workspace)
      } else {
        const workspace = await loadStudentWorkspace(loadedProfile.id)
        if (current) setStudentWorkspace(workspace)
      }
    }).catch((reason: unknown) => {
      if (current) setError(reason instanceof Error ? reason.message : 'The portal could not load your account.')
    })
    return () => { current = false }
  }, [session.user])

  if (error) return <AccountState title="We could not open your account." detail={error} action={<button className="button button-outline" onClick={() => void supabase?.auth.signOut()}>Return to sign in</button>} />
  if (!profile) return <AccountState title="Opening your workspace…" detail="Checking your account and loading current training data." />
  if (!profile.active) return <AccountState title="This account is inactive." detail="Contact Pilot Consciousness if you believe this is an error." action={<button className="button button-outline" onClick={() => void supabase?.auth.signOut()}>Sign out</button>} />
  if (profile.role === 'student') {
    if (studentWorkspace === undefined) return <AccountState title="Opening your course…" detail="Loading your syllabus, records, and assigned resources." />
    return studentWorkspace ? <StudentPortal profile={profile} workspace={studentWorkspace} /> : <StudentWaitingRoom profile={profile} />
  }
  return staffWorkspace ? <StaffPortal profile={profile} workspace={staffWorkspace} refresh={refreshStaff} /> : <AccountState title="Opening your workspace…" detail="Loading students, courses, and current training records." />
}

function PasswordSetup({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy) return
    if (password.length < 8) { setMessage('Use at least 8 characters.'); return }
    if (password !== confirmation) { setMessage('The passwords do not match.'); return }
    setBusy(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setMessage(error.message); return }
    window.history.replaceState({}, document.title, window.location.pathname)
    onComplete()
  }

  return <main className="login-page"><section className="login-panel password-panel"><Brand /><div><p className="eyebrow">Account security</p><h1>Choose your password.</h1><p>Create the password you will use for future portal sign-ins.</p></div><form onSubmit={savePassword}><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /><button className="button button-light" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save password'} <span>→</span></button>{message && <p className="form-message" role="status">{message}</p>}</form><small>Passwords are handled securely by the portal authentication service.</small></section></main>
}

function Login() {
  const [mode, setMode] = useState<'login' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setMessage(error.message === 'Invalid login credentials' ? 'The email or password is incorrect.' : error.message)
  }

  async function sendPasswordReset(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?setup=1` })
    setBusy(false)
    setMessage(error ? error.message : 'Check your email for the password setup link. You only need this email once.')
  }

  function changeMode(nextMode: 'login' | 'reset') { setMode(nextMode); setMessage('') }

  return <main className="login-page"><section className="login-panel"><Brand />{mode === 'login' ? <><div><p className="eyebrow">Secure account access</p><h1>Continue your training.</h1><p>Sign in with the email address and password associated with your course.</p></div><form onSubmit={signIn}><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="button button-light" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span>→</span></button><button className="login-link" type="button" onClick={() => changeMode('reset')}>Set or forgot your password?</button>{message && <p className="form-message" role="status">{message}</p>}</form></> : <><div><p className="eyebrow">Password setup</p><h1>Set your password.</h1><p>We will email one secure link to create or replace your password.</p></div><form onSubmit={sendPasswordReset}><label htmlFor="reset-email">Email address</label><input id="reset-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /><button className="button button-light" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send password setup link'} <span>→</span></button><button className="login-link" type="button" onClick={() => changeMode('login')}>Back to sign in</button>{message && <p className="form-message" role="status">{message}</p>}</form></>}<small>Access is limited to invited Pilot Consciousness students and instructors. New accounts cannot register here.</small></section></main>
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [passwordSetup, setPasswordSetup] = useState(() => {
    const hashType = new URLSearchParams(window.location.hash.slice(1)).get('type')
    return hashType === 'recovery' || hashType === 'invite' || new URLSearchParams(window.location.search).get('setup') === '1'
  })

  useEffect(() => {
    if (!supabase) { setSession(null); return }
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setPasswordSetup(true)
      if (event === 'SIGNED_OUT') setPasswordSetup(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!hasSupabaseConfig) return <AccountState title="Portal configuration required." detail="Add the Supabase project URL and publishable key to run the training portal." />
  if (session === undefined) return <main className="login-page"><p>Loading secure portal…</p></main>
  if (session && passwordSetup) return <PasswordSetup onComplete={() => setPasswordSetup(false)} />
  return session ? <AuthenticatedPortal session={session} /> : <Login />
}
