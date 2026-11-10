import './typescript-loader.mjs'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import React from 'react'
import renderer, { act } from 'react-test-renderer'
import assert from 'node:assert/strict'
import test from 'node:test'

// Render the real React application in memory. No screen/browser access.
const storeUrl=new URL('../src/lib/store.ts',import.meta.url).href
registerHooks({
  resolve(specifier,context,next) {
    let resolved
    try { resolved=next(specifier,context) }
    catch(error) {
      if (!specifier.startsWith('.') || /\.[a-z]+$/i.test(specifier)) throw error
      resolved=next(`${specifier}.tsx`,context)
    }
    return resolved.url===storeUrl ? { url:'test:auth-ui-store',shortCircuit:true } : resolved
  },
  load(url,context,next) {
    if(url==='test:auth-ui-store') return { format:'module',shortCircuit:true,source:'export const store=globalThis.authUiStore; export const canEdit=a=>a?.role==="editor"||a?.role==="admin"; export const isAdmin=a=>a?.role==="admin";' }
    if(url.endsWith('.tsx')) return { format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8'),{ loader:'tsx',jsx:'automatic',format:'esm' }).code }
    return next(url,context)
  },
})
let state,listener
const events=new EventTarget(),documentEvents=new EventTarget()
globalThis.window={ addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),setInterval,clearInterval,scrollTo(){},confirm:()=>true }
globalThis.document={ documentElement:{ dataset:{ theme:'dark' } },visibilityState:'visible',addEventListener:documentEvents.addEventListener.bind(documentEvents),removeEventListener:documentEvents.removeEventListener.bind(documentEvents) }
globalThis.location={ hash:'#/',replace(hash){ this.hash=hash; events.dispatchEvent(new Event('hashchange')) } }
globalThis.localStorage={ getItem:key=>key.startsWith('hw-tour-seen')?'1':null,setItem(){} }
const reader={ id:'reader',email:'reader@synthetic.invalid',name:'Reader',role:'reader' }
const record=name=>{ state.reads.push(name) }
globalThis.authUiStore={
  mode:'supabase',
  currentUser:()=>state.lookup(),
  subscribeAuth:fn=>{ listener=fn; return()=>{ listener=null } },
  signIn:async()=>{ if(state.signInError) throw Error('Invalid credentials'); state.lookup=async()=>reader; listener(true) },
  signUp:async(email,password,name)=>{
    state.signup={ email,password,name }; state.signupCalls=(state.signupCalls??0)+1
    if(state.signupPending) await state.signupPending
    state.lookup=async()=>reader; listener(true)
  },
  signOut:async()=>{ state.lookup=async()=>null; listener(false) },
  list:async()=>{ record('items'); return [] },materials:async()=>{ record('materials'); return [] },
  timetable:async()=>{ record('timetable'); return Array.from({ length:5 },()=>Array(9).fill(null)) },changes:async()=>{ record('changes'); return [] },
  people:async()=>{ record('people'); return state.people??[] },
  setRole:async()=>{},setNewsManager:async()=>{},
  deleteUser:async id=>{ state.deleteCalls=(state.deleteCalls??[]).concat(id); if(state.deleteError) throw Error(state.deleteError); state.people=state.people.filter(person=>person.id!==id); return { warning:state.deleteWarning??null } },
  news:{ list:async()=>{ record('news'); return [] },greetings:async()=>{ record('greetings'); return [] } },
  feedback:{ list:async()=>{ record('feedback'); return [] },create:async()=>'',replies:async()=>[],reply:async()=>{},setStatus:async()=>{},remove:async()=>{} },
}
const { default:App }=await import('../src/App.tsx')
const { default:Post }=await import('../src/pages/Post.tsx')
const { default:People }=await import('../src/pages/People.tsx')
const { default:Feedback }=await import('../src/pages/Feedback.tsx')
const reset=(account=null)=>{ state={ lookup:async()=>account,reads:[] }; location.hash='#/' }
const text=root=>JSON.stringify(root.toJSON())
async function mount(){ let root; await act(async()=>{ root=renderer.create(React.createElement(App)) }); return root }
async function close(root){ await act(async()=>root.unmount()) }
async function navigate(hash){ await act(async()=>{ location.replace(hash) }) }

test('signed-out deep links expose only authentication and fetch no class data',async()=>{
  for(const hash of ['#/','#/materials','#/people','#/post','#/news?view=birthdays','#/school-calendar','#/feedback']){
    reset(); location.hash=hash
    const root=await mount()
    try {
      assert.match(text(root),/Sign in/)
      assert.equal(root.root.findAllByType('nav').length,0)
      assert.deepEqual(state.reads,[])
      assert.equal(root.root.findAllByType('form').length,1)
    } finally { await close(root) }
  }
})

test('checking authentication never flashes protected content',async()=>{
  reset(); let resolve; state.lookup=()=>new Promise(r=>{ resolve=r })
  const root=await mount()
  try {
    assert.match(text(root),/Checking your session/)
    assert.equal(root.root.findAllByType('nav').length,0)
    assert.deepEqual(state.reads,[])
    await act(async()=>resolve(null))
    assert.match(text(root),/Sign in/)
  } finally { await close(root) }
})

test('successful login redirects to Today, preserves restored sessions, and signs out',async()=>{
  reset(); location.hash='#/people'
  let root=await mount()
  try {
    await act(async()=>root.root.findByType('form').props.onSubmit({ preventDefault(){} }))
    assert.equal(location.hash,'#/')
    assert.match(text(root),/Coming Up/)
    assert.ok(state.reads.includes('items'))
    await close(root)
    root=await mount() // Persisted SDK session, as after a refresh.
    assert.match(text(root),/Coming Up/)
    const button=root.root.findAllByType('button').find(b=>b.props['aria-label']==='Sign out')
    assert.ok(button,'all roles have a visible, labeled sign-out button')
    await act(async()=>button.props.onClick())
    assert.match(text(root),/Sign in/)
    assert.equal(root.root.findAllByType('nav').length,0)
  } finally { await close(root) }
})

test('reader/editor/admin direct routes enforce interface permissions',async()=>{
  for(const role of ['reader','editor','admin']){
    reset({ ...reader,role })
    const root=await mount()
    try {
      await navigate('#/people')
      assert.equal(root.root.findAllByType(People).length,role==='admin'?1:0)
      assert.equal(state.reads.includes('people'),role==='admin')
      await navigate('#/post')
      assert.equal(root.root.findAllByType(Post).length,role==='reader'?0:1)
      await navigate('#/feedback')
      assert.equal(root.root.findAllByType(Feedback).length,1)
      assert.ok(state.reads.includes('feedback'))
      assert.ok(root.root.findAllByType('button').some(b=>b.props['aria-label']==='Sign out'))
    } finally { await close(root) }
  }
})

test('admin deletion confirms, prevents self/last-admin deletion, and refreshes People',async()=>{
  const admin={ id:'admin',email:'admin@synthetic.invalid',name:'Admin',role:'admin' }
  const otherAdmin={ id:'other-admin',email:'other-admin@synthetic.invalid',name:'Other Admin',role:'admin' }
  const student={ id:'student',email:'student@synthetic.invalid',name:'Student',role:'reader' }
  reset(admin); state.people=[admin,otherAdmin,student]
  const confirmations=[]; window.confirm=message=>{ confirmations.push(message); return true }
  let root
  await act(async()=>{ root=renderer.create(React.createElement(People,{ data:{ admin:true,user:admin,newsStatus:'ready' } })) })
  try {
    const buttons=()=>root.root.findAllByType('button').filter(button=>button.children.join('')==='Delete user')
    assert.equal(buttons().length,3)
    assert.equal(buttons()[0].props.disabled,true,'current administrator cannot delete themselves')
    assert.equal(buttons()[1].props.disabled,false,'another admin can be deleted while two admins exist')
    await act(async()=>buttons()[2].props.onClick())
    assert.deepEqual(state.deleteCalls,['student'])
    assert.match(confirmations[0],/permanent.*no longer be able to sign in/is)
    assert.equal(root.root.findAllByProps({ className:'card person-card' }).length,2)
    assert.equal(root.root.findAllByProps({ className:'person-who' }).some(node=>node.findAllByType('span').some(span=>span.children.includes('student@synthetic.invalid'))),false)
    assert.match(text(root),/was deleted/)
  } finally { await close(root) }

  reset(admin); state.people=[admin,student]
  await act(async()=>{ root=renderer.create(React.createElement(People,{ data:{ admin:true,user:admin,newsStatus:'ready' } })) })
  try {
    const deleteButtons=root.root.findAllByType('button').filter(button=>button.children.join('')==='Delete user')
    assert.equal(deleteButtons[0].props.disabled,true)
    assert.match(deleteButtons[0].props.title,/own account/)
  } finally { await close(root) }
})

test('failed account deletion leaves People consistent and reports the server error',async()=>{
  const admin={ id:'admin',email:'admin@synthetic.invalid',name:'Admin',role:'admin' }
  const student={ id:'student',email:'student@synthetic.invalid',name:'Student',role:'reader' }
  reset(admin); state.people=[admin,student]; state.deleteError='The account is protected.'; window.confirm=()=>true
  let root
  await act(async()=>{ root=renderer.create(React.createElement(People,{ data:{ admin:true,user:admin,newsStatus:'ready' } })) })
  try {
    const remove=root.root.findAllByType('button').find(button=>button.children.join('')==='Delete user' && !button.props.disabled)
    await act(async()=>remove.props.onClick())
    assert.match(text(root),/The account is protected/)
    assert.match(text(root),/student@synthetic\.invalid/)
    assert.equal(root.root.findAllByProps({ role:'alert' }).length,1)
  } finally { await close(root) }
})

test('matching signup confirmations create an immediate session without an email-confirmation screen',async()=>{
  reset(); const root=await mount()
  try {
    await act(async()=>root.root.findAllByType('button').find(b=>b.children.join('')==='Sign up').props.onClick())
    const inputs=root.root.findAllByType('input')
    await act(async()=>{
      inputs[0].props.onChange({ target:{ value:'New student' } })
      inputs[1].props.onChange({ target:{ value:'  New@Synthetic.Invalid  ' } })
      inputs[2].props.onChange({ target:{ value:'new@synthetic.invalid' } })
      inputs[3].props.onChange({ target:{ value:'synthetic-password' } })
      inputs[4].props.onChange({ target:{ value:'synthetic-password' } })
    })
    await act(async()=>root.root.findByType('form').props.onSubmit({ preventDefault(){} }))
    assert.deepEqual(state.signup,{ email:'New@Synthetic.Invalid',password:'synthetic-password',name:'New student' })
    assert.match(text(root),/Coming Up/)
    assert.doesNotMatch(text(root),/Check your email/)
  } finally { await close(root) }
})

test('signup rejects mismatched or empty confirmations before calling Supabase',async()=>{
  for(const [confirmEmail,confirmPassword,message] of [
    ['other@synthetic.invalid','synthetic-password','Email addresses do not match.'],
    ['','synthetic-password','Confirm your email address.'],
    ['new@synthetic.invalid','different-password','Passwords do not match.'],
    ['new@synthetic.invalid','','Confirm your password.'],
  ]){
    reset(); const root=await mount()
    try {
      await act(async()=>root.root.findAllByType('button').find(b=>b.children.join('')==='Sign up').props.onClick())
      const inputs=root.root.findAllByType('input')
      await act(async()=>{
        inputs[0].props.onChange({ target:{ value:'New student' } })
        inputs[1].props.onChange({ target:{ value:'new@synthetic.invalid' } })
        inputs[2].props.onChange({ target:{ value:confirmEmail } })
        inputs[3].props.onChange({ target:{ value:'synthetic-password' } })
        inputs[4].props.onChange({ target:{ value:confirmPassword } })
      })
      await act(async()=>root.root.findByType('form').props.onSubmit({ preventDefault(){} }))
      assert.match(text(root),new RegExp(message.replace(/[.]/g,'\\.')))
      assert.equal(state.signupCalls,undefined)
    } finally { await close(root) }
  }
})

test('password visibility is keyboard-operable and a busy signup cannot submit twice',async()=>{
  reset(); let release; state.signupPending=new Promise(resolve=>{ release=resolve })
  const root=await mount()
  try {
    await act(async()=>root.root.findAllByType('button').find(b=>b.children.join('')==='Sign up').props.onClick())
    const inputs=root.root.findAllByType('input')
    await act(async()=>{
      for(const [input,value] of inputs.map((input,index)=>[input,['Student','s@invalid.test','s@invalid.test','password','password'][index]])) input.props.onChange({ target:{ value } })
      root.root.findAllByType('button').find(b=>b.children.join('')==='Show password').props.onClick()
    })
    assert.equal(root.root.findAllByProps({ type:'text' }).filter(input=>input.props.autoComplete?.includes('password')).length,2)
    const submit=root.root.findByType('form').props.onSubmit
    let first; await act(async()=>{ first=submit({ preventDefault(){} }); submit({ preventDefault(){} }) })
    assert.equal(state.signupCalls,1)
    await act(async()=>{ release(); await first })
  } finally { await close(root) }
})

test('invalid credentials keep the authentication form and accessible error',async()=>{
  reset(); state.signInError=true
  const root=await mount()
  try {
    await act(async()=>root.root.findByType('form').props.onSubmit({ preventDefault(){} }))
    assert.match(text(root),/Invalid credentials/)
    assert.ok(root.root.findAllByProps({ role:'alert' }).length)
    assert.deepEqual(state.reads,[])
  } finally { await close(root) }
})

test('session expiry removes the class interface and role changes remove admin pages',async()=>{
  reset({ ...reader,role:'admin' })
  const root=await mount()
  try {
    await navigate('#/people')
    assert.equal(root.root.findAllByType(People).length,1)
    state.lookup=async()=>reader
    await act(async()=>{ listener(true); await new Promise(resolve=>setTimeout(resolve,1)) })
    assert.equal(root.root.findAllByType(People).length,0)
    assert.equal(location.hash,'#/')
    await act(async()=>listener(false))
    assert.match(text(root),/Sign in/)
    assert.equal(root.root.findAllByType('nav').length,0)
  } finally { await close(root) }
})

test('failed initial authentication shows an error without loading class data',async()=>{
  reset(); state.lookup=async()=>{ throw Error('Offline') }
  const root=await mount()
  try {
    assert.match(text(root),/Could not check your session/)
    assert.equal(root.root.findAllByType('nav').length,0)
    assert.deepEqual(state.reads,[])
  } finally { await close(root) }
})

test('unified navigation preserves role filtering and accurate badges at every requested width',async()=>{
  for(const width of [320,375,768,1024,1440]) for(const role of ['reader','editor','admin']) {
    window.innerWidth=width
    reset({ ...reader,role })
    const root=await mount()
    try {
      const nav=root.root.findByProps({ 'aria-label':'Main navigation' })
      const hrefs=nav.findAllByType('a').map(link=>link.props.href)
      assert.deepEqual(hrefs,['#/','#/schedule','#/school-calendar','#/materials','#/news','#/feedback',...(role!=='reader'?['#/post']:[]),...(role==='admin'?['#/people']:[])])
      const badges=root.root.findAll(node=>node.type==='span' && node.props['data-role'])
      assert.ok(badges.length>=2)
      for(const badge of badges) {
        assert.equal(badge.props['data-role'],role)
        assert.equal(badge.children.filter(child=>typeof child==='string').join(''),{ admin:'Admin',editor:'Editor',reader:'Reader' }[role])
      }
      assert.equal(root.root.findAllByProps({ className:'tabs' }).length,0)
    } finally { await close(root) }
  }
  delete window.innerWidth
})
