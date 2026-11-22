/**
 * webview/dist 的构建契约测试。
 *
 * 侧栏接管依赖两处上游补丁：宿主桥（列会话 / 打开会话 / 新建对话）和
 * 嵌入时隐藏面板自带的收起态按钮岛。补丁写在 scripts/sync-upstream.mjs 里，
 * 重建时如果锚点失配会显式失败；这里再从产物侧兜一道，避免有人手工替换 dist。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const pluginDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(pluginDir, 'webview', 'dist');

/**
 * 读取入口脚本的源码。
 * @returns 入口 JS 文本。
 */
async function entrySource() {
  const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  const match = /<script[^>]+src="([^"]+\.js)"/iu.exec(html);
  assert.ok(match, 'index.html 应该引用一个入口脚本');
  const file = match[1].replace(/^\/+/u, '');
  return fs.readFile(path.join(distDir, file), 'utf8');
}

test('webview build 带上宿主桥', async () => {
  const code = await entrySource();
  assert.match(
    code,
    /vt-webchat-host/u,
    '缺少宿主桥：重新运行 node scripts/sync-upstream.mjs',
  );
});

test('webview build 在嵌入时隐藏收起态按钮岛', async () => {
  const code = await entrySource();
  const guarded =
    /window\.parent\s*===\s*window/u.test(code) || /window\s*===\s*window\.parent/u.test(code);
  assert.ok(
    guarded,
    '缺少嵌入判断：收起态按钮岛会和 DSH 侧栏重复，重新运行 node scripts/sync-upstream.mjs',
  );
});
