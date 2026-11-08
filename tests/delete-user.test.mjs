import './typescript-loader.mjs'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

// Exercise the real Edge Function with synthetic Auth/database/storage clients.
registerHooks({
  resolve(specifier, context, next) {
    return specifier === 'npm:@supabase/supabase-js@2.116.0'
      ? { url: 'test:delete-user-supabase', shortCircuit: true }
      : next(specifier, context)
  },
  load(url, context, next) {
    return url === 'test:delete-user-supabase'
      ? { format: 'module', shortCircuit: true, source: 'export const createClient=(...args)=>globalThis.deleteUserClientFactory(...args)' }
      : next(url, context)
  },
})

const caller = '00000000-0000-4000-8000-000000000001'
const target = '00000000-0000-4000-8000-000000000002'
let handler, state
globalThis.Deno = {
  env: { get: name => ({ SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'fake-anon', SUPABASE_SERVICE_ROLE_KEY: 'fake-service' })[name] },
  serve: fn => { handler = fn },
}
globalThis.deleteUserClientFactory = (_url, key) => {
  const service = key === 'fake-service'
  return {
    auth: service ? { admin: { deleteUser: async (id, soft) => {
      state.authDeletes.push({ id, soft })
      return { error: state.deleteError ? { message: state.deleteError } : null }
    } } } : { getUser: async token => {
      state.tokens.push(token)
      return { data: { user: state.auth ? { id: state.caller } : null }, error: state.auth ? null : { message: 'Expired' } }
    } },
    rpc: async (name, args) => {
      assert.equal(service, false)
      state.rpcs.push({ name, args })
      if (name === 'prepare_user_deletion') return { data: state.rpcError ? null : [{ target_id: target }], error: state.rpcError ? { message: state.rpcError } : null }
      return { data: null, error: null }
    },
    from: table => {
      assert.equal(service, true); assert.equal(table, 'student_notes')
      const chain = { select: () => chain, eq: async () => ({ data: state.notePaths.map(file_path => ({ file_path })), error: state.noteError ? { message: 'Failed' } : null }) }
      return chain
    },
    storage: { from: bucket => {
      assert.equal(service, true); assert.equal(bucket, 'student-notes')
      return { remove: async paths => { state.removes.push(paths); return { error: state.cleanupError ? { message: 'Failed' } : null } } }
    } },
  }
}
await import('../supabase/functions/delete-user/index.ts')

const reset = () => { state = { auth: true, caller, tokens: [], rpcs: [], authDeletes: [], notePaths: ['owner/one.pdf', 'owner/two.jpg'], removes: [] } }
const request = (id = target, authorization = 'Bearer synthetic-token') => new Request('https://synthetic.invalid/delete-user', {
  method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId: id }),
})

test('delete-user requires a valid session and validates the target', async () => {
  reset()
  assert.equal((await handler(new Request('https://synthetic.invalid/delete-user', { method: 'OPTIONS' }))).status, 200)
  assert.equal((await handler(new Request('https://synthetic.invalid/delete-user'))).status, 405)
  assert.equal((await handler(new Request('https://synthetic.invalid/delete-user', { method: 'POST' }))).status, 401)
  assert.equal((await handler(request('not-a-uuid'))).status, 400)
  state.auth = false
  assert.equal((await handler(request())).status, 401)
  assert.equal(state.authDeletes.length, 0)
})

test('server role checks reject readers, self-deletion and the final administrator', async () => {
  for (const [message, status] of [
    ['Admin access is required.', 403],
    ['The last remaining administrator cannot be deleted.', 409],
  ]) {
    reset(); state.rpcError = message
    const response = await handler(request())
    assert.equal(response.status, status)
    assert.equal((await response.json()).error, message)
    assert.equal(state.authDeletes.length, 0)
  }
  reset(); state.caller = target
  assert.equal((await handler(request())).status, 400)
  assert.equal(state.rpcs.length, 0)
})

test('successful deletion removes the real Auth user and only its personal note files', async () => {
  reset()
  const response = await handler(request())
  assert.equal(response.status, 200)
  assert.deepEqual(state.rpcs[0], { name: 'prepare_user_deletion', args: { p_target: target } })
  assert.deepEqual(state.authDeletes, [{ id: target, soft: false }])
  assert.deepEqual(state.removes, [['owner/one.pdf', 'owner/two.jpg']])
  assert.deepEqual(await response.json(), { deleted: true, warning: null })
})

test('failed Auth deletion cancels the reservation; file cleanup failure becomes a warning', async () => {
  reset(); state.deleteError = 'Auth refused deletion'
  const failed = await handler(request())
  assert.equal(failed.status, 400)
  assert.equal(state.rpcs.at(-1).name, 'cancel_user_deletion')
  assert.equal(state.removes.length, 0)

  reset(); state.cleanupError = true
  const completed = await handler(request())
  assert.equal(completed.status, 200)
  assert.match((await completed.json()).warning, /administrator must clean up/)
})

test('migration contains serialized reservation and final-admin database guards', () => {
  const source = requireText('../supabase/migrations/20261108_admin_user_deletion.sql')
  assert.match(source, /pg_advisory_xact_lock/)
  assert.match(source, /protect_last_admin before update of role or delete/)
  assert.match(source, /last remaining administrator cannot be deleted/i)
  assert.match(source, /revoke all on public\.user_deletion_requests from public, anon, authenticated/)
})

function requireText(relative) {
  return readFileSync(new URL(relative, import.meta.url), 'utf8')
}
