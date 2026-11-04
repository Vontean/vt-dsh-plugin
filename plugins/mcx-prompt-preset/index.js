/**
 * dsh-mcx-prompt-preset — Host 半侧。
 *
 * ── 它解决什么问题 ───────────────────────────────────────────────────────────
 * MineCodex（MCX）把常用提示词存在本机 SQLite 里，并在 Codex 输入框旁放一个
 * 提示词按钮。本插件把同一份数据接进 DSH：输入框旁的按钮弹出提示词浮层，
 * 侧边栏提供完整的提示词库页面。
 *
 * ── 数据从哪来 ───────────────────────────────────────────────────────────────
 * 直接读写 MCX 自己的库文件（默认 macOS 的
 * `~/Library/Application Support/CodexNotes/codex-notes.sqlite`，可用环境变量
 * `MCX_PROMPT_DB` 覆盖），因此 MCX 未运行也能浏览与编辑。写入沿用 MCX 的
 * 事务语义：`BEGIN IMMEDIATE` + `metadata.revision` 自增，两边看到的修订号
 * 始终一致；`busy_timeout` 保证与 MCX 服务并发写入时不互相报错。
 *
 * ── 安全边界 ─────────────────────────────────────────────────────────────────
 * 只碰 `prompts` / `prompt_categories` / `metadata` 三张表，不读写历史
 * `todos` / `files`；库文件不存在时不创建、不建表，只回报「不可用」。
 */

import { access, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import promptIcons from './assets/prompt-icons.json' with { type: 'json' };

/** 插件标识（与 package.json 的 name 一致）。 */
export const name = 'dsh-mcx-prompt-preset';

/** webServer 是硬依赖：路由挂在它的 prefix 上。 */
export const inject = ['webServer'];

/** 路由前缀，客户端拼 `mcx-prompt-preset/api/<method>`。 */
const ROUTE_PREFIX = '/mcx-prompt-preset/api';

/** 请求体上限：提示词正文可能很长，但仍是本机 UI 的输入。 */
const MAX_BODY_BYTES = 512 * 1024;

/** MCX 允许的分类图标名，与它自己的白名单同源。 */
const CATEGORY_ICONS = new Set(Object.keys(promptIcons));

/** MCX 允许的分类颜色名。 */
const CATEGORY_COLORS = new Set([
  'black',
  'blue',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'yellow',
]);

/** 更新提示词时允许出现的字段。 */
const PROMPT_CHANGE_FIELDS = new Set(['title', 'body', 'categoryId', 'emoji', 'sortOrder']);

/** 带 HTTP 语义的错误。 */
class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.apiCode = code;
    this.status = status;
  }
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

/** 有界读取 JSON 请求体。 */
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new ApiError('body-too-large', '请求体超过上限。', 413);
    chunks.push(chunk);
  }
  if (total === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new ApiError('bad-json', '请求体不是合法 JSON。');
  }
}

/**
 * 定位 MCX 的提示词库文件。
 * @returns 绝对路径。
 */
function databasePath() {
  const override = process.env.MCX_PROMPT_DB;
  if (typeof override === 'string' && override.trim() !== '') return path.resolve(override.trim());
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'CodexNotes', 'codex-notes.sqlite');
  }
  return path.join(os.homedir(), 'Library', 'Application Support', 'CodexNotes', 'codex-notes.sqlite');
}

/**
 * 打开（并缓存）SQLite 连接。
 *
 * 用动态 import：`node:sqlite` 在个别运行时不带该模块，此时插件仍应加载成功
 * 并给出可读的「不可用」，而不是整个 Host 半侧崩掉。
 */
class PromptStore {
  constructor(file) {
    this.file = file;
    this.db = null;
    this.loading = null;
  }

  async #open() {
    try {
      await access(this.file);
    } catch {
      throw new ApiError('no-database', `本机没有找到 MineCodex 提示词库：${this.file}`, 404);
    }
    let DatabaseSync;
    try {
      ({ DatabaseSync } = await import('node:sqlite'));
    } catch {
      throw new ApiError('no-sqlite', '当前运行时缺少 node:sqlite，无法读取提示词库。', 501);
    }
    const db = new DatabaseSync(this.file);
    try {
      db.exec('PRAGMA busy_timeout = 3000; PRAGMA foreign_keys = ON;');
      const hasPrompts = db
        .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'prompts'")
        .get();
      if (hasPrompts === undefined) {
        db.close();
        throw new ApiError('no-schema', '该库文件里还没有提示词表，请先在 MineCodex 中使用一次提示词功能。', 409);
      }
    } catch (error) {
      try {
        db.close();
      } catch {
        /* 关闭失败不覆盖原始错误 */
      }
      throw error;
    }
    return db;
  }

  /** @returns 已打开的连接。 */
  async connection() {
    if (this.db !== null) return this.db;
    if (this.loading === null) {
      this.loading = this.#open().then(
        (db) => {
          this.db = db;
          this.loading = null;
          return db;
        },
        (error) => {
          this.loading = null;
          throw error;
        },
      );
    }
    return this.loading;
  }

  close() {
    try {
      this.db?.close();
    } catch {
      /* 关闭失败无需上报 */
    }
    this.db = null;
  }
}

/** 分类图标/颜色是否合法。 */
function assertCategoryShape({ name, icon, color }) {
  if (typeof name !== 'string' || name.trim() === '' || name.length > 60) {
    throw new ApiError('invalid-category', '分类名称不能为空，且不能超过 60 个字符。');
  }
  if (typeof icon !== 'string' || !CATEGORY_ICONS.has(icon)) {
    throw new ApiError('invalid-category', '分类图标无效。');
  }
  if (typeof color !== 'string' || !CATEGORY_COLORS.has(color)) {
    throw new ApiError('invalid-category', '分类颜色无效。');
  }
}

/** 单个 Emoji 判定，与 MCX 的粒度一致（字素 + 表情属性）。 */
function assertEmoji(emoji) {
  if (typeof emoji !== 'string') throw new ApiError('invalid-emoji', 'Emoji 必须是字符串。');
  if (emoji === '') return;
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(emoji)];
  if (graphemes.length !== 1 || !/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(emoji)) {
    throw new ApiError('invalid-emoji', '请只选择一个 Emoji，或留空。');
  }
}

/** 列表里使用的摘要：优先标题，否则第一行非空正文。 */
function summaryOf(title, body) {
  if (title.trim() !== '') return title.trim();
  let start = 0;
  while (start <= body.length) {
    const newline = body.indexOf('\n', start);
    const end = newline === -1 ? body.length : newline;
    const line = body.slice(start, end).replace(/\r$/, '').trim();
    if (line !== '') return line;
    if (newline === -1) break;
    start = newline + 1;
  }
  return 'Untitled prompt';
}

/** 数据库行 → 前端使用的结构。 */
function mapPrompt(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    summary: summaryOf(row.title, row.body),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryId: row.category_id ?? null,
    emoji: row.emoji ?? '',
    sortOrder: row.sort_order ?? 0,
    useCount: row.use_count ?? 0,
    calledAt: row.called_at ?? null,
  };
}

/**
 * 建一个只绑定单库文件的操作句柄。
 * @param store - 连接持有者。
 */
function methods(store) {
  /** 在一个写事务里执行，并自增修订号。 */
  async function mutate(operation) {
    const db = await store.connection();
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = operation(db);
      db.prepare("UPDATE metadata SET value = value + 1 WHERE key = 'revision'").run();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* 回滚失败时保留原始错误 */
      }
      throw error;
    }
  }

  function revision(db) {
    const row = db.prepare("SELECT value FROM metadata WHERE key = 'revision'").get();
    return row?.value ?? 0;
  }

  function categories(db) {
    return db
      .prepare(
        'SELECT id, name, icon, color, sort_order AS sortOrder FROM prompt_categories ORDER BY sort_order, id',
      )
      .all()
      .map((row) => ({ ...row }));
  }

  function categoryExists(db, id) {
    return id !== null && db.prepare('SELECT 1 FROM prompt_categories WHERE id = ?').get(id) !== undefined;
  }

  function nextSortOrder(db) {
    return db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM prompts').get().next;
  }

  return {
    /** 全量状态：提示词、分类、修订号与库位置。 */
    async state() {
      const db = await store.connection();
      const prompts = db
        .prepare('SELECT * FROM prompts ORDER BY sort_order, created_at DESC, id')
        .all()
        .map(mapPrompt);
      return {
        available: true,
        databasePath: store.file,
        revision: revision(db),
        prompts,
        categories: categories(db),
      };
    },

    /** 分类图标资源：26 个 Phosphor 图标，只取一次。 */
    assets() {
      return { icons: promptIcons };
    },

    /** 供 UI 展示「库不可用」的原因，不抛错。 */
    async probe() {
      try {
        const state = await this.state();
        return { available: true, databasePath: state.databasePath, revision: state.revision };
      } catch (error) {
        return {
          available: false,
          databasePath: store.file,
          reason: error instanceof ApiError ? error.apiCode : 'unknown',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },

    /** 新建提示词。 */
    async createPrompt(input) {
      const body = input.body;
      if (typeof body !== 'string' || body.trim() === '') {
        throw new ApiError('empty-body', '提示词正文不能为空。');
      }
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const categoryId = input.categoryId ?? null;
      if (categoryId !== null && typeof categoryId !== 'string') {
        throw new ApiError('invalid-category', '分类无效。');
      }
      const emoji = input.emoji ?? '';
      assertEmoji(emoji);
      const now = Date.now();
      const id = randomUUID();
      await mutate((db) => {
        if (categoryId !== null && !categoryExists(db, categoryId)) {
          throw new ApiError('invalid-category', '未找到该分类。');
        }
        db.prepare(
          `INSERT INTO prompts (id, title, body, starred, created_at, updated_at, last_used_at, category_id, emoji, sort_order)
           VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
        ).run(id, title, body, now, now, now, categoryId, emoji, nextSortOrder(db));
      });
      return { id };
    },

    /** 更新提示词；只接受 MCX 支持的字段。 */
    async updatePrompt(input) {
      const id = input.id;
      if (typeof id !== 'string' || id === '') throw new ApiError('invalid-id', '缺少提示词 id。');
      const changes = input.changes;
      if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) {
        throw new ApiError('invalid-changes', 'changes 必须是对象。');
      }
      const fields = Object.keys(changes);
      if (fields.length === 0 || fields.some((field) => !PROMPT_CHANGE_FIELDS.has(field))) {
        throw new ApiError('invalid-changes', 'changes 里有不支持的字段。');
      }
      if (Object.hasOwn(changes, 'title') && typeof changes.title !== 'string') {
        throw new ApiError('invalid-title', '标题必须是字符串。');
      }
      if (Object.hasOwn(changes, 'body') && (typeof changes.body !== 'string' || changes.body.trim() === '')) {
        throw new ApiError('empty-body', '提示词正文不能为空。');
      }
      if (Object.hasOwn(changes, 'emoji')) assertEmoji(changes.emoji);
      await mutate((db) => {
        const current = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
        if (current === undefined) throw new ApiError('not-found', '未找到该提示词。', 404);
        const categoryId = Object.hasOwn(changes, 'categoryId') ? changes.categoryId : (current.category_id ?? null);
        if (categoryId !== null && (typeof categoryId !== 'string' || !categoryExists(db, categoryId))) {
          throw new ApiError('invalid-category', '未找到该分类。');
        }
        const sortOrder = Object.hasOwn(changes, 'sortOrder') ? changes.sortOrder : current.sort_order;
        if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
          throw new ApiError('invalid-order', '排序号无效。');
        }
        db.prepare(
          'UPDATE prompts SET title = ?, body = ?, updated_at = ?, category_id = ?, emoji = ?, sort_order = ? WHERE id = ?',
        ).run(
          Object.hasOwn(changes, 'title') ? changes.title.trim() : current.title,
          Object.hasOwn(changes, 'body') ? changes.body : current.body,
          Date.now(),
          categoryId,
          Object.hasOwn(changes, 'emoji') ? changes.emoji : current.emoji,
          sortOrder,
          id,
        );
      });
      return { id };
    },

    /** 删除提示词。 */
    async deletePrompt(input) {
      const id = input.id;
      if (typeof id !== 'string' || id === '') throw new ApiError('invalid-id', '缺少提示词 id。');
      await mutate((db) => {
        const result = db.prepare('DELETE FROM prompts WHERE id = ?').run(id);
        if (result.changes === 0) throw new ApiError('not-found', '未找到该提示词。', 404);
      });
      return { id };
    },

    /** 记录一次成功使用：insert 才计调用次数，copy 只更新最近使用时间。 */
    async markUsed(input) {
      const id = input.id;
      const action = input.action;
      if (typeof id !== 'string' || id === '') throw new ApiError('invalid-id', '缺少提示词 id。');
      if (action !== 'insert' && action !== 'copy') {
        throw new ApiError('invalid-use', '只接受 insert 或 copy。');
      }
      const now = Date.now();
      await mutate((db) => {
        const result = db
          .prepare(
            'UPDATE prompts SET last_used_at = ?, use_count = use_count + ?, called_at = CASE WHEN ? THEN ? ELSE called_at END WHERE id = ?',
          )
          .run(now, Number(action === 'insert'), Number(action === 'insert'), now, id);
        if (result.changes === 0) throw new ApiError('not-found', '未找到该提示词。', 404);
      });
      return { id };
    },

    /** 新建或更新分类。 */
    async saveCategory(input) {
      const id = typeof input.id === 'string' && input.id !== '' ? input.id : null;
      const name = input.name;
      const icon = input.icon ?? 'book';
      const color = input.color ?? 'black';
      assertCategoryShape({ name, icon, color });
      const categoryId = id ?? randomUUID();
      await mutate((db) => {
        const current = id === null ? undefined : db.prepare('SELECT * FROM prompt_categories WHERE id = ?').get(id);
        if (id !== null && current === undefined) throw new ApiError('not-found', '未找到该分类。', 404);
        const sortOrder = input.sortOrder ?? current?.sort_order ?? categories(db).length;
        if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
          throw new ApiError('invalid-order', '排序号无效。');
        }
        db.prepare(
          `INSERT INTO prompt_categories (id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, color = excluded.color, sort_order = excluded.sort_order`,
        ).run(categoryId, name.trim(), icon, color, sortOrder);
      });
      return { id: categoryId };
    },

    /** 删除分类；其下提示词按 MCX 的外键语义变为未分类。 */
    async deleteCategory(input) {
      const id = input.id;
      if (typeof id !== 'string' || id === '') throw new ApiError('invalid-id', '缺少分类 id。');
      await mutate((db) => {
        db.prepare('DELETE FROM prompt_categories WHERE id = ?').run(id);
      });
      return { id };
    },

    /** 重排：分类内提示词，或分类本身。 */
    async reorder(input) {
      const { ids, categoryId = null, categories: reorderCategories = false } = input;
      if (typeof reorderCategories !== 'boolean') throw new ApiError('invalid-order', 'categories 必须是布尔值。');
      if (categoryId !== null && typeof categoryId !== 'string') {
        throw new ApiError('invalid-order', '分类无效。');
      }
      if (
        !Array.isArray(ids) ||
        ids.some((id) => typeof id !== 'string') ||
        new Set(ids).size !== ids.length
      ) {
        throw new ApiError('invalid-order', '排序列表无效。');
      }
      await mutate((db) => {
        const expected = reorderCategories
          ? categories(db).map((item) => item.id)
          : db.prepare('SELECT id FROM prompts WHERE category_id IS ?').all(categoryId).map((row) => row.id);
        if (expected.length !== ids.length || expected.some((id) => !ids.includes(id))) {
          throw new ApiError('stale-order', '条目已变化，请刷新后重试。', 409);
        }
        const statement = db.prepare(
          `UPDATE ${reorderCategories ? 'prompt_categories' : 'prompts'} SET sort_order = ? WHERE id = ?`,
        );
        ids.forEach((id, index) => statement.run(index, id));
      });
      return { ids };
    },
  };
}

/**
 * 路由入口：只接受 POST，读操作也走 POST，避免被浏览器预取。
 */
async function handle(req, res, api, admitted) {
  if (!admitted(req)) {
    writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: '当前连接无权访问本机插件路由。' } });
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' });
    res.end();
    return;
  }
  const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname;
  const method = pathname.startsWith(`${ROUTE_PREFIX}/`) ? pathname.slice(ROUTE_PREFIX.length + 1) : '';
  const handler = method !== '' && Object.hasOwn(api, method) ? api[method] : undefined;
  if (handler === undefined) {
    writeJson(res, 404, { ok: false, error: { code: 'not-found', message: `未知方法：${method}` } });
    return;
  }
  try {
    const value = await handler(await readJsonBody(req));
    writeJson(res, 200, { ok: true, value });
  } catch (error) {
    writeJson(res, error instanceof ApiError ? error.status : 500, {
      ok: false,
      error: {
        code: error instanceof ApiError ? error.apiCode : 'internal',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/**
 * @param ctx Host 插件上下文。
 */
export function apply(ctx) {
  const store = new PromptStore(databasePath());
  const api = methods(store);

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => {
          const connection = ctx.get('connection');
          const admitted = (request) =>
            connection === undefined || connection === null
              ? true
              : connection.requestRejection(request) === undefined;
          return handle(req, res, api, admitted);
        },
      }),
    'mcx-prompt-preset: prompt library route',
  );

  ctx.effect(
    () => () => store.close(),
    'mcx-prompt-preset: close database',
  );
}
