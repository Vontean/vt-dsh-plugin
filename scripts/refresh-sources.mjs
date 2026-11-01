#!/usr/bin/env node
/**
 * 把已经发布到 npm 的版本从 git 来源刷新成 npm 来源（只升不降）。
 *
 * 首次发版时 npm 不一定已经有包，市场索引就记成 commit 固定的 git 子树；
 * 之后补发 npm，运行本脚本（或 Actions 的 Refresh market sources 工作流），
 * 索引来源就会换成 npm 包。某个版本在 npm 上查不到时保持原记录不变。
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER_PATH = process.env.MARKET_RELEASES ?? path.join(ROOT, 'market', 'releases.json')
const REGISTRY = 'https://registry.npmjs.org'
const TIMEOUT_MS = 15000

/** npm registry 上是否有这个精确版本；网络错误按「未知」处理，不改记录。 */
async function publishedOnNpm(name, version) {
  const url = `${REGISTRY}/${name.replace('/', '%2f')}/${version}`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    return response.ok
  } catch {
    return false
  }
}

if (!existsSync(LEDGER_PATH)) {
  process.stderr.write(`找不到账本：${LEDGER_PATH}\n`)
  process.exit(1)
}

const ledger = JSON.parse(await readFile(LEDGER_PATH, 'utf8'))
let changed = 0

for (const [name, versions] of Object.entries(ledger)) {
  for (const entry of versions) {
    if (entry.source.type === 'npm') continue
    if (!(await publishedOnNpm(name, entry.version))) {
      process.stdout.write(`· ${name}@${entry.version} 仍不在 npm 上，保留 git 来源\n`)
      continue
    }
    entry.source = { type: 'npm' }
    changed += 1
    process.stdout.write(`✓ ${name}@${entry.version} 改为 npm 来源\n`)
  }
}

if (changed === 0) {
  process.stdout.write('没有需要刷新的版本\n')
} else {
  await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`)
  process.stdout.write(`更新了 ${String(changed)} 条来源记录\n`)
}
