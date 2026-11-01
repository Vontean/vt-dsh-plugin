#!/usr/bin/env node
/**
 * 模拟客户端装载器的拼接行为，提前发现会让整个 web 界面起不来的错误。
 *
 * 装载器把多个插件的 `client.js` 拼进同一个脚本（控制台里那种 `plugins/??a/client.js,b/client.js`
 * 的 URL）。于是每个 client 模块的顶层就是一个共享作用域：两个插件都在顶层写
 * `const PLUGIN_ID`，第二个就会抛 `SyntaxError: Identifier 'PLUGIN_ID' has already been declared`，
 * 整个 web boot 失败。顶层只允许一个 `window.__ModuleLoader__.load({...})` 调用，
 * 其余常量放进 factory 的作用域内。
 *
 * 本脚本检查三件事：
 *   1. 所有插件的 client 入口拼起来可以正常解析（没有顶层重名）；
 *   2. `load({ id })` 的字面量与包名一致；
 *   3. client 里的 `VERSION` 与 package.json 的 version 一致。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGINS_DIR = path.join(ROOT, 'plugins')

const problems = []
const chunks = []

for (const dir of readdirSync(PLUGINS_DIR).sort()) {
  const pluginDir = path.join(PLUGINS_DIR, dir)
  const manifestPath = path.join(pluginDir, 'package.json')
  if (!existsSync(manifestPath)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const exported = manifest.exports?.['./client']
  const relative = typeof exported === 'string' ? exported : exported?.default ?? './client.js'
  const entry = path.join(pluginDir, relative)
  if (!existsSync(entry)) {
    problems.push(`${dir}: 找不到 client 入口 ${relative}`)
    continue
  }
  const source = readFileSync(entry, 'utf8')
  chunks.push(`// ── ${manifest.name} (${relative}) ──\n${source}\n`)

  const load = source.match(/__ModuleLoader__\.load\(\{\s*(?:\/\/[^\n]*\n\s*)*id:\s*['"](?<id>[^'"]+)['"]/u)
  if (load?.groups?.id !== undefined && load.groups.id !== manifest.name) {
    problems.push(`${dir}: load({ id: '${load.groups.id}' }) 与包名 ${manifest.name} 不一致`)
  }
  const version = source.match(/const VERSION = ['"]([^'"]+)['"]/u)
  if (version !== null && version[1] !== manifest.version) {
    problems.push(`${dir}: client.js 的 VERSION ${version[1]} 与 package.json 的 ${manifest.version} 不一致`)
  }
}

const bundle = chunks.join('\n')
try {
  // 只编译不执行：顶层 lexical 重名会在这里抛 SyntaxError。
  new vm.Script(bundle, { filename: 'plugins-bundle.js' })
} catch (error) {
  problems.push(`拼接后的 client bundle 无法解析：${error.message}`)
}

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`✗ ${problem}\n`)
  process.stderr.write(
    '\n提示：client.js 顶层只能有 window.__ModuleLoader__.load({...})；' +
      '包名、VERSION 等常量放进 factory 作用域。\n',
  )
  process.exit(1)
}

process.stdout.write(`✓ ${String(chunks.length)} 个 client 模块拼接后可解析，包名与 VERSION 一致\n`)
