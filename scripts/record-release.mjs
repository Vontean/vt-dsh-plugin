#!/usr/bin/env node
/**
 * 把一个已发布版本写进 market/releases.json 账本（幂等：同版本覆盖）。
 *
 * 用法：
 *   node scripts/record-release.mjs <包名> <版本> <npm|git> [commit] [publishTimestamp]
 *
 * npm 版本记录 source.type = "npm"；git 版本记录 commit（40 位小写十六进制）与
 * 包在仓库里的相对目录，安装时由市场生成 commit 固定的 git+https spec。
 * 账本只记录事实：发布与否由调用方（release 工作流）先核实再调用本脚本。
 */
import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGINS_DIR = path.join(ROOT, 'plugins')
const LEDGER_PATH = process.env.MARKET_RELEASES ?? path.join(ROOT, 'market', 'releases.json')
const REPO_URL = 'https://github.com/Vontean/vt-dsh-plugin'

const [name, version, kind, commit, timestampArgument] = process.argv.slice(2)

if (name === undefined || version === undefined || (kind !== 'npm' && kind !== 'git')) {
  process.stderr.write('用法: node scripts/record-release.mjs <包名> <版本> <npm|git> [commit] [publishTimestamp]\n')
  process.exit(2)
}
if (kind === 'git' && !/^[0-9a-f]{40}$/u.test(commit ?? '')) {
  process.stderr.write('git 版本必须给出 40 位小写十六进制 commit\n')
  process.exit(2)
}

/** 找到包名对应的插件目录。 */
async function pluginDirectory() {
  for (const dir of await readdir(PLUGINS_DIR)) {
    const manifestPath = path.join(PLUGINS_DIR, dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (manifest.name === name) return { dir, manifest }
  }
  throw new Error(`plugins/ 下找不到包名 ${name}`)
}

const { dir, manifest } = await pluginDirectory()
if (manifest.version !== version) {
  throw new Error(`${name} 的 package.json 是 ${manifest.version}，与要记录的 ${version} 不一致`)
}

const ledger = existsSync(LEDGER_PATH) ? JSON.parse(await readFile(LEDGER_PATH, 'utf8')) : {}
const publishTimestamp = timestampArgument === undefined ? Math.floor(Date.now() / 1000) : Number(timestampArgument)
if (!Number.isInteger(publishTimestamp) || publishTimestamp < 0) throw new Error(`publishTimestamp 不合法: ${timestampArgument}`)

const entry = {
  version,
  publishTimestamp,
  source:
    kind === 'npm'
      ? { type: 'npm' }
      : { type: 'git', url: REPO_URL, commit, path: `plugins/${dir}` },
  ...(manifest.engines?.dsh === undefined ? {} : { engines: { dsh: manifest.engines.dsh } }),
}

const versions = (ledger[name] ?? []).filter((existing) => existing.version !== version)
versions.push(entry)
ledger[name] = versions

await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`)
process.stdout.write(`记录 ${name}@${version}（${kind}${kind === 'git' ? ` @ ${commit.slice(0, 7)}` : ''}）\n`)
