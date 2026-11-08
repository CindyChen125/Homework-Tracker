import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const { demoFeedbackStore } = await import('../src/lib/feedback-store.ts')
const { sortFeedback, validateFeedback, validateFeedbackReply } = await import('../src/lib/feedback.ts')

const report = (id, status, created_at) => ({ id, author_id:'a',author_name:'A',category:'bug',title:'Synthetic report',description:'Detailed synthetic explanation',visibility:'public',status,created_at,updated_at:created_at })

test('feedback validation bounds reports and replies, and unresolved reports sort first', () => {
  assert.doesNotThrow(() => validateFeedback({ category:'bug',title:'A bug',description:'Detailed explanation',visibility:'private' }))
  assert.throws(() => validateFeedback({ category:'bug',title:'A',description:'Detailed explanation',visibility:'public' }), /title between/)
  assert.throws(() => validateFeedback({ category:'bug',title:'Valid title',description:'short',visibility:'public' }), /description between/)
  assert.throws(() => validateFeedbackReply('   '), /Write a reply/)
  assert.deepEqual(sortFeedback([
    report('resolved','resolved','2026-11-08T12:00:00Z'), report('older','open','2026-11-07T12:00:00Z'), report('newer','open','2026-11-08T12:00:00Z'), report('progress','in_progress','2026-11-09T12:00:00Z'),
  ]).map(row => row.id), ['newer','older','progress','resolved'])
})

test('demo feedback preserves public/private visibility, replies and admin-only controls', async () => {
  const values = new Map(), storage = { getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value) }
  let user = { id:'author',name:'Author',email:'author@synthetic.invalid',role:'reader' }
  const store = demoFeedbackStore(async()=>user,storage)
  const publicId = await store.create({ category:'feature',title:'Public idea',description:'A detailed public suggestion',visibility:'public' })
  const privateId = await store.create({ category:'other',title:'Private note',description:'A detailed private message',visibility:'private' })
  user = { id:'other',name:'Other',email:'other@synthetic.invalid',role:'reader' }
  assert.deepEqual((await store.list()).map(row=>row.id),[publicId])
  await store.reply(publicId,'Public reply')
  await assert.rejects(()=>store.reply(privateId,'Private attempt'),/cannot reply/)
  await assert.rejects(()=>store.setStatus(publicId,'resolved'),/Only administrators/)
  user = { id:'admin',name:'Admin',email:'admin@synthetic.invalid',role:'admin' }
  assert.equal((await store.list()).length,2)
  await store.setStatus(privateId,'in_progress')
  await store.reply(privateId,'Admin reply')
  assert.equal((await store.replies(privateId))[0].author_role,'admin')
  await store.remove(privateId)
  assert.equal((await store.list()).length,1)
  assert.equal((await store.replies(publicId)).length,1)
})

test('favicon uses the Classboard green and Vite base-path placeholder', () => {
  const svg=readFileSync(new URL('../public/favicon.svg',import.meta.url),'utf8')
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8')
  assert.match(svg,/fill="#0E6F5C"/)
  assert.match(svg,/stroke="#fff"/)
  assert.match(html,/href="%BASE_URL%favicon\.svg"/)
})
