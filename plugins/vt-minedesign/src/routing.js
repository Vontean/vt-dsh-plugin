/**
 * The system-prompt section: when to reach for MineDesign, and where the editor
 * lands. This is model-facing prose, so it is data plus two pure builders rather
 * than logic — the wiring in `index.js` only chooses which builder to call.
 *
 * The section is sent on every request, which is why it stays this short and
 * why the ready line carries only facts the model cannot read anywhere else
 * (version, install origin, work directory, exposed skill names).
 *
 * @module dsh-vt-minedesign/src/routing
 */

/**
 * The routing section: when to use MineDesign, and where the editor link
 * comes from. Kept short because it is sent on every request.
 */
const ROUTING_TEXT = `## MineDesign（本地 MCP + 两个设计技能）

触发：用户要做界面、网页、海报、图表、信息图、示意图、原型，或提到设计稿、设计系统、MineDesign。

1) 先看工具表里有没有 \`mcp__minedesign__*\`。没有就说明这个会话没连上 MineDesign 的本地 MCP，给出排查入口：\`minedesign_status\`、\`npx @vontean/minedesign plugin install\`。**不要伪造设计数据，也不要用截图代替真实设计上下文。**
2) 动手前用 \`skill\` 工具加载 \`minedesign-design\`（做设计稿）或 \`minedesign-design-system\`（做设计系统）；技能里写着文件协议与校验要求。
3) 作品就是普通文件：\`<canvas>/canvas.json\` 加每块画板一个 \`.dc.html\`；用 read/write/edit 读写，**不要用 shell 重定向写作品文件**。写完后 \`design_check\` / \`design_system_check\` 到零问题。
4) 交付 = 侧栏面板：调 \`minedesign_open_document\`（\`kind\` 取 \`design\` 或 \`design-system\`）。作品会出现在右侧栏的 **MineDesign 面板**（本插件注册的侧栏 tab，带自己的顶部栏）里，模型不需要手动开关 UI。若面板没自动出现，让用户在右侧栏入口列表里点 MineDesign，或把工具结果里的 \`editorUrl\` 作为 Markdown 链接交给用户。**不要承诺「对话里出现设计稿卡片」，也不要编造链接。**
5) 用户在编辑器里的改动与标注用 \`minedesign_events\` 读：\`path\` 传 \`<editorPath>__deck/events\`（形如 \`/design/<grant>/__deck/events\`），传作品目录会被拒绝。不要要求用户复制粘贴。
6) 编辑器地址只在本次 MCP 进程存活期内有效：DSH 重启后端口变化，需要重新 \`minedesign_open_document\` 再取新地址。`

/** Shown instead of the ready line when no MineDesign install was found. */
const installMissingText = (reason) => `\n\n⚠ 本机没找到可用的 MineDesign（${reason}）。上面的工具和技能都用不了：先请用户运行 \`npx @vontean/minedesign plugin install\`，装好后调 \`minedesign_status({ refresh: true })\`。不要假装加载过技能，也不要编造编辑器地址。`

/**
 * Build the section body for the current install.
 *
 * @param {{ ok: true, install: { version: string | null, origin: string, workspace: string } } | { ok: false, reason: string }} resolved
 *   install resolution.
 * @param {{ name: string }[]} candidates - exposed skills.
 * @returns {string} the section text.
 */
export function routingText(resolved, candidates) {
  if (!resolved.ok) return ROUTING_TEXT + installMissingText(resolved.reason)

  const { install } = resolved
  const ready = `MineDesign ${install.version ?? '(unknown version)'} · 来源 ${install.origin} · 作品目录 \`${install.workspace}\``
  const skills = candidates.length > 0
    ? `技能就绪：${candidates.map((candidate) => `\`${candidate.name}\``).join('、')}。`
    : '⚠ 没找到 MineDesign 技能目录（先运行 `npx @vontean/minedesign plugin install`）。'
  return `${ROUTING_TEXT}\n\n${ready}。${skills}`
}
