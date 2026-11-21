/**
 * Host half of dsh-vt-web-chat.
 *
 * 只做两件事：在 `/webchat` 下托管官方 chat-demo 的前端产物，并替浏览器把请求转给
 * DeepSeek——浏览器不持有凭据，用户也不需要再登录一次。
 *
 * 网页版与 DSH 会话互不干涉：前端的会话存在自己的 IndexedDB 里，它不会进 DSH 的会话
 * 列表，DSH 的会话也不会出现在它里面。两边系统提示词与工具不同，混合只会让双方都失真。
 */
import { createHandler, ROUTE_PREFIX } from './src/route.js';

/** webServer 是硬依赖；账号与凭证服务在请求时软取，缺失只会退化成 401 提示。 */
export const inject = ['webServer'];

/**
 * 注册插件路由。
 * @param ctx - Host 插件上下文。
 */
export function apply(ctx) {
  const handle = createHandler(ctx);
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        // 处理器是异步的；异常必须在这里收住，否则会变成一个没有响应的请求。
        handler: (req, res) => {
          handle(req, res).catch((error) => {
            console.error('[dsh-vt-web-chat] request failed', error);
            if (!res.headersSent) {
              res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            } else if (!res.writableEnded) {
              res.destroy();
            }
          });
        },
      }),
    'vt-web-chat: /webchat route',
  );
}
