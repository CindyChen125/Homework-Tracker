import './typescript-loader.mjs'
import { registerHooks } from 'node:module'
import assert from 'node:assert/strict'
import test from 'node:test'

// Exercise the actual Supabase store without Vite, real credentials or network calls.
const storeUrl = new URL('../src/lib/store.ts', import.meta.url).href
registerHooks({
  resolve(specifier, context, next) {
    return specifier === '@supabase/supabase-js'
      ? { url: 'test:current-user-supabase', shortCircuit: true }
      : next(specifier, context)
  },
  load(url, context, next) {
    if (url === 'test:current-user-supabase') {
      return { format: 'module', shortCircuit: true, source: 'export const createClient = (_url, _key, options) => { globalThis.currentUserTestOptions = options; return globalThis.currentUserTestClient }' }
    }
    const result = next(url, context)
    return url === storeUrl
      ? { ...result, source: result.source.replaceAll('import.meta.env', '({ VITE_SUPABASE_URL: "https://synthetic.invalid", VITE_SUPABASE_ANON_KEY: "fake-anon" })') }
      : result
  },
})

const user = { id: 'student-id', email: 'student@example.invalid' }
let state
globalThis.currentUserTestClient = {
  functions: {
    async invoke(name, options) {
      state.functionCall = { name, options }
      return state.functionResponse ?? { data: { warning: null }, error: null }
    },
  },
  auth: {
    getSession: async () => state.session,
    onAuthStateChange(listener) { state.authListener = listener; return { data: { subscription: { unsubscribe() { state.unsubscribed = true } } } } },
    async signOut(options) { state.signOutOptions = options; return { error: state.signOutError ?? null } },
    async signUp(input) { state.signup = input; return { data: { session: state.signupSession ?? null }, error: state.signupError ?? null } },
  },
  storage: { from(bucket) {
    assert.equal(bucket, 'materials')
    return {
      async createSignedUrl(path, seconds) { state.fileRequest = { path, seconds }; return { data: { signedUrl: 'https://synthetic.invalid/signed-file' }, error: state.fileError ?? null } },
      getPublicUrl() { throw new Error('Public file URLs must never be used') },
    }
  } },
  from(table) {
    assert.equal(table, 'profiles')
    state.queries++
    const query = {
      select(columns) { assert.equal(columns, '*'); return query },
      eq(column, value) { assert.equal(column, 'id'); assert.equal(value, user.id); return query },
      async maybeSingle() {
        if (state.thrown) throw state.thrown
        return state.profile
      },
    }
    return query
  },
}
const { store, canEdit, isAdmin } = await import('../src/lib/store.ts')
const reset = (profile = { data: null, error: null }) => {
  state = { session: { data: { session: { user } }, error: null }, profile, queries: 0 }
}
const assertReader = async () => {
  const account = await store.currentUser()
  assert.deepEqual(account, { ...user, name: null, role: 'reader', news_manager: false })
  assert.equal(canEdit(account), false)
  assert.equal(isAdmin(account), false)
}

test('a signed-in user without a profile defaults to reader', async () => {
  reset()
  await assertReader()
  assert.equal(state.queries, 1)
})

test('missing profiles table and profile query errors never grant editing', async () => {
  for (const error of [
    { code: '42P01', message: 'relation "public.profiles" does not exist' },
    { code: 'PGRST205', message: "Could not find the table 'public.profiles' in the schema cache" },
    { code: '42501', message: 'permission denied for table profiles' },
    { code: 'PGRST116', message: 'Multiple rows returned' },
    { message: 'Network request failed' },
  ]) {
    reset({ data: null, error })
    await assertReader()
  }
})

test('profile errors discard any accompanying privileged row', async () => {
  for (const role of ['editor', 'admin']) {
    reset({ data: { ...user, name: 'Stale profile', role, news_manager: true }, error: { message: 'profiles query failed' } })
    await assertReader()
  }
})

test('a rejected profile query defaults to reader', async () => {
  reset()
  state.thrown = new Error('profiles connection failed')
  await assertReader()
})

test('successful profiles preserve all existing roles and separate news permission', async () => {
  for (const role of ['reader', 'editor', 'admin']) {
    for (const news_manager of [false, true]) {
      reset({ data: { ...user, name: 'Student', role, news_manager }, error: null })
      const account = await store.currentUser()
      assert.deepEqual(account, { ...user, name: 'Student', role, news_manager })
      assert.equal(canEdit(account), role !== 'reader')
      assert.equal(isAdmin(account), role === 'admin')
    }
  }
})

test('missing or unrecognized profile roles never grant editing', async () => {
  for (const role of [undefined, null, 'owner', 'ADMIN', '', true]) {
    reset({ data: { ...user, role }, error: null })
    await assertReader()
  }
})

test('no session or an authentication error denies access without a profile query', async () => {
  for (const session of [
    { data: { session: null }, error: null },
    { data: { session: { user } }, error: { message: 'Invalid session' } },
  ]) {
    reset()
    state.session = session
    assert.equal(await store.currentUser(), null)
    assert.equal(state.queries, 0)
  }
})

test('Supabase persists sessions, refreshes tokens and processes confirmation links', () => {
  assert.deepEqual(globalThis.currentUserTestOptions.auth, { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true })
})

test('session events forward synchronously without querying profiles and unsubscribe', () => {
  reset(); const events = []
  const unsubscribe = store.subscribeAuth(signedIn => events.push(signedIn))
  state.authListener('SIGNED_IN', { user })
  state.authListener('TOKEN_REFRESHED', { user })
  state.authListener('SIGNED_OUT', null)
  assert.deepEqual(events, [true,true,false])
  assert.equal(state.queries,0)
  unsubscribe(); assert.equal(state.unsubscribed,true)
})

test('material downloads use one-minute signed URLs and propagate authorization errors', async () => {
  reset()
  assert.equal(await store.fileUrl({ file_path: 'existing.pdf' }), 'https://synthetic.invalid/signed-file')
  assert.deepEqual(state.fileRequest, { path:'existing.pdf',seconds:60 })
  state.fileError = { message:'Permission denied' }
  await assert.rejects(() => store.fileUrl({ file_path:'existing.pdf' }), /Permission denied/)
})

test('signout is local and errors are not silently ignored', async () => {
  reset(); await store.signOut()
  assert.deepEqual(state.signOutOptions,{ scope:'local' })
  state.signOutError = { message:'Signout failed' }
  await assert.rejects(() => store.signOut(), /Signout failed/)
})

test('open registration sends only the display name, never permissions', async () => {
  reset()
  state.signupSession = { user }
  assert.equal(await store.signUp('new@synthetic.invalid','synthetic-password','New reader'),undefined)
  assert.deepEqual(state.signup,{ email:'new@synthetic.invalid',password:'synthetic-password',options:{ data:{ name:'New reader' },emailRedirectTo:'https://cindychen125.github.io/Homework-Tracker/' } })
})

test('signup always redirects to the complete deployment root without altering verification or handling', async () => {
  reset()
  state.signupSession = { user }
  for (const href of ['https://cindychen125.github.io/Homework-Tracker/#/post', 'http://localhost:5199/#/']) {
    globalThis.location = new URL(href)
    assert.equal(await store.signUp('new@synthetic.invalid', 'password', 'Reader'), undefined)
    const redirect = new URL(state.signup.options.emailRedirectTo)
    assert.equal(redirect.href, 'https://cindychen125.github.io/Homework-Tracker/')
    assert.equal(redirect.hash, '')
    assert.deepEqual(state.signup.options.data, { name: 'Reader' })
  }
  state.signupSession = null
  await assert.rejects(() => store.signUp('new@synthetic.invalid', 'password', 'Reader'), /account was created.*could not sign you in/i)
  state.signupError = { message: 'Signup rejected' }
  await assert.rejects(() => store.signUp('new@synthetic.invalid', 'password', 'Reader'), /Signup rejected/)
  delete globalThis.location
})

test('account deletion sends only the target ID to the protected Edge Function and surfaces server errors', async () => {
  reset()
  assert.deepEqual(await store.deleteUser('target-id'), { warning: null })
  assert.deepEqual(state.functionCall, { name: 'delete-user', options: { body: { targetUserId: 'target-id' } } })

  state.functionResponse = {
    data: null,
    error: { context: { json: async () => ({ error: 'The last remaining administrator cannot be deleted.' }) } },
  }
  await assert.rejects(() => store.deleteUser('target-id'), /last remaining administrator/)
})
