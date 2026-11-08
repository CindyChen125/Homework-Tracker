import { useRef, useState } from 'react'
import { store } from '../lib/store'
import { ThemeToggle, Wordmark } from '../components/ui'

export default function Auth({ error, onAuthenticated, onSignOut }: {
  error: string | null
  onAuthenticated: () => Promise<void>
  onSignOut: () => Promise<void>
}) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const signingUp = mode === 'up'
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting.current) return
    if (signingUp) {
      const normalizedEmail = email.trim().toLowerCase()
      const normalizedConfirmation = confirmEmail.trim().toLowerCase()
      if (!normalizedConfirmation) return setFormError('Confirm your email address.')
      if (normalizedEmail !== normalizedConfirmation) return setFormError('Email addresses do not match.')
      if (!confirmPassword) return setFormError('Confirm your password.')
      if (password !== confirmPassword) return setFormError('Passwords do not match.')
      if (password.length < 6) return setFormError('Password must be at least six characters.')
    }
    submitting.current = true
    setBusy(true)
    setFormError(null)
    try {
      if (signingUp) await store.signUp(email.trim(), password, name.trim())
      else await store.signIn(email.trim(), password)
      await onAuthenticated()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not sign in. Please try again.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  return (
    <main className="auth-page">
      <div className="signin">
        <div className="signin-top"><Wordmark subtitle="" /><ThemeToggle /></div>
        <div className="signin-body">
          <header className="stack">
            <h1>{signingUp ? 'Create an account' : 'Sign in'}</h1>
            <p className="lead">{signingUp ? 'Enter each email and password twice so typing mistakes do not lock you out.' : 'Sign in to view homework, class news and shared files.'}</p>
          </header>
          {store.mode === 'demo' && <p className="alert" role="status">Sign in is not configured. An administrator needs to connect Supabase. No class data is available here.</p>}
          {error && <div className="alert error" role="alert"><p>{error}</p><button className="link-btn" onClick={() => { void onSignOut() }}>Retry sign out</button></div>}
          <form className="signin-card" onSubmit={submit} aria-busy={busy}>
              <fieldset disabled={busy || store.mode === 'demo'} className="auth-fields">
                <legend className="sr-only">{signingUp ? 'Sign up details' : 'Sign in details'}</legend>
                <div className="seg seg-2" role="group" aria-label="Choose sign in or sign up">
                  <button type="button" aria-pressed={!signingUp} className={!signingUp ? 'on' : ''} onClick={() => { setMode('in'); setFormError(null) }}>Sign in</button>
                  <button type="button" aria-pressed={signingUp} className={signingUp ? 'on' : ''} onClick={() => { setMode('up'); setFormError(null) }}>Sign up</button>
                </div>
                {signingUp && <label className="field"><span className="field-label">Your name</span><input autoComplete="name" maxLength={80} value={name} onChange={e => setName(e.target.value)} required /></label>}
                <label className="field"><span className="field-label">Email</span><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
                {signingUp && <label className="field"><span className="field-label">Confirm email</span><input type="email" autoComplete="email" value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} required /></label>}
                <label className="field"><span className="field-label">Password</span><input type={showPasswords ? 'text' : 'password'} autoComplete={signingUp ? 'new-password' : 'current-password'} minLength={6} value={password} onChange={e => setPassword(e.target.value)} required />{signingUp && <span className="small muted">At least six characters. New accounts start as Readers.</span>}</label>
                {signingUp && <label className="field"><span className="field-label">Confirm password</span><input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required /></label>}
                <button className="link-btn" type="button" aria-pressed={showPasswords} onClick={() => setShowPasswords(show => !show)}>{showPasswords ? 'Hide password' : 'Show password'}</button>
                {formError && <div className="alert error" role="alert">{formError}</div>}
                <button className="btn-primary" type="submit">{busy ? 'Please wait…' : signingUp ? 'Sign Up' : 'Sign in'}</button>
              </fieldset>
            </form>
          <p className="small muted">Registration is open. Only an administrator can grant Editor or Admin permissions.</p>
        </div>
      </div>
    </main>
  )
}
