/**
 * DeepSeek 上游凭据解析。
 *
 * 顺序与 `dsh-vt-quick-chat` 保持一致：先账号授权，再 API Key。
 * 账号授权不需要用户另存密钥，退出登录后自动落到 API Key。
 *
 * 这里的 token 只在 Host 半边使用，绝不下发到浏览器。
 */
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

/** 账号授权 token 的请求头；由 `dsh-llm-deepseek-account` 定义。 */
const ACCOUNT_TOKEN_HEADER = 'x-dsh-auth-token';

/** API Key 的凭据名；与 DSH 模型设置里的默认引用一致。 */
const API_KEY_REF = 'DEEPSEEK_API_KEY';

/**
 * 解析一次上游请求要用的凭据。
 * @param ctx - Host 插件上下文。
 * @param baseURL - 推理源根地址，用于账号 token 的归属校验。
 * @returns `{ via, headers }`；没有可用凭据时返回 undefined。
 */
export async function resolveAuth(ctx, baseURL = DEEPSEEK_BASE_URL) {
  const account = safeGet(ctx, 'deepseekAccount');
  if (account !== undefined && typeof account.resolveToken === 'function') {
    try {
      // resolveToken 校验目标地址是否属于推理源；传真实请求地址，语义最直接。
      const token = await account.resolveToken(`${baseURL}/anthropic/v1/messages`);
      if (typeof token === 'string' && token.length > 0) {
        return { via: 'account', headers: { [ACCOUNT_TOKEN_HEADER]: token } };
      }
    } catch {
      // 未登录、授权失效或地址不被允许：继续尝试 API Key。
    }
  }
  const credentials = safeGet(ctx, 'credentials');
  if (credentials !== undefined && typeof credentials.resolve === 'function') {
    try {
      const hit = await credentials.resolve(API_KEY_REF);
      const value = hit?.value;
      if (typeof value === 'string' && value.length > 0) {
        return { via: 'api-key', headers: { 'x-api-key': value, authorization: `Bearer ${value}` } };
      }
    } catch {
      // 凭证服务不可用：交给调用方给 401。
    }
  }
  return undefined;
}

/**
 * 取可选服务；缺服务只是少一条路，不是错误。
 * @param ctx - Host 插件上下文。
 * @param name - 服务名。
 * @returns 服务实例或 undefined。
 */
export function safeGet(ctx, name) {
  try {
    return ctx.get(name);
  } catch {
    return undefined;
  }
}

export { DEEPSEEK_BASE_URL, ACCOUNT_TOKEN_HEADER };
