# dsh-vt-quote-bar · 模型额度

在 DeepSeek Harness 左侧边栏的账号行上方显示模型额度、余额：默认是一行原生风格的额度环，
点开是完整的额度面板。一次性看清「还能用多少」，不用切页面去查。

## 它改了什么

侧边栏 footer 多出一行，位置在 Cordis 插件行与账号/设置行之间：

- **默认行**：44px，左侧 24px 单圈额度环 + 右侧 provider 名称。字号、颜色、圆角与侧边栏账号行一致，
  圆环与 24px 账号头像同外径。
- **点开后**：以高度 + 淡入动效展开额度面板：
  - **DeepSeek 账号 / DeepSeek API Key**：一行文本余额，左侧 `余额` 用主文字色，右侧金额用次文字色。
  - **opencode-go**：三条额度条，分别是 `5 小时`、`本周`、`本月`，显示剩余百分比和重置时间。
  - 顶部可切换 provider；左侧 close 图标返回默认行。
- **圆环读数**：显示当前 provider 的**最低剩余**——opencode-go 取三个窗口里剩余最小的那个；
  DeepSeek 余额没有百分比，圆环内显示货币符号。
- 圆环与额度条统一使用中性灰（轨道 2px / 进度 `label-tertiary`），不使用红绿状态色。
- 选择记在浏览器本地；页面可见时每 60 秒刷新一次；点刷新按钮会绕过 Host 缓存立即更新。
- 侧边栏收起时不渲染，也不轮询。关闭插件后侧边栏完全还原。

## 数据来源

| provider | 来源 |
|---|---|
| `deepseek-account` | Host 的 `ctx.deepseekAccount.getBalance()`（充值钱包 + 赠金钱包） |
| `deepseek-official` | `GET https://api.deepseek.com/user/balance`，Bearer 认证 |
| `opencode-go` | `GET https://opencode.ai/zen/go/v1/usage`，Bearer 认证 |

OpenCode Go 的 usage 接口只返回三个窗口的**已用百分比**和重置时间，不返回美元额度，
所以这里显示「剩余百分比」，不是金额。

## 安装

插件装进某个 profile 后**必须重启 dsh**，刷新页面不生效。

### 插件市场（推荐，有更新提示）

在「插件 → 发现 → 添加索引源」里填入：

```
https://vontean.github.io/vt-dsh-plugin/index.json
```

第一次使用要先在插件页开启 **Custom plugin markets**。添加后按「用量与额度」分类找到本插件，点安装。

### npm

```bash
dsh plugin --profile <profile> add dsh-vt-quote-bar@1.0.1
```

### Release tarball

到 [Releases](https://github.com/Vontean/vt-dsh-plugin/releases) 下载
`dsh-vt-quote-bar-1.0.1.tgz`，然后：

```bash
dsh plugin --profile <profile> add /绝对路径/dsh-vt-quote-bar-1.0.1.tgz
```

## 支持的 DSH 版本

`package.json` 的 `engines.dsh` 为 `>=0.2.1-rc.5 <0.3.0`。超出范围时 DSH 会在加载前
拒绝该插件，不会带着不兼容的代码跑起来；DSH 大版本升级后等本插件发新版本再启用。

## 安全边界

- **插件代码在用户进程内运行，没有沙箱**，也没有额外权限边界。只安装你信任的来源。
- API Key **只在 Host 内解析和使用**，浏览器只收到余额或百分比，响应体里不出现 Key、
  请求头或上游原始内容。
- 上游地址是代码里的固定 HTTPS 常量，请求体不接受任意 URL，因此不能把密钥送到别处。
- 每个插件 API 请求都过 `ctx.connection.requestRejection()`，与 `/api` 同一套浏览器鉴权。
- 响应体与上游响应各有 64 KiB 上限；Host 不记录 Key，也不记录上游原始响应。
- 不上传遥测、不写系统文件；选中的 provider 只存在浏览器 localStorage。

## 工作方式

```
Client (sidebar.footer.action)
  ├─ POST vt-quote-bar/api/providers → provider 列表 + 默认 provider
  └─ POST vt-quote-bar/api/quota     → 余额/额度（Host 60s 缓存）
```

Host 半侧（`index.js`）注册 `/vt-quote-bar/api` 前缀路由；Client 半侧（`client.js`）
在 `sidebar.footer.action` 注册组件，两边的 base 路径必须同时改、拼得上。

## 限制

- 只适配上述三个 provider；其他 provider 不出现在切换器。
- 不做美元估算、推送/SSE、额度历史曲线。
- 不做设置页，也不修改账号菜单或 DSH 核心代码。

## 开发

- 包名、bundle patch id、客户端模块 id、`VERSION`、`market.json` 字段的硬约定见
  仓库根 [`docs/plugin-conventions.md`](../../docs/plugin-conventions.md)。
- 纯函数归一化逻辑在 `lib/normalize.js`，测试在 `test/`，离线可跑：

  ```bash
  node --test
  node --check index.js && node --check client.js
  ```

- 客户端半边必须是单个文件（装载器拼装下发），不要拆成多文件。

## 许可

MIT，见 [LICENSE](./LICENSE)。
