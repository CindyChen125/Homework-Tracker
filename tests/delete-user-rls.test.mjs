import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const ids = {
  reader: '00000000-0000-4000-8000-000000000001',
  admin1: '00000000-0000-4000-8000-000000000002',
  admin2: '00000000-0000-4000-8000-000000000003',
}

test('user deletion migration enforces server roles, reservations and the final-admin guard', async () => {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.profiles(
      id uuid primary key references auth.users(id) on delete cascade,
      email text not null,
      name text,
      role text not null check (role in ('reader','editor','admin'))
    );
    grant usage on schema public, auth to anon, authenticated;
  `)
  for (const [name, id] of Object.entries(ids)) {
    await db.query('insert into auth.users(id) values($1)', [id])
    await db.query('insert into public.profiles(id,email,name,role) values($1,$2,$3,$4)', [id, `${name}@synthetic.invalid`, name, name.startsWith('admin') ? 'admin' : 'reader'])
  }
  const migration = readFileSync(new URL('../supabase/migrations/20261108_admin_user_deletion.sql', import.meta.url), 'utf8')
  await db.exec(migration)

  const asUser = async (id, statement, params = []) => {
    await db.exec('begin')
    try {
      await db.exec('set local role authenticated')
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id])
      return await db.query(statement, params)
    } finally { await db.exec('rollback') }
  }

  await assert.rejects(asUser(ids.reader, 'select * from public.prepare_user_deletion($1)', [ids.admin2]), /Admin access is required/)
  await assert.rejects(asUser(ids.admin1, 'select * from public.prepare_user_deletion($1)', [ids.admin1]), /cannot delete your own account/i)

  // A committed reservation for admin2 still leaves admin1, but cannot be duplicated.
  await db.exec('begin')
  await db.exec('set local role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.admin1])
  const reserved = await db.query('select * from public.prepare_user_deletion($1)', [ids.admin2])
  assert.equal(reserved.rows[0].target_role, 'admin')
  await db.exec('commit')
  await assert.rejects(asUser(ids.admin1, 'select * from public.prepare_user_deletion($1)', [ids.admin2]), /already being deleted/i)

  // The trigger is the final defense in the Auth cascade and on role changes.
  await db.query('delete from public.profiles where id=$1', [ids.admin2])
  await assert.rejects(db.query('delete from public.profiles where id=$1', [ids.admin1]), /last remaining administrator/i)
  await assert.rejects(db.query("update public.profiles set role='reader' where id=$1", [ids.admin1]), /last remaining administrator/i)
  assert.equal((await db.query("select count(*)::int as count from public.profiles where role='admin'")).rows[0].count, 1)

  await db.close()
})
