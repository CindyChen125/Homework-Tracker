import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
})
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const publicError = (message: string) => {
  const known = [
    'Admin access is required.',
    'Choose an account to delete.',
    'You cannot delete your own account.',
    'That account no longer exists.',
    'That account is already being deleted.',
    'The last remaining administrator cannot be deleted.',
  ]
  return known.find((text) => message.includes(text)) ?? 'The account could not be deleted. Please retry.'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST to delete an account.' })

  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return reply(401, { error: 'Sign in before deleting an account.' })

  let targetUserId = ''
  try {
    const body = await req.json()
    targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId : ''
  } catch {
    return reply(400, { error: 'Choose an account to delete.' })
  }
  if (!uuid.test(targetUserId)) return reply(400, { error: 'Choose a valid account to delete.' })

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !secret) return reply(500, { error: 'Account deletion is not configured.' })

  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const userClient = createClient(url, anon, { ...options, global: { headers: { Authorization: authorization } } })
  const admin = createClient(url, secret, options)
  const token = authorization.slice(7)
  const { data: { user }, error: authError } = await userClient.auth.getUser(token)
  if (authError || !user) return reply(401, { error: 'Your session expired. Sign in again.' })
  if (user.id === targetUserId) return reply(400, { error: 'You cannot delete your own account.' })

  // This RPC verifies the caller's current profile role; no client role is trusted.
  const reservation = await userClient.rpc('prepare_user_deletion', { p_target: targetUserId })
  if (reservation.error) {
    const message = publicError(reservation.error.message)
    const status = message === 'Admin access is required.' ? 403
      : message.includes('last remaining') || message.includes('already being') ? 409
        : message.includes('no longer exists') ? 404 : 400
    return reply(status, { error: message })
  }

  // Capture personal note paths before the profile cascade removes their rows.
  const notes = await admin.from('student_notes').select('file_path').eq('owner_id', targetUserId)
  if (notes.error) {
    await userClient.rpc('cancel_user_deletion', { p_target: targetUserId })
    return reply(500, { error: 'The account was not deleted because its personal files could not be checked.' })
  }

  const deletion = await admin.auth.admin.deleteUser(targetUserId, false)
  if (deletion.error) {
    await userClient.rpc('cancel_user_deletion', { p_target: targetUserId })
    return reply(400, { error: publicError(deletion.error.message) })
  }

  const paths = (notes.data ?? []).map((note) => note.file_path).filter((path): path is string => typeof path === 'string')
  let warning: string | null = null
  if (paths.length) {
    const cleanup = await admin.storage.from('student-notes').remove(paths)
    if (cleanup.error) warning = 'The account was deleted, but an administrator must clean up its Student Note files.'
  }
  return reply(200, { deleted: true, warning })
})
