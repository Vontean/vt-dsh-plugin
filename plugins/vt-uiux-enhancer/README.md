# dsh-vt-uiux-enhancer · VT UI/UX 增强

DeepSeek Harness 的界面改善插件：把外观调成**一张干净的白纸**。
默认只改看得见的样式；越界的只有三处**可逆的交互处理**（低频入口收进状态行、超长用户消息折叠成 20 行、
流式回答不再甩走阅读位置），都不新增持久状态，关闭插件后 Harness 精确回到出厂外观。

## 它改了什么

- **配色**：纯白画布、中性浅色填充、暖灰文字、暖白侧栏；填充档不带暖，避免"脏灰"。
- **层级**：浮起面用"有方向的阴影 + 可辨细边"，不用均匀灰雾。
- **控件形状**：同类控件同一尺寸与形状；图标按钮统一 28px 正圆，并同时写 `corner-shape`。
- **排版**：中文控件字重比同排拉丁文字低一档，一行里只有一套字重体系。
- **动效**：动画只表达"状态正在变"；轮次跳转条静止为短刻度、靠近指针才长出来。
- **输入框**：原生 `title` tooltip 换成自绘气泡，沿用应用自己的 tooltip token。
- **空间回收**：视图切换标签行收进状态行，header 从 76px 收到 51px；入口双向保留。
- **长消息折叠**：用户自己的消息超过 20 行时，显示 19 行正文 + 一行「…」，气泡内底部出现
  「展开／收起」+ 原生 chevron；展开后原位显示全文。阈值是**渲染行数**，窗口变窄或字号变大
  都不会改变折叠点。
- **阅读位置冻结**：回答**正在写正文**时视口继续跟随，到你这条消息吸顶（距顶等于原生内距）就停住，
  文字继续在下方增长 —— 不会再把自己的开头一行行推出屏幕。思考与工具阶段照常跟随；
  之后自己滚回底部或点「回到最新」，本轮即交还跟随。
- **「回到底部」按钮**：只在下方确实还有内容被遮住时出现；内容全部可见时自动隐去。
- **细节**：会话边缘上下 24px 渐隐、队列消息卡片用"比画布深一档"的底色。

每条补丁的取值理由写在 `client.js` 的注释里；跨补丁的取舍记在 `DESIGN.md`。

## 安装

插件装进某个 profile 后**必须重启 dsh**，刷新页面不生效。

**插件市场**（推荐，可在界面里看到更新提示）
在「插件 → 发现 → 添加索引源」填入：

```
https://vontean.github.io/vt-dsh-plugin/index.json
```

然后在本插件条目上点安装。市场里的「更新」是卸载再安装。

**npm**

```bash
dsh plugin --profile <profile> add dsh-vt-uiux-enhancer@1.2.4
```

**Release tarball**

到 [Releases](https://github.com/Vontean/vt-dsh-plugin/releases) 下载
`dsh-vt-uiux-enhancer-1.2.4.tgz`，然后：

```bash
dsh plugin --profile <profile> add /绝对路径/dsh-vt-uiux-enhancer-1.2.4.tgz
```

## 支持的 DSH 版本

`engines.dsh` = `>=0.2.1-rc.5 <0.3.0`。超出范围时 DSH 会在加载前拒绝该插件，
不会带着不兼容的样式跑起来。

## 安全边界

插件代码在用户进程内运行，**没有沙箱**，也不发起网络请求、不写文件；但它能读写页面 DOM。
只从你信任的来源安装。市场索引只指向本仓库的 npm 包、Release tarball 或 commit 固定的 git 子树。

## 验证与回滚

- 回滚：关闭或卸载插件即可，Harness 本体从未被修改。
- 验证：插件把每条补丁的解析结果编码成 `--vt-report-*` 报告 token，方法见
  [`docs/VERIFY.md`](docs/VERIFY.md)；运行时也可以调 `__vtInterface.status()`。

## 开发

| 要做的事 | 先读 |
|---|---|
| 观感方向与跨补丁取舍 | [`DESIGN.md`](DESIGN.md) |
| 补丁怎么写、有哪些机制陷阱 | [`DEVELOPMENT.md`](DEVELOPMENT.md) |
| 判断改动到底加载了没有 | [`docs/VERIFY.md`](docs/VERIFY.md) |
| 仓库结构、发布约定 | 总集仓库 [`docs/plugin-conventions.md`](../../docs/plugin-conventions.md) |
