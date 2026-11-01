import test from 'node:test'
import assert from 'node:assert/strict'
import { routingText } from '../src/routing.js'

const INSTALL = {
  ok: true,
  install: { version: '0.1.2', origin: 'mcp-json', workspace: '/work' },
}

test('states the routing rules even when nothing is installed, and names the reason', () => {
  const text = routingText({ ok: false, reason: 'MineDesign not found' }, [])

  assert.match(text, /mcp__minedesign__/u)
  assert.match(text, /没找到可用的 MineDesign/u)
  assert.match(text, /MineDesign not found/u)
})

test('adds install facts and the exposed skill names when ready', () => {
  const text = routingText(INSTALL, [{ name: 'minedesign-design' }, { name: 'minedesign-design-system' }])

  assert.match(text, /MineDesign 0\.1\.2/u)
  assert.match(text, /来源 mcp-json/u)
  assert.match(text, /作品目录 `\/work`/u)
  assert.match(text, /`minedesign-design`、`minedesign-design-system`/u)
})

test('flags a missing skills directory instead of claiming skills are ready', () => {
  const text = routingText(INSTALL, [])

  assert.match(text, /没找到 MineDesign 技能目录/u)
  assert.doesNotMatch(text, /技能就绪/u)
})

test('always opens with the routing heading, ready or not', () => {
  for (const text of [routingText(INSTALL, []), routingText({ ok: false, reason: 'x' }, [])]) {
    assert.match(text, /^## MineDesign/u)
  }
})
