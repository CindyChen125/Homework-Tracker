import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const ids = {
  author: '00000000-0000-4000-8000-000000000001',
  other: '00000000-0000-4000-8000-000000000002',
  editor: '00000000-0000-4000-8000-000000000003',
  admin: '00000000-0000-4000-8000-000000000004',
}

test('Feedback Center migration enforces identity, privacy, replies and admin controls', async () => {
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
      email text not null, name text, role text not null check(role in ('reader','editor','admin'))
    );
    create function public.my_role() returns text language sql stable security definer set search_path = '' as $$
      select coalesce((select role from public.profiles where id=auth.uid()),'reader')
    $$;
    revoke all on function public.my_role() from public,anon;
    grant execute on function public.my_role() to authenticated;
    grant usage on schema public,auth to anon,authenticated;
  `)
  for (const [name, id] of Object.entries(ids)) {
    await db.query('insert into auth.users(id) values($1)', [id])
    await db.query('insert into public.profiles(id,email,name,role) values($1,$2,$3,$4)', [id, `${name}@synthetic.invalid`, `Synthetic ${name}`, name === 'admin' ? 'admin' : name === 'editor' ? 'editor' : 'reader'])
  }
  const migration = readFileSync(new URL('../supabase/migrations/20261108_feedback_center.sql', import.meta.url), 'utf8')
  await db.exec(migration)

  async function as(id, fn, commit = false, role = 'authenticated') {
    await db.exec('begin')
    try {
      await db.exec(`set local role ${role}`)
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id ?? ''])
      const result = await fn()
      await db.exec(commit ? 'commit' : 'rollback')
      return result
    } catch (error) {
      await db.exec('rollback')
      throw error
    }
  }

  const create = (visibility, title) => db.query("insert into public.feedback_reports(category,title,description,visibility) values('bug',$1,'Detailed synthetic explanation',$2) returning *", [title, visibility])
  const publicReport = (await as(ids.author, () => create('public', 'Public synthetic report'), true)).rows[0]
  const privateReport = (await as(ids.author, () => create('private', 'Private synthetic report'), true)).rows[0]
  assert.equal(publicReport.author_id, ids.author)
  assert.equal(publicReport.author_name, 'Synthetic author')
  assert.equal(publicReport.status, 'open')

  await assert.rejects(as(ids.author, () => db.query("insert into public.feedback_reports(author_id,category,title,description,visibility,status) values($1,'bug','Forged report','Detailed forged explanation','public','resolved')", [ids.admin])), /permission denied/)
  await assert.rejects(as(null, () => db.query('select * from public.feedback_reports'), false, 'anon'), /permission denied/)

  await as(ids.other, async () => {
    const visible = (await db.query('select id from public.feedback_reports order by id')).rows.map(row => row.id)
    assert.deepEqual(visible, [publicReport.id])
    await db.query('insert into public.feedback_replies(report_id,body) values($1,$2)', [publicReport.id, 'A public synthetic reply'])
  }, true)
  await assert.rejects(as(ids.other, () => db.query('insert into public.feedback_replies(report_id,body) values($1,$2)', [privateReport.id, 'Attempted private reply'])), /row-level security/)
  assert.equal((await as(ids.other, () => db.query("update public.feedback_reports set status='resolved' where id=$1 returning id", [publicReport.id]))).rows.length, 0)
  assert.equal((await as(ids.other, () => db.query('delete from public.feedback_reports where id=$1 returning id', [publicReport.id]))).rows.length, 0)

  await as(ids.author, async () => {
    assert.equal((await db.query('select id from public.feedback_reports')).rows.length, 2)
    await db.query('insert into public.feedback_replies(report_id,body) values($1,$2)', [privateReport.id, 'Private author reply'])
    assert.equal((await db.query('select id from public.feedback_replies where report_id=$1', [privateReport.id])).rows.length, 1)
  }, true)

  await as(ids.admin, async () => {
    assert.equal((await db.query('select id from public.feedback_reports')).rows.length, 2)
    await db.query("update public.feedback_reports set status='in_progress' where id=$1", [privateReport.id])
    await db.query('insert into public.feedback_replies(report_id,body) values($1,$2)', [privateReport.id, 'Administrator reply'])
    const adminReply = (await db.query('select author_role from public.feedback_replies where body=$1', ['Administrator reply'])).rows[0]
    assert.equal(adminReply.author_role, 'admin')
    await db.query('delete from public.feedback_reports where id=$1', [privateReport.id])
    assert.equal((await db.query('select id from public.feedback_replies where report_id=$1', [privateReport.id])).rows.length, 0)
  }, true)

  assert.equal((await db.query('select count(*)::int as count from public.feedback_reports')).rows[0].count, 1)
  await db.exec(`
    create policy "synthetic broad feedback read" on public.feedback_reports for select to anon using(true);
    grant select on public.feedback_reports to anon;
  `)
  await as(null, async () => assert.equal((await db.query('select id from public.feedback_reports')).rows.length, 0), false, 'anon')
  await db.close()
})
