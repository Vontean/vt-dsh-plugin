# 插话立即生效（dsh-vt-steer-now）

插入消息（steer）按要求会在「下一个 step 边界」生效。当当前 step 正在跑一个慢工具时，
这条消息就得等工具返回，模型才会看到它。本插件在待生效的插入气泡下方提供一个
**「立即发送」**：点击即中断当前工具，把这条消息提到下一次模型请求的第 1 步。

## 它改了什么

- **只在需要时出现**：仅当「回合运行中」且「有插入消息待生效」时，才在那条待生效
  气泡的操作行里显示「立即发送」。没有待生效消息时不出现，不干扰阅读。
- **点击后**：Host 先把消息移出队列，再中断当前回合，然后重新投递同一条消息
  （保留附件与消息身份）。回合收尾后立即开新回合，消息在第 1 步被读到。
- **代价是可见的**：正在跑的工具会被中断，聊天流里会出现一条中断记录；如果当时正在
  流式输出，已生成的部分会被截断。按钮的悬浮提示写明了这一点。
- **不改输入框、不加面板、不动聊天流的 React 结构**：按钮是 body 下的浮层，按气泡
  矩形定位，所以不会影响原有布局。

## 安装

插件装进某个 profile 后**必须重启 dsh**，刷新页面不生效。

### 插件市场（推荐，有更新提示）

在「插件 → 发现 → 添加索引源」里填入市场索引地址：

```
https://vontean.github.io/vt-dsh-plugin/index.json
```

第一次使用要先在插件页开启 **Custom plugin markets**。添加后搜索「插话立即生效」安装。

### npm

```bash
dsh plugin --profile <profile> add dsh-vt-steer-now@1.0.2
```

npm 通道要等该版本真的发布到 npm 之后可用（用 `npm view dsh-vt-steer-now@1.0.2` 能查到即可）。

### Release tarball

到 [Releases](https://github.com/Vontean/vt-dsh-plugin/releases) 下载
`dsh-vt-steer-now-1.0.2.tgz`，然后：

```bash
dsh plugin --profile <profile> add /绝对路径/dsh-vt-steer-now-1.0.0.tgz
```

## 支持的 DSH 版本

`engines.dsh` 为 `>=0.2.1-rc.5 <0.3.0`。超出范围时 DSH 会在加载前拒绝该插件，
不会带着不兼容的代码跑起来。插件依赖 DSH 的三处实现细节（`inbox` 的两个待处理列表、
`cancel(keepInbox)`、工具行的 `data-tool` / `data-state` 标记），大版本升级后通常需要跟进。

## 安全边界

- 插件代码在**用户进程内**运行，没有沙箱，也没有额外的权限边界。
- Host 半侧只注册一个同源路由 `/vt-steer-now/api/preempt`：每个请求都过
  `connection.requestRejection`（与内置 /api 同一套 Host/Origin 与鉴权判定），
  只接受 `sessionId` 与 `itemId` 两个字符串，不读写文件、不发起外部请求。
- Client 半侧不注入脚本到页面，只按选择器定位气泡与工具行、发一个同源 POST。
- 本插件不上传遥测、不写系统文件。

## 开发

- 设计说明：[DESIGN.md](./DESIGN.md)（机制、取舍、验证计划）
- 目录约定：[../../docs/plugin-conventions.md](../../docs/plugin-conventions.md)
