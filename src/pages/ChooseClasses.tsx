import { useState } from 'react'
import ClassFields from '../components/ClassFields'
import { validClasses } from '../lib/class-choices'
import { store } from '../lib/store'
import { ThemeToggle, Wordmark } from '../components/ui'

export default function ChooseClasses({ onSaved, onSignOut }: { onSaved: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const [ec, setEc] = useState('')
  const [ee, setEe] = useState('')
  const [math, setMath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <main className="auth-page"><div className="signin">
    <div className="signin-top"><Wordmark subtitle="" /><ThemeToggle /></div>
    <div className="signin-body"><h1>Choose your classes</h1>
      <p className="lead">Select your EC, EE, and Math classes once to continue to Classboard.</p>
      <form className="signin-card" aria-busy={busy} onSubmit={async event => {
        event.preventDefault()
        if (busy) return
        if (!validClasses(ec, ee, math)) { setError('Choose a class in each list.'); return }
        setBusy(true); setError('')
        try { await store.saveClasses(ec, ee, math); await onSaved() }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your classes. Please try again.') }
        finally { setBusy(false) }
      }}><fieldset className="auth-fields" disabled={busy}>
        <legend className="sr-only">Your classes</legend>
        <ClassFields ec={ec} ee={ee} math={math} onEc={setEc} onEe={setEe} onMath={setMath} />
        {error && <div className="alert error" role="alert">{error}</div>}
        <button className="btn-primary" type="submit">{busy ? 'Saving…' : 'Save classes'}</button>
      </fieldset></form>
      <button className="link-btn" onClick={() => { void onSignOut() }}>Sign out</button>
    </div>
  </div></main>
}
