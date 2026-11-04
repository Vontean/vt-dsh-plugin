#!/usr/bin/env node
/**
 * 生成并校验 market/index.json。
 *
 * 数据来源：
 *   plugins/<dir>/package.json   —— name / version / description / engines.dsh
 *   plugins/<dir>/market.json    —— 市场展示信息（标题、说明、图标、分类）
 *   market/releases.json         —— 已发布版本账本（release 工作流写入）
 *   market/config.json           —— 索引标题与分类声明
 *   market/external.json         —— 收录的第三方插件（别人发布的 npm 包，我按自己装的版本钉住）
 *
 * 只有账本里已有发布记录的插件才会进入索引；生成后交给官方
 * @deepseek-ai/dsh-plugin-market-index 的 parseMarketIndex 校验，
 * 校验失败直接非零退出，CI 不会提交一份坏索引。
 *
 * 环境变量：
 *   MARKET_INDEX_URL  索引发布后的绝对 URL（相对的 icon 会按它解析，默认 GitHub Pages）
 *   MARKET_RELEASES   账本路径（本地演练时指向临时文件）
 */
import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGINS_DIR = path.join(ROOT, 'plugins')
const MARKET_DIR = path.join(ROOT, 'market')
const REPO_URL = 'https://github.com/Vontean/vt-dsh-plugin'
const AUTHOR = 'Vontean'
const INDEX_URL = process.env.MARKET_INDEX_URL ?? 'https://vontean.github.io/vt-dsh-plugin/index.json'
const LEDGER_PATH = process.env.MARKET_RELEASES ?? path.join(MARKET_DIR, 'releases.json')
const ICON_TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))

/** 内联图标：市场校验器接受 ≤32 KiB 的 base64 data URL，内联后索引不依赖额外静态文件。 */
async function inlineIcon(pluginDir, iconPath) {
  const file = path.join(pluginDir, iconPath)
  const type = ICON_TYPES[path.extname(file).toLowerCase()]
  if (type === undefined || !existsSync(file)) {
    throw new Error(`${path.relative(ROOT, pluginDir)}: market.json 的 icon 必须是 ${Object.keys(ICON_TYPES).join('/')} 文件`)
  }
  const bytes = await readFile(file)
  return `data:${type};base64,${bytes.toString('base64')}`
}

const config = await readJson(path.join(MARKET_DIR, 'config.json'))
const ledger = await readJson(LEDGER_PATH)
const externalPath = path.join(MARKET_DIR, 'external.json')
const external = existsSync(externalPath) ? await readJson(externalPath) : { plugins: [] }

const plugins = []
const warnings = []

for (const dir of (await readdir(PLUGINS_DIR)).sort()) {
  const pluginDir = path.join(PLUGINS_DIR, dir)
  const manifestPath = path.join(pluginDir, 'package.json')
  if (!existsSync(manifestPath)) continue
  const manifest = await readJson(manifestPath)

  const metaPath = path.join(pluginDir, 'market.json')
  if (!existsSync(metaPath)) {
    warnings.push(`${dir}: 缺少 market.json，未进入索引`)
    continue
  }
  const meta = await readJson(metaPath)

  const released = ledger[manifest.name] ?? []
  if (released.length === 0) {
    warnings.push(`${dir}: market/releases.json 里没有 ${manifest.name} 的发布记录，未进入索引`)
    continue
  }
  if (!released.some((entry) => entry.version === manifest.version)) {
    warnings.push(`${dir}: 当前版本 ${manifest.version} 尚未发布，索引里只有已发布版本`)
  }

  plugins.push({
    name: manifest.name,
    ...(meta.title === undefined ? {} : { title: meta.title }),
    ...(meta.description === undefined ? {} : { description: meta.description }),
    ...(meta.icon === undefined ? {} : { icon: await inlineIcon(pluginDir, meta.icon) }),
    author: AUTHOR,
    ...(manifest.homepage === undefined ? {} : { homepage: manifest.homepage }),
    repository: { url: REPO_URL, directory: `plugins/${dir}` },
    metadata: {
      ...(meta.category === undefined ? {} : { category: meta.category }),
      keywords: meta.keywords ?? manifest.keywords ?? [],
      labels: meta.labels ?? [],
    },
    versions: released,
  })
}

// 第三方插件：直接声明成市场记录，版本由我手工钉住（只收自己在用的版本）。
// 只允许 npm 来源；git 来源要现场构建，pnpm 默认拒绝执行依赖的构建脚本，装不出来。
const categories = config.metadata?.categories ?? {}
const names = new Set(plugins.map((plugin) => plugin.name))
for (const [position, entry] of (external.plugins ?? []).entries()) {
  const at = `market/external.json plugins[${String(position)}]`
  if (names.has(entry.name)) throw new Error(`${at}: ${entry.name} 与 plugins/ 下的自研插件重名`)
  names.add(entry.name)
  if (entry.category !== undefined && categories[entry.category] === undefined) {
    throw new Error(`${at}: 分类 ${entry.category} 未在 market/config.json 声明`)
  }
  if (!Array.isArray(entry.versions) || entry.versions.some((version) => version.source?.type !== 'npm')) {
    throw new Error(`${at}: 第三方插件只收 npm 来源，versions[].source.type 必须是 npm`)
  }

  plugins.push({
    name: entry.name,
    ...(entry.title === undefined ? {} : { title: entry.title }),
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(entry.icon === undefined ? {} : { icon: await inlineIcon(MARKET_DIR, entry.icon) }),
    ...(entry.author === undefined ? {} : { author: entry.author }),
    ...(entry.homepage === undefined ? {} : { homepage: entry.homepage }),
    ...(entry.repository === undefined ? {} : { repository: entry.repository }),
    metadata: {
      ...(entry.category === undefined ? {} : { category: entry.category }),
      keywords: entry.keywords ?? [],
      labels: entry.labels ?? [],
    },
    versions: entry.versions,
  })
}

const index = {
  format: 1,
  title: config.title,
  ...(config.description === undefined ? {} : { description: config.description }),
  metadata: config.metadata ?? {},
  plugins,
}

// 校验失败的路径会以 "$.plugins[0].versions[1].version ..." 的形式抛出，直接暴露给 CI。
const validated = parseMarketIndex(index, INDEX_URL)

const target = path.join(MARKET_DIR, 'index.json')
await writeFile(target, `${JSON.stringify(validated, null, 2)}\n`)

for (const warning of warnings) process.stderr.write(`warn: ${warning}\n`)
process.stdout.write(
  `market/index.json: ${String(validated.plugins.length)} 个插件、` +
    `${String(validated.plugins.reduce((total, plugin) => total + plugin.versions.length, 0))} 个版本` +
    `（校验通过，索引 URL ${INDEX_URL}）\n`,
)
