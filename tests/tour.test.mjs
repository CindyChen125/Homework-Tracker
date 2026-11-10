import './typescript-loader.mjs'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

// A synthetic DOM, not a browser: it has no layout, so "visible" is faked below.
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://synthetic.invalid/#/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.location = dom.window.location
globalThis.localStorage = dom.window.localStorage
globalThis.IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetParent', { get() { return this.parentNode } })
dom.window.HTMLElement.prototype.scrollIntoView = () => {}

registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context) }
    catch (error) {
      if (!specifier.startsWith('.') || /\.[a-z]+$/i.test(specifier)) throw error
      return next(`${specifier}.tsx`, context)
    }
  },
  load(url, context, next) {
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8'), { loader: 'tsx', jsx: 'automatic', format: 'esm' }).code }
    return next(url, context)
  },
})
const { default: Tour, tourSeen } = await import('../src/components/Tour.tsx')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

const q = (selector) => document.querySelector(selector)
const wait = (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) })
const click = (element) => act(async () => element.click())
const next = () => click([...document.querySelectorAll('.tour-card button')].find((b) => /^(Next|Done)/.test(b.textContent)))
const back = () => click([...document.querySelectorAll('.tour-card button')].find((b) => b.textContent === 'Back'))

let root, closed
async function open({ hash = '#/', editor = false, admin = false, userId = 'one' } = {}) {
  location.hash = hash
  localStorage.clear()
  closed = 0
  root = createRoot(q('#root'))
  await act(async () => root.render(React.createElement(Tour, { userId, editor, admin, onClose: () => { closed++ } })))
}
const shut = async () => { await act(async () => root.unmount()); document.body.innerHTML = '<div id="root"></div>' }

test('Back to a Today step really returns to Today, and opening from another page starts on Today', async () => {
  await open()
  for (let i = 0; i < 4; i++) await next()
  assert.equal(q('.tour-card h3').textContent, 'The timetable')
  assert.equal(location.hash, '#/schedule')
  await back()
  assert.equal(location.hash, '#/')
  await shut()

  await open({ hash: '#/materials' })
  await next()
  assert.equal(location.hash, '#/')
  await shut()
})

test('clicking the dimmed area does not end the guide; Skip does, and is remembered per account', async () => {
  await open({ userId: 'one' })
  await click(q('.tour-shade'))
  assert.equal(closed, 0)
  assert.equal(tourSeen('one'), false)
  await click([...document.querySelectorAll('.tour-card button')].find((b) => b.textContent === 'Skip'))
  assert.equal(closed, 1)
  assert.equal(tourSeen('one'), true)
  assert.equal(tourSeen('two'), false)
  await shut()
})

test('a target that renders late is still lit once it appears', async () => {
  await open({ editor: true })
  for (let i = 0; i < 4; i++) await next()
  assert.equal(q('.tour-card h3').textContent, 'The message for the group')
  assert.equal(q('.tour-hole'), null)
  assert.ok(q('.tour-shade.dim'), 'with nothing lit the shade carries the dim')
  const late = document.createElement('div')
  late.dataset.tour = 'message'
  document.body.append(late)
  await wait(250)
  assert.ok(q('.tour-hole'))
  assert.equal(q('.tour-shade.dim'), null, 'with something lit the shade must not dim it a second time')
  await shut()
})

test('the lit element is not under the shade: only the hole dims the page', () => {
  const rule = (selector) => css.match(new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  assert.doesNotMatch(rule('.tour-shade'), /background/)
  assert.match(rule('.tour-shade.dim'), /background/)
  assert.match(rule('.tour-hole'), /box-shadow:[^;]*9999px/)
})

test('on a phone the last step points at the menu button and says so', async () => {
  const menu = document.createElement('button')
  menu.dataset.tour = 'menu'
  document.body.append(menu)
  await open()
  const total = Number(q('.tour-step').textContent.match(/of (\d+)/)[1])
  for (let i = 1; i < total; i++) await next()
  assert.equal(q('.tour-card h3').textContent, 'That is everything')
  assert.match(q('.tour-card p').textContent, /Open the menu here/)
  await shut()
})

test('focus moves into the guide, stays there on Tab, and returns on close', async () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  await open()
  assert.ok(q('.tour-card').contains(document.activeElement))
  const buttons = [...document.querySelectorAll('.tour-card button')]
  buttons.at(-1).focus()
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
  assert.equal(document.activeElement, buttons[0])
  await act(async () => root.unmount())
  assert.equal(document.activeElement, trigger)
  document.body.innerHTML = '<div id="root"></div>'
})
