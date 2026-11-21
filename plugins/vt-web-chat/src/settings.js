/**
 * 插件的本地设置：目前只有「会话保留天数」。
 *
 * 落在 `$DSH_HOME/vt-web-chat/settings.json`，与 `dsh-vt-quick-chat` 的存放口径一致：
 * 一个插件一个小目录，坏了删掉即可回到默认值，不碰 DSH 自己的配置。
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** 可选的保留档位（天）；0 表示永不清理。 */
const RETENTION_CHOICES = Object.freeze([30, 60, 90, 0]);

/** 默认保留 30 天。 */
const DEFAULT_RETENTION_DAYS = 30;

/** 设置文件所在目录。 */
function settingsDir() {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
  return path.join(home, 'vt-web-chat');
}

/** 设置文件路径；允许用环境变量整体覆盖，便于开发与测试。 */
export function settingsFile() {
  return process.env.VT_WEB_CHAT_SETTINGS ?? path.join(settingsDir(), 'settings.json');
}

/** 默认设置。 */
export function defaultSettings() {
  return { retentionDays: DEFAULT_RETENTION_DAYS };
}

/**
 * 把任意输入收敛成合法设置。
 * @param value - 读盘或请求体里的原始值。
 * @returns 合法设置；非法字段回落到默认值。
 */
export function normalizeSettings(value) {
  const base = defaultSettings();
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return base;
  const days = value.retentionDays;
  if (typeof days === 'number' && RETENTION_CHOICES.includes(days)) {
    base.retentionDays = days;
  }
  return base;
}

/**
 * 读取设置。
 * @returns 设置对象；文件缺失或损坏时给默认值，不抛错。
 */
export async function readSettings() {
  try {
    const raw = await fs.readFile(settingsFile(), 'utf8');
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

/**
 * 写入设置。
 * @param value - 待保存的设置（会先 normalize）。
 * @returns 落盘后的设置。
 */
export async function writeSettings(value) {
  const settings = normalizeSettings(value);
  const file = settingsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return settings;
}

export { RETENTION_CHOICES, DEFAULT_RETENTION_DAYS };
