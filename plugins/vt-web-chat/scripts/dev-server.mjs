#!/usr/bin/env node
/**
 * 开发用本地服务器：把插件的 `/webchat` 路由单独跑起来，用来验证
 * 「静态产物 + 上游代理 + 保留策略」这条链路，不必重启 DSH。
 *
 * 它不模拟 DSH 的准入校验（没有 Connection 服务时自动放行），
 * 所以只在开发机上用，不要对外暴露。
 *
 * 用法：
 *   DEEPSEEK_API_KEY=sk-... node scripts/dev-server.mjs [端口]
 *   也可用 VT_WEB_CHAT_SETTINGS 指向一个临时设置文件。
 */
import http from 'node:http';
import { createHandler } from '../src/route.js';

const port = Number(process.argv[2] ?? 8799);

const apiKey = process.env.DEEPSEEK_API_KEY ?? '';
// VT_WEB_CHAT_REJECT=403 时，模拟桌面壳里被 Host/Origin 栅栏拒绝的场景。
const rejectStatus = Number(process.env.VT_WEB_CHAT_REJECT ?? 0);
const ctx = {
  get(name) {
    if (name === 'credentials') {
      return {
        async resolve() {
          return apiKey.length > 0 ? { value: apiKey } : undefined;
        },
      };
    }
    if (name === 'connection' && rejectStatus > 0) {
      return { requestRejection: () => rejectStatus };
    }
    return undefined;
  },
};

const handle = createHandler(ctx);
const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error('[dev] request failed', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: String(error?.message ?? error) }));
    } else if (!res.writableEnded) {
      res.destroy();
    }
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`web chat dev server: http://127.0.0.1:${port}/webchat/`);
  console.log(`credential: ${apiKey.length > 0 ? 'DEEPSEEK_API_KEY' : 'none (proxy will answer 401)'}`);
  console.log(`self-test:  http://127.0.0.1:${port}/webchat/api/self-test`);
});
