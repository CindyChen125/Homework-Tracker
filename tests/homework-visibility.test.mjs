import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
const { visibleHomework } = await import('../src/lib/class-choices.ts')

const subjects = ['EC(H)','EC(S+1)','EE(H)','EE(S+2)','Math(S+1)','Math(S+3)','History','Other']
const items = subjects.map((subject, index) => ({ id:String(index),subject }))

test('Readers and Editors see only their EC, EE and Math streams plus shared homework', () => {
  for (const role of ['reader','editor']) {
    const user = { role,ec_class:'EC(S+1)',ee_class:'EE(S+2)',math_class:'Math(S+3)' }
    assert.deepEqual(visibleHomework(items,user).map(item=>item.subject),
      ['EC(S+1)','EE(S+2)','Math(S+3)','History','Other'])
  }
})

test('Admins see every stream; a missing selection never reveals another mapped class', () => {
  const user = { role:'reader',ec_class:null,ee_class:null,math_class:null }
  assert.deepEqual(visibleHomework(items,user).map(item=>item.subject),['History','Other'])
  assert.deepEqual(visibleHomework(items,{...user,role:'admin'}),items)
})
