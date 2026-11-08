import './typescript-loader.mjs'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import React from 'react'
import renderer, { act } from 'react-test-renderer'
import assert from 'node:assert/strict'
import test from 'node:test'

const storeUrl = new URL('../src/lib/store.ts', import.meta.url).href
registerHooks({
  resolve(specifier, context, next) {
    let resolved
    try { resolved = next(specifier, context) }
    catch (error) {
      if (!specifier.startsWith('.') || /\.[a-z]+$/i.test(specifier)) throw error
      resolved = next(`${specifier}.tsx`, context)
    }
    return resolved.url === storeUrl ? { url:'test:feedback-ui-store',shortCircuit:true } : resolved
  },
  load(url, context, next) {
    if (url === 'test:feedback-ui-store') return { format:'module',shortCircuit:true,source:'export const store=globalThis.feedbackUiStore;' }
    if (url.endsWith('.tsx')) return { format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8'),{ loader:'tsx',jsx:'automatic',format:'esm' }).code }
    return next(url, context)
  },
})

const events = new EventTarget()
globalThis.window = { addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),confirm:()=>true }
globalThis.location = { hash:'#/feedback' }
const now='2026-11-08T10:00:00Z'
const base={ id:'report-1',author_id:'reader',author_name:'Reader',category:'bug',title:'Calendar marker issue',description:'The calendar marker needs a detailed synthetic explanation.',visibility:'public',status:'open',created_at:now,updated_at:now }
let state
globalThis.feedbackUiStore={ feedback:{
  list:async()=>state.reports,
  create:async input=>{ state.created=input; return 'created-id' },
  replies:async id=>{ state.replyLoads.push(id); return state.replies },
  reply:async(id,body)=>{ state.sent={ id,body }; state.replies.push({ id:'reply-new',report_id:id,author_id:'reader',author_name:'Reader',author_role:'reader',body,created_at:now }) },
  setStatus:async(id,status)=>{ state.status={ id,status }; state.reports=state.reports.map(report=>report.id===id?{...report,status}:report) },
  remove:async id=>{ state.removed=id; state.reports=state.reports.filter(report=>report.id!==id) },
} }
const { default:Feedback }=await import('../src/pages/Feedback.tsx')
const user={ id:'reader',email:'reader@synthetic.invalid',name:'Reader',role:'reader' }
const data=(role='reader')=>({ user:{...user,role},admin:role==='admin' })
const content=root=>JSON.stringify(root.toJSON())
const nodeText=node=>typeof node==='string'?node:node.children.map(nodeText).join('')
const button=(root,label)=>root.root.findAllByType('button').find(node=>nodeText(node)===label)
async function mount(role='reader'){ let root; await act(async()=>{ root=renderer.create(React.createElement(Feedback,{ data:data(role) })) }); return root }

test('authenticated students can browse and submit reports without admin controls',async()=>{
  state={ reports:[base,{...base,id:'private',visibility:'private',title:'Private report'}],replies:[],replyLoads:[] }; location.hash='#/feedback'
  const root=await mount()
  try {
    assert.match(content(root),/Calendar marker issue/)
    assert.match(content(root),/Private report/)
    assert.doesNotMatch(content(root),/Delete report/)
    await act(async()=>button(root,'New report').props.onClick())
    const form=root.root.findAllByType('form')[0]
    const inputs=form.findAllByType('input'),textarea=form.findByType('textarea'),selects=form.findAllByType('select')
    await act(async()=>{
      selects[0].props.onChange({ target:{ value:'feature' } }); selects[1].props.onChange({ target:{ value:'private' } })
      inputs[0].props.onChange({ target:{ value:'  Better filters  ' } }); textarea.props.onChange({ target:{ value:'  Please add a detailed filter improvement.  ' } })
    })
    await act(async()=>form.props.onSubmit({ preventDefault(){} }))
    assert.deepEqual(state.created,{ category:'feature',title:'Better filters',description:'Please add a detailed filter improvement.',visibility:'private' })
  } finally { await act(async()=>root.unmount()) }
})

test('report detail posts replies while only admins receive status and delete controls',async()=>{
  state={ reports:[base],replies:[{ id:'reply-1',report_id:base.id,author_id:'admin',author_name:'Admin',author_role:'admin',body:'We are checking this.',created_at:now }],replyLoads:[] }; location.hash='#/feedback?id=report-1'
  let root=await mount()
  try {
    assert.match(content(root),/We are checking this/); assert.match(content(root),/Admin/); assert.doesNotMatch(content(root),/Delete report/)
    const form=root.root.findByType('form'),textarea=form.findByType('textarea')
    await act(async()=>textarea.props.onChange({ target:{ value:'  Student follow-up  ' } }))
    await act(async()=>form.props.onSubmit({ preventDefault(){} }))
    assert.deepEqual(state.sent,{ id:'report-1',body:'Student follow-up' })
  } finally { await act(async()=>root.unmount()) }

  location.hash='#/feedback?id=report-1'; root=await mount('admin')
  try {
    const status=root.root.findAllByType('select').find(select=>select.props.value==='open')
    await act(async()=>status.props.onChange({ target:{ value:'resolved' } }))
    assert.deepEqual(state.status,{ id:'report-1',status:'resolved' })
    await act(async()=>button(root,'Delete report').props.onClick())
    assert.equal(state.removed,'report-1')
  } finally { await act(async()=>root.unmount()) }
})
