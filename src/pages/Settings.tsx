import { useState } from 'react'
import ClassFields from '../components/ClassFields'
import { validClasses } from '../lib/class-choices'
import { store, type Account } from '../lib/store'
import { setTheme, useTheme } from '../lib/theme'
import { TopBar } from '../components/ui'

export default function Settings({ user, onSaved }: { user: Account; onSaved: () => Promise<void> }) {
  const theme = useTheme()
  const [ec, setEc] = useState(user.ec_class ?? '')
  const [ee, setEe] = useState(user.ee_class ?? '')
  const [math, setMath] = useState(user.math_class ?? '')
  const [classBusy, setClassBusy] = useState(false)
  const [classMessage, setClassMessage] = useState('')
  const [classError, setClassError] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const classesChanged = ec !== user.ec_class || ee !== user.ee_class || math !== user.math_class

  return <>
    <TopBar user={user} />
    <header className="page-head"><div className="page-head-text"><h1>Settings</h1><p className="lead">Your account and class preferences.</p></div></header>
    <div className="settings-stack">
      <section className="settings-section" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading">Appearance</h2>
        <div className="seg seg-2" role="group" aria-label="Color theme">
          <button type="button" className={theme === 'light' ? 'on' : ''} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
          <button type="button" className={theme === 'dark' ? 'on' : ''} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <div className="settings-account"><div><span className="field-label">Name</span><p>{user.name || 'Not set'}</p></div><div><span className="field-label">Email</span><p>{user.email}</p></div></div>
      </section>

      <section className="settings-section" aria-labelledby="classes-heading">
        <h2 id="classes-heading">Your classes</h2>
        <p className="small muted">Correct a class if you chose the wrong one. Your homework list updates after saving.</p>
        <form className="settings-form" aria-busy={classBusy} onSubmit={async event => {
          event.preventDefault()
          if (classBusy || !classesChanged) return
          setClassMessage(''); setClassError('')
          if (!validClasses(ec, ee, math)) { setClassError('Choose a class in each list.'); return }
          setClassBusy(true)
          try { await store.saveClasses(ec, ee, math); await onSaved(); setClassMessage('Classes updated.') }
          catch (error) { setClassError(error instanceof Error ? error.message : 'Could not update your classes. Try again.') }
          finally { setClassBusy(false) }
        }}><fieldset className="auth-fields" disabled={classBusy}>
          <legend className="sr-only">Change your classes</legend>
          <ClassFields ec={ec} ee={ee} math={math} onEc={setEc} onEe={setEe} onMath={setMath} />
          {classError && <p className="alert error" role="alert">{classError}</p>}
          {classMessage && <p className="alert" role="status">{classMessage}</p>}
          <button className="btn-primary" type="submit" disabled={!classesChanged || classBusy}>{classBusy ? 'Saving…' : 'Save classes'}</button>
        </fieldset></form>
      </section>

      <section className="settings-section" aria-labelledby="password-heading">
        <h2 id="password-heading">Change password</h2>
        <form className="settings-form" aria-busy={passwordBusy} onSubmit={async event => {
          event.preventDefault()
          if (passwordBusy) return
          setPasswordMessage(''); setPasswordError('')
          if (password.length < 6) { setPasswordError('Password must be at least six characters.'); return }
          if (password !== confirmPassword) { setPasswordError('Passwords do not match.'); return }
          setPasswordBusy(true)
          try { await store.changePassword(password); setPassword(''); setConfirmPassword(''); setPasswordMessage('Password updated.') }
          catch (error) { setPasswordError(error instanceof Error ? error.message : 'Could not change your password. Try again.') }
          finally { setPasswordBusy(false) }
        }}><fieldset className="auth-fields" disabled={passwordBusy}>
          <legend className="sr-only">Change password</legend>
          <label className="field"><span className="field-label">New password</span><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} value={password} onChange={event => setPassword(event.target.value)} required /></label>
          <label className="field"><span className="field-label">Confirm new password</span><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></label>
          <button className="link-btn" type="button" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide passwords' : 'Show passwords'}</button>
          {passwordError && <p className="alert error" role="alert">{passwordError}</p>}
          {passwordMessage && <p className="alert" role="status">{passwordMessage}</p>}
          <button className="btn-primary" type="submit" disabled={passwordBusy}>{passwordBusy ? 'Updating…' : 'Update password'}</button>
        </fieldset></form>
      </section>
    </div>
  </>
}
