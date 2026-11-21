#!/usr/bin/env node
/**
 * 把官方 chat-demo 构建成插件内的静态产物 `webview/dist/`。
 *
 * 为什么在临时目录里构建：本仓库是 pnpm workspace，外来项目一旦落在 workspace 内，
 * `pnpm install` 会被工作区接管、不生成局部 node_modules。放到系统临时目录里就没有这层干扰。
 *
 * 上游改动只有一行：`rspack.config.ts` 的默认导出改成读 `CHAT_DEMO_API_ORIGIN`，
 * 好让前端把请求打到插件自己的 `/webchat` 路由，而不是直连 api.deepseek.com。
 *
 * 用法：
 *   node scripts/sync-upstream.mjs            # 按 PIN 构建
 *   node scripts/sync-upstream.mjs --ref main # 跟到某个分支/tag（仅用于评估升级）
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 上游固定版本；升级时改这里并重新构建。 */
const PIN = '8ad7b56e196b87d8a3215dc09476d6d146ad3f0e';
const REPO = 'https://github.com/deepseek-ai/chat-demo.git';
/** 前端认的接口前缀，必须与宿主路由一致。 */
const API_PREFIX = '/webchat';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, '..');
const distTarget = path.join(pluginDir, 'webview', 'dist');
const work = path.join(os.tmpdir(), 'vt-web-chat-chat-demo');

const ref = (() => {
  const index = process.argv.indexOf('--ref');
  return index === -1 ? PIN : process.argv[index + 1];
})();

const run = (command, args, cwd, env = {}) => {
  process.stderr.write(`$ ${command} ${args.join(' ')}\n`);
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
};

// 1. 取上游。`git clone --branch` 只认分支和标签，所以按 ref 浅拉取一个 commit：
//    空仓库 + 显式 fetch，既支持 SHA 也支持分支名。
if (!fs.existsSync(path.join(work, '.git'))) {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  run('git', ['init', '--quiet'], work);
  run('git', ['remote', 'add', 'origin', REPO], work);
}
run('git', ['fetch', '--depth', '1', 'origin', ref], work);
run('git', ['checkout', '--force', '--detach', 'FETCH_HEAD'], work);

// 2. 只改一处：把 apiOrigin 变成可注入的构建参数。
const configPath = path.join(work, 'rspack.config.ts');
const config = fs.readFileSync(configPath, 'utf8');
const anchor = 'export default defineConfig(createConfig())';
const patched = 'export default defineConfig(createConfig({ apiOrigin: process.env.CHAT_DEMO_API_ORIGIN }))';
if (config.includes(anchor)) {
  fs.writeFileSync(configPath, config.replace(anchor, patched));
  process.stderr.write('patched rspack config: apiOrigin from env\n');
} else if (!config.includes('CHAT_DEMO_API_ORIGIN')) {
  throw new Error('rspack.config.ts 的默认导出行找不到，请检查上游是否改了构建配置');
}

// 2b. 品牌位：上游把应用名写成「API 使用 demo」，在面板里读起来像一份样例。
//     只替换 i18n 里的两个 appName 值，锚点找不到就显式失败，避免静默沿用旧名。
const brandPatches = [
  ['src/i18n/zh.ts', "appName: 'API 使用 demo'", "appName: 'DeepSeek Chat'"],
  ['src/i18n/en.ts', "appName: 'API usage demo'", "appName: 'DeepSeek Chat'"],
];
for (const [file, from, to] of brandPatches) {
  const target = path.join(work, file);
  const text = fs.readFileSync(target, 'utf8');
  if (text.includes(from)) {
    fs.writeFileSync(target, text.replace(from, to));
    process.stderr.write(`patched ${file}: appName\n`);
  } else if (!text.includes(to)) {
    throw new Error(`${file} 的 appName 锚点变了，请检查上游 i18n 结构`);
  }
}

// 3. 安装与构建。
run('pnpm', ['install', '--ignore-scripts'], work);
run('pnpm', ['build'], work, { CHAT_DEMO_API_ORIGIN: API_PREFIX, NODE_ENV: 'production' });

// 4. 产物替换：整目录替换，避免旧 chunk 残留。
const built = path.join(work, 'dist');
if (!fs.existsSync(path.join(built, 'index.html'))) {
  throw new Error('构建完成但没有 dist/index.html');
}
fs.rmSync(distTarget, { recursive: true, force: true });
fs.mkdirSync(path.dirname(distTarget), { recursive: true });
fs.cpSync(built, distTarget, { recursive: true });

// 5. 记录来源，方便日后核对产物出自哪次构建。
fs.writeFileSync(
  path.join(pluginDir, 'webview', 'UPSTREAM.json'),
  `${JSON.stringify({ repo: REPO, ref, apiOrigin: API_PREFIX, builtAt: new Date().toISOString() }, null, 2)}\n`,
);

const bytes = fs
  .readdirSync(distTarget, { recursive: true })
  .map((entry) => path.join(distTarget, entry))
  .filter((file) => fs.statSync(file).isFile())
  .reduce((total, file) => total + fs.statSync(file).size, 0);
process.stderr.write(`dist ready: ${(bytes / 1024 / 1024).toFixed(1)} MB\n`);
