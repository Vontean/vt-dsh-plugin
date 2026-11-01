/**
 * dsh-vt-mine-models — Host 半侧。
 *
 * 本插件是纯客户端界面插件：它只替换输入框里的模型选择控件，通过浏览器侧
 * 的 slot（`conversation.input.model`）注册自己的组件。模型目录、选择提交、
 * 持久化仍然全部走 DSH 自己的 `modelDirectories` 服务，因此 Host 侧不需要
 * 任何路由、文件读写或网络访问。
 *
 * 保留一个空的 apply 是为了让 Loader 能加载本包（Host 侧 fiber 存在），
 * 浏览器 bundle 由 package.json 的 `dsh.client` 声明被发现。
 */

/** 插件标识（与 package.json 的 name、cordis.patch.yml 的 name 一致）。 */
export const name = 'dsh-vt-mine-models';

/** Host 半侧没有行为；界面全部在 client.js 里。 */
export function apply() {}
