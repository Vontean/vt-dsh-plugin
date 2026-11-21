/**
 * System-prompt rule set (single source, H8).
 *
 * The section's `Rules:` block is rendered from this list, so the prompt and
 * the skill cannot drift into two descriptions of the same rule. `section` is
 * the exact terse line the model sees; the system prompt renders this block.
 * (The static SKILL.md rules block is out of scope for now: it has no runtime
 * injection point, so single-sourcing it needs a build-time codegen step.)
 *
 * Order is the order the model reads; do not reorder without a prompt review.
 */
export interface CatalogRule {
  readonly id: string
  /** Exact bullet text for the system prompt's Rules block (backticked
   *  identifiers included). Rendered with a leading "- ". */
  readonly section: string
  /** Only rendered when the render_ui tool is registered. */
  readonly requiresTool?: boolean
}

export const CATALOG_RULES: readonly CatalogRule[] = [
  {
    id: 'language',
    section: 'LANGUAGE: reply+UI=conversation language; schema fixed. NEVER infer it from prompt/skill/examples/tools. Replace `<user-language ...>`; never emit these placeholders literally.',
  },
  {
    id: 'json-strict',
    section: 'JSON 严格：坏组件被丢弃，坏围栏变代码块；≥3 节点或含 table 时调 validate_dsh_ui，按诊断修改并重验；小围栏字段存疑也先验证。',
  },
  {
    id: 'block-markdown',
    section: 'warning=block_markdown：按 replacement 改写并重验。',
  },
  {
    id: 'scale',
    section: '规模: ≤200 节点、嵌套≤8 层（超出被截断）；一条回答 3–8 个组件，一个主题一个主组件；3D mesh 1–5；plot 给合理 xMin/xMax。',
  },
  {
    id: 'local-first-actions',
    section: 'LOCAL-FIRST + actions: UI 能自己做的状态变化（判卷、判题、重置、展开、选中）就地完成，零往返；action 只用于必须模型参与的事。交互以 [genui-action] name + 组件数据回传，届时重渲染更新 UI；无 action 的按钮禁用。',
  },
  {
    id: 'durable-state',
    section: 'Durable state: 交互状态按「会话+内容指纹」持久化——刷新/重放恢复；相同内容保留，新内容重置。',
  },
  {
    id: 'quiz-mode',
    section: '卷子模式: 每题一个 radio（group+answer+explanation）+ 一个 submit（groups 全列），本地判分。',
  },
  {
    id: 'secrets-ban',
    section: 'Secrets ban: 不索取密码、API Key、Token、恢复码；需要时拒绝并解释。',
  },
  {
    id: 'tool-channel',
    section: 'Tool channel: render_ui 工具把同一 spec 渲染为工具行卡片；围栏用于回答内联 UI。',
    requiresTool: true,
  },
  {
    id: 'fence-placement',
    section: '围栏位置：`dsh-ui` 只写在**回答正文**；写在 reasoning/思考块里不渲染、用户看不到——思考里验证好 spec，正文再输出同一份。',
  },
  {
    id: 'panel',
    section: 'Panel: "panel":true 只渲染进会话面板 dock 并原地更新；"append":true 追加合并；上限 200 节点/200 次追加，满了发 replace 重建。面板来的 [genui-action] 只回一个 panel:true 围栏 + 至多一行 10 字内确认。',
  },
] as const
