import './typescript-loader.mjs'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initialSidebarState, readSidebarPreferences, saveSidebarPreference, sidebarLayout, sidebarReducer, SIDEBAR_KEYS } from '../src/lib/sidebar.ts'

// A synthetic DOM, not a browser or a screenshot of the user's computer.
const dom=new JSDOM('<!doctype html><html data-theme="light"><head></head><body></body></html>',{ url:'http://synthetic.invalid/' })
globalThis.window=dom.window; globalThis.document=dom.window.document
globalThis.localStorage=window.localStorage
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const scrollCalls=[]
window.scrollTo=(x,y)=>{ scrollCalls.push([x,y]); window.scrollX=x; window.scrollY=y }
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8')
const style=document.createElement('style'); style.textContent=css; document.head.append(style)
const storeUrl=new URL('../src/lib/store.ts',import.meta.url).href
registerHooks({
  resolve(specifier,context,next) {
    let result
    try { result=next(specifier,context) }
    catch(error) { if(!specifier.startsWith('.') || /\.[a-z]+$/i.test(specifier)) throw error; result=next(`${specifier}.tsx`,context) }
    return result.url===storeUrl ? { url:'test:sidebar-store',shortCircuit:true } : result
  },
  load(url,context,next) {
    if(url==='test:sidebar-store') return { format:'module',shortCircuit:true,source:'export const store = {};' }
    if(url.endsWith('.tsx')) return { format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8'),{ loader:'tsx',jsx:'automatic',format:'esm' }).code }
    return next(url,context)
  },
})
const { default:Sidebar }=await import('../src/components/Sidebar.tsx')
const { TopBar }=await import('../src/components/ui.tsx')
const account={ id:'synthetic',name:'Synthetic student',email:'synthetic@example.invalid',role:'admin' }
const items=[{ route:'today',href:'#/',label:'Today',icon:'today' },{ route:'news',href:'#/news',label:'News',icon:'chat' }]
const q=selector=>document.querySelector(selector)
const all=selector=>Array.from(document.querySelectorAll(selector))
function prepare(width){
  window.innerWidth=width; window.innerHeight=844; window.scrollX=0; window.scrollY=120
  Object.defineProperty(document.documentElement,'clientWidth',{ configurable:true,value:width-15 })
  document.documentElement.dataset.theme='light'
  document.body.style.cssText='overflow: auto; position: relative; padding-right: 5px;'
  document.body.innerHTML='<div id="test-root"></div>'
  localStorage.clear(); scrollCalls.length=0
  window.history.replaceState(null,'','/')
}
async function mount(options={}) {
  let guides=0,signouts=0
  const root=createRoot(q('#test-root'))
  const render=async(props={})=>act(async()=>root.render(React.createElement(Sidebar,{ user:account,items,route:'today',guideOpen:false,onGuide:()=>guides++,signOut:async()=>{ signouts++ },...options,...props },
    React.createElement('main',{ className:'page' },React.createElement(TopBar,{ user:props.user??options.user??account }),React.createElement('h1',null,'Synthetic page'),React.createElement('button',{ id:'background-control' },'Background task')))))
  await render()
  return { render,guides:()=>guides,signouts:()=>signouts,close:async()=>{ await act(async()=>root.unmount()); await new Promise(resolve=>setTimeout(resolve,0)) } }
}
const click=async element=>act(async()=>element.click())
const resize=async width=>act(async()=>{ window.innerWidth=width; window.dispatchEvent(new window.Event('resize')) })
const key=async(key,shiftKey=false)=>act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{ key,shiftKey,bubbles:true,cancelable:true })))

test('requested viewport defaults and push/overlay rules',()=>{
  for(const [width,mode,expanded,visible,offset] of [[320,'phone',true,false,0],[375,'phone',true,false,0],[768,'tablet',false,true,60],[1024,'desktop',true,true,220],[1440,'desktop',true,true,220]]) {
    const state=initialSidebarState(width),layout=sidebarLayout(state)
    assert.equal(state.mode,mode); assert.equal(layout.expanded,expanded); assert.equal(layout.visible,visible); assert.equal(layout.offset,offset); assert.equal(layout.overlay,false)
    const toggled=sidebarLayout(sidebarReducer(state,{ type:'toggle' }))
    assert.equal(toggled.overlay,mode!=='desktop')
    assert.equal(toggled.offset,mode==='desktop'?60:offset)
    assert.equal(toggled.width,mode==='desktop'?60:220)
  }
})

test('five DOM viewport states keep the same ordered, 44px rows and aligned icon column',async()=>{
  for(const width of [320,375,768,1024,1440]) {
    prepare(width); const app=await mount()
    try {
      const mode=width<768?'phone':width<1024?'tablet':'desktop'
      assert.equal(q('.navigation-shell').dataset.navigationMode,mode)
      assert.equal(q('.navigation-shell').style.getPropertyValue('--navigation-offset'),mode==='phone'?'0px':mode==='tablet'?'60px':'220px')
      assert.equal(q('.sidebar').dataset.visible,mode==='phone'?'false':'true')
      assert.equal(all('.tabs').length,0)
      const before=all('.sidebar-nav a').map(link=>[link.getAttribute('href'),window.getComputedStyle(link).height,window.getComputedStyle(link).gridTemplateColumns])
      assert.deepEqual(before,[['#/','44px','44px 144px'],['#/news','44px','44px 144px']])
      if(mode==='phone') await click(q('.navigation-menu')); else await click(q('.sidebar-toggle'))
      const after=all('.sidebar-nav a').map(link=>[link.getAttribute('href'),window.getComputedStyle(link).height,window.getComputedStyle(link).gridTemplateColumns])
      assert.deepEqual(after,before)
      assert.equal(q('.sidebar').getAttribute('role'),mode==='desktop'?null:'dialog')
      assert.equal(q('.sidebar-nav a').getAttribute('aria-current'),'page')
      assert.equal(window.getComputedStyle(q('.sidebar')).width,mode==='desktop'?'60px':'220px')
    } finally { await app.close() }
  }
})

test('desktop/tablet preferences persist separately; phones reset closed across category changes',async()=>{
  prepare(1440); let app=await mount()
  try {
    await click(q('.sidebar-toggle'))
    assert.equal(localStorage.getItem(SIDEBAR_KEYS.desktop),'collapsed')
    await resize(768); await click(q('.sidebar-toggle'))
    assert.equal(localStorage.getItem(SIDEBAR_KEYS.tablet),'expanded')
    await resize(375)
    assert.equal(q('.sidebar').dataset.visible,'false')
    await click(q('.navigation-menu')); await resize(320)
    assert.equal(q('.sidebar').dataset.visible,'true')
    await resize(1440)
    assert.equal(q('.sidebar').dataset.expanded,'false')
    await resize(375)
    assert.equal(q('.sidebar').dataset.visible,'false')
    await app.close()
    window.innerWidth=1440; app=await mount()
    assert.equal(q('.sidebar').dataset.expanded,'false')
    await resize(768)
    assert.equal(q('.sidebar').dataset.expanded,'true')
  } finally { await app.close() }
})

test('overlay traps focus, blocks background interaction/scroll, and restores focus and body styles',async()=>{
  for(const width of [375,768]) {
    prepare(width); const original=document.body.style.cssText,app=await mount()
    try {
      const opener=width<768?q('.navigation-menu'):q('.sidebar-toggle')
      q('.sidebar').scrollTop=400
      await act(async()=>opener.focus()); await click(opener)
      assert.equal(document.activeElement,q('.sidebar-toggle'))
      assert.equal(q('.sidebar').scrollTop,0)
      assert.equal(document.body.style.position,'fixed')
      assert.equal(document.body.style.top,'-120px')
      assert.ok(q('.navigation-content').hasAttribute('inert'))
      assert.equal(q('.navigation-content').getAttribute('aria-hidden'),'true')
      assert.equal(q('.sidebar').getAttribute('aria-modal'),'true')
      const last=q('.sidebar [aria-label="Sign out"]')
      await act(async()=>last.focus()); await key('Tab')
      assert.equal(document.activeElement,q('.sidebar-toggle'))
      await key('Tab',true); assert.equal(document.activeElement,last)
      await act(async()=>q('#background-control').focus())
      assert.ok(q('.sidebar').contains(document.activeElement))
      await key('Escape')
      assert.equal(q('.sidebar').getAttribute('role'),null)
      assert.equal(document.body.style.cssText,original)
      assert.equal(q('.navigation-content').hasAttribute('inert'),false)
      assert.equal(document.activeElement,opener)
      assert.deepEqual(scrollCalls[scrollCalls.length-1],[0,120])
    } finally { await app.close() }
  }
})

test('backdrop, navigation, collapse control and guide close overlays',async()=>{
  for(const width of [320,768]) for(const action of ['backdrop','navigation','toggle','guide']) {
    prepare(width); const app=await mount()
    try {
      await click(width<768?q('.navigation-menu'):q('.sidebar-toggle'))
      await click(action==='backdrop'?q('.sidebar-backdrop'):action==='navigation'?q('.sidebar-nav a'):action==='toggle'?q('.sidebar-toggle'):q('.sidebar [aria-label="Open the guide"]'))
      assert.equal(q('.sidebar-backdrop').dataset.open,'false')
      assert.equal(q('.navigation-content').hasAttribute('inert'),false)
      assert.equal(document.activeElement,width<768?q('.navigation-menu'):q('.sidebar-toggle'))
      assert.equal(app.guides(),action==='guide'?1:0)
    } finally { await app.close() }
  }
})

test('overlay resize and unmount release the scroll lock',async()=>{
  prepare(375); const before=document.body.style.cssText,app=await mount()
  await click(q('.navigation-menu'))
  await resize(1024)
  assert.equal(document.body.style.cssText,before)
  assert.equal(q('.sidebar').getAttribute('aria-modal'),null)
  await resize(375); await click(q('.navigation-menu')); await app.close()
  assert.equal(document.body.style.cssText,before)
})

test('resizing a focused desktop sidebar to phone returns focus to its menu',async()=>{
  prepare(1440); const app=await mount()
  try {
    await act(async()=>q('.sidebar-nav a').focus())
    await resize(375)
    assert.equal(document.activeElement,q('.navigation-menu'))
  } finally { await app.close() }
})

test('opening the guide releases a saved tablet overlay instead of trapping the tour',async()=>{
  prepare(768); localStorage.setItem(SIDEBAR_KEYS.tablet,'expanded')
  const app=await mount()
  try {
    assert.equal(document.body.style.position,'fixed')
    await app.render({ guideOpen:true })
    assert.equal(q('.sidebar-backdrop').dataset.open,'false')
    assert.equal(q('.navigation-content').hasAttribute('inert'),false)
    assert.equal(document.body.style.position,'relative')
  } finally { await app.close() }
})

test('collapsed tooltips work on keyboard focus and actual Admin role is retained',async()=>{
  prepare(768); const app=await mount()
  try {
    await act(async()=>q('.sidebar-nav a').focus())
    assert.equal(q('[role="tooltip"]').textContent,'Today')
    assert.equal(q('.sidebar-nav a').getAttribute('aria-describedby'),q('[role="tooltip"]').id)
    assert.equal(q('.sidebar-nav a').getAttribute('aria-label'),'Today')
    for(const badge of all('[data-role]')) { assert.equal(badge.dataset.role,'admin'); assert.equal(badge.textContent,'Admin') }
    assert.equal(q('.theme-row'),null)
    await click(q('.sidebar [aria-label="Sign out"]')); assert.equal(app.signouts(),1)
  } finally { await app.close() }
})

test('invalid or unavailable storage uses defaults without preventing navigation',()=>{
  const storage={ getItem:()=>{ throw Error('Blocked') },setItem:()=>{ throw Error('Blocked') } }
  assert.deepEqual(readSidebarPreferences(storage),{})
  assert.doesNotThrow(()=>saveSidebarPreference(storage,'desktop',false))
  assert.deepEqual(readSidebarPreferences({ getItem:()=> 'not-a-preference' }),{})
})

test('navigation CSS retains short-screen scrolling, reduced-motion alternatives and no bottom bar',()=>{
  assert.match(css,/\.sidebar\s*\{[^}]*overflow-y:\s*auto/s)
  assert.match(css,/grid-template-columns:\s*44px 144px/)
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transition:\s*none/s)
  assert.doesNotMatch(css,/\.tabs(?:\s|\{|\.)/)
  assert.doesNotMatch(css,/--tabs-h|--sidebar-w/)
  assert.match(css,/\.sidebar-bottom\s*\{[^}]*margin-top:\s*auto/)
})

test('sidebar text, active state, role badges and tooltip tokens meet normal-text contrast in both themes',()=>{
  const blocks=[css.match(/:root\s*\{([\s\S]*?)\}/)[1],css.match(/\[data-theme='dark'\]\s*\{([\s\S]*?)\}/)[1]]
  const luminance=hex=>{
    const channels=hex.match(/[a-f\d]{2}/gi).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)
    return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722
  }
  for(const block of blocks) {
    const tokens=Object.fromEntries(Array.from(block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6})/gi),match=>[match[1],match[2]]))
    for(const [foreground,background] of [['--text-2','--surface'],['--muted','--surface'],['--accent-ink','--accent-soft'],['--bg','--text']]) {
      const a=luminance(tokens[foreground]),b=luminance(tokens[background])
      assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${foreground} on ${background}`)
    }
  }
})
