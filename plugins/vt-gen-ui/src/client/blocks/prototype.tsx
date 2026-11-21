/**
 * Prototype-channel components: `page`, `nav`, `list-row`, `field-group`
 * (slice 1) plus `empty`, `loading`, `split` (slice 3).
 *
 * They are page-structure primitives for low-fidelity, in-conversation
 * prototypes. Visual rules stay neutral on purpose (the visual pass is a
 * separate task): structure and semantics first, colours only from host
 * tokens, and every interaction/visual state lives in `data-*` attributes so
 * the style layer can consume attributes instead of joined class names.
 *
 * Part names follow shadcn/ui: `list-row` borrows Item (media / content /
 * title / description / actions), `field-group` borrows Field (group / label /
 * description / error with `role="alert"`). No runtime dependency is added.
 */
import { useId, useState, type ReactNode } from 'react'
import css from './Prototype.module.css'
import { renderInline } from '../inline.ts'
import { t } from '../i18n/index.ts'
import { useScreenNavigation } from '../screen-navigation.tsx'
import type {
  GenuiEmpty, GenuiFieldGroup, GenuiListRow, GenuiLoading, GenuiNav, GenuiNode, GenuiPage, GenuiSplit,
} from '../spec.ts'

/** Children are rendered by the dispatcher, never imported (avoids a cycle). */
export type RenderPrototypeChildren = (nodes: readonly GenuiNode[], basePath: string) => ReactNode

export interface PrototypeRenderProps<N> {
  readonly node: N
  readonly path: string
  readonly renderChildren: RenderPrototypeChildren
  /** Dispatch depth; 0 means a root node of the block/screen. */
  readonly depth?: number
}

/**
 * Outer container of a prototype: names `proto-root` (§5.3) so layout that can
 * sit outside a `page` — a root-level nav now, `split` later — can query the
 * root width instead of silently falling back to the viewport. The dispatcher
 * wraps top-level prototype nodes with it.
 */
export function PrototypeRoot({ children }: { readonly children: ReactNode }): ReactNode {
  return <div className={css.prototypeRoot} data-genui="prototype-root">{children}</div>
}

/**
 * Wrap a dispatched prototype node in the root container when it sits at the
 * top level of the block. Nested nodes inherit the existing root.
 */
export function wrapPrototypeRoot(rendered: ReactNode, depth: number, key: number): ReactNode {
  return depth === 0 ? <PrototypeRoot key={key}>{rendered}</PrototypeRoot> : rendered
}

/** `page`: optional title bar + content area; the root of a prototype screen. */
export function PageNode({ node, path, renderChildren, depth = 0 }: PrototypeRenderProps<GenuiPage>): ReactNode {
  const headingId = useId()
  const navigation = useScreenNavigation()
  const hasHeader = node.title !== undefined || node.subtitle !== undefined
    || (node.actions !== undefined && node.actions.length > 0)
  const section = (
    <section
      className={css.page}
      data-genui="page"
      data-orientation="vertical"
      data-frame={depth === 0 ? 'dashed' : 'solid'}
      {...(hasHeader ? { 'aria-labelledby': headingId } : {})}
    >
      {hasHeader && (
        <header className={css.pageHeader}>
          <div className={css.pageHeading}>
            {node.title !== undefined && <h2 className={css.pageTitle} id={headingId}>{renderInline(node.title)}</h2>}
            {node.subtitle !== undefined && <p className={css.pageSubtitle}>{renderInline(node.subtitle)}</p>}
          </div>
          {node.actions !== undefined && node.actions.length > 0 && (
            <div className={css.pageActions}>
              {renderChildren(node.actions, `${path}.actions`)}
            </div>
          )}
        </header>
      )}
      <div className={css.pageBody} data-page-body="">
        {renderChildren(node.items, `${path}.items`)}
      </div>
    </section>
  )
  // Screen chrome (§3.1): the corner badge says "this rectangle is a
  // simulated screen". It lives OUTSIDE the page because the page clips its
  // own overflow and owns no padding the badge could sit in.
  // `page.label` is the comparison badge for side-by-side options and wins
  // over the automatic "屏 N · 标题" — the two never show together. A nested
  // page gets a badge only when `label` is written (split panes would
  // otherwise all repeat the outer screen's number).
  const customLabel = typeof node.label === 'string' && node.label.trim() !== ''
    ? node.label.trim()
    : undefined
  const autoLabel = depth === 0 && navigation?.screenIndex !== undefined
    ? [t('screens.frame', { n: navigation.screenIndex + 1 }), node.title ?? navigation.screenId]
      .filter((part): part is string => part !== undefined && part !== '')
      .join(' · ')
    : undefined
  const frameLabel = customLabel ?? autoLabel
  if (frameLabel === undefined) return section
  return (
    <div className={css.pageFrame} data-genui-page-frame>
      <span className={css.pageLabel}>{frameLabel}</span>
      {section}
    </div>
  )
}

/**
 * `nav`: a navigation *sketch*. Clicking only moves the visual selection —
 * it carries no route and never sends an action.
 *
 * All three shapes are PAGE navigation, so the current item is
 * `aria-current="page"`; the former `role="tab"`/`aria-selected` made screen
 * readers announce bottom tabs as a tab widget, which they are not.
 */
export function NavNode({ node }: PrototypeRenderProps<GenuiNav>): ReactNode {
  const variant = node.variant ?? 'top'
  const initial = node.items.findIndex(item => item.active === true)
  const [selected, setSelected] = useState(initial)
  const items = node.items.map((item, index) => {
    const active = index === selected
    return (
      <li key={`${index}:${item.label}`} className={css.navItemCell}>
        <button
          type="button"
          className={css.navItem}
          data-active={active ? 'true' : 'false'}
          {...(active ? { 'aria-current': 'page' as const } : {})}
          onClick={() => setSelected(index)}
        >
          {item.icon !== undefined && <span className={css.navIcon} aria-hidden="true">{item.icon}</span>}
          <span>{renderInline(item.label, false)}</span>
        </button>
      </li>
    )
  })
  return (
    // Top bars and bottom tabs run their rule edge to edge; the standalone
    // side block is a surface and stays inside the page column (§12.3).
    <nav
      className={css.nav}
      data-genui="nav"
      data-orientation={variant}
      {...(variant === 'side' ? {} : { 'data-bleed': 'true' })}
      aria-label={node.label ?? t('prototype.nav')}
    >
      <ul className={css.navList}>{items}</ul>
    </nav>
  )
}

/**
 * `list-row`: one compact object — media slot, title, description, meta and a
 * tail action area. The whole row exposes a single accessible name so a
 * screen reader announces "who / what / when" as one item instead of three
 * unrelated text runs.
 */
export function ListRowNode({ node, path, renderChildren }: PrototypeRenderProps<GenuiListRow>): ReactNode {
  const name = [node.title, node.desc, node.meta]
    .filter((part): part is string => part !== undefined && part !== '')
    .join(' ')
  const interactive = node.actions !== undefined && node.actions.length > 0
  const twoLine = node.desc !== undefined && node.desc !== ''
  return (
    <div
      className={css.row}
      data-genui="list-row"
      role="listitem"
      data-bleed="true"
      data-state={interactive ? 'interactive' : 'default'}
      data-lines={twoLine ? '2' : '1'}
      aria-label={name}
    >
      {node.media !== undefined && <div className={css.rowMedia} aria-hidden="true">{node.media}</div>}
      <div className={css.rowContent}>
        <div className={css.rowTitle}>{renderInline(node.title)}</div>
        {node.desc !== undefined && <div className={css.rowDesc}>{renderInline(node.desc)}</div>}
        {node.meta !== undefined && <div className={css.rowMeta}>{renderInline(node.meta, false)}</div>}
      </div>
      {interactive && (
        <div className={css.rowActions}>{renderChildren(node.actions!, `${path}.actions`)}</div>
      )}
    </div>
  )
}

/**
 * `field-group`: label + control + description + error. Borrows the Field
 * part split. The error is an alert (`role="alert"`), and its id joins
 * `aria-describedby` on the group; `data-invalid` / `data-state` carry the
 * state for CSS instead of conditional class names.
 */
export function FieldGroupNode({ node, path, renderChildren }: PrototypeRenderProps<GenuiFieldGroup>): ReactNode {
  const baseId = useId()
  const labelId = `${baseId}-label`
  const descId = `${baseId}-desc`
  const errorId = `${baseId}-error`
  const invalid = node.error !== undefined && node.error.trim() !== ''
  const describedBy = [
    node.desc !== undefined && node.desc !== '' ? descId : undefined,
    invalid ? errorId : undefined,
  ].filter((id): id is string => id !== undefined).join(' ')
  return (
    <div
      className={css.fieldGroup}
      data-genui="field-group"
      role="group"
      aria-labelledby={labelId}
      {...(describedBy !== '' ? { 'aria-describedby': describedBy } : {})}
      data-invalid={invalid ? 'true' : 'false'}
      data-state={invalid ? 'invalid' : 'default'}
    >
      <div className={css.fieldLabel} id={labelId}>
        {renderInline(node.label, false)}
        {node.required === true && <span className={css.fieldRequired} aria-hidden="true">*</span>}
      </div>
      <div className={css.fieldControl}>{renderChildren(node.items, `${path}.items`)}</div>
      {node.desc !== undefined && node.desc !== '' && (
        <div className={css.fieldDesc} id={descId}>{renderInline(node.desc)}</div>
      )}
      {invalid && (
        <div className={css.fieldError} id={errorId} role="alert">{renderInline(node.error ?? '')}</div>
      )}
    </div>
  )
}

/** Skeleton width buckets (§6.6). Adjacent bars never share a width: equal
 *  bars close on one straight edge and stop reading as text. */
const LOADING_BLOCK_WIDTHS: Readonly<Record<number, readonly number[]>> = {
  1: [100],
  2: [100, 72],
  3: [100, 88, 72],
}
/** A skeleton row carries two bars; 56 would make the row look half empty. */
const LOADING_ROW_WIDTHS: readonly number[] = [88, 72]

/**
 * `empty`: a real empty state. No dashed frame — that is the "structure not
 * decided" signal, and using it here makes reviewers skip the state as
 * unfinished instead of discussing it.
 */
export function EmptyNode({ node, path, renderChildren }: PrototypeRenderProps<GenuiEmpty>): ReactNode {
  const headingId = useId()
  return (
    <div className={css.empty} data-genui="empty" role="group" aria-labelledby={headingId}>
      {node.icon !== undefined && node.icon !== '' && (
        <div className={css.emptyMedia} aria-hidden="true">{node.icon}</div>
      )}
      <h3 className={css.emptyTitle} id={headingId}>{renderInline(node.title)}</h3>
      {node.desc !== undefined && node.desc !== '' && (
        <p className={css.emptyDesc}>{renderInline(node.desc)}</p>
      )}
      {node.actions !== undefined && node.actions.length > 0 && (
        <div className={css.emptyActions}>{renderChildren(node.actions, `${path}.actions`)}</div>
      )}
    </div>
  )
}

/**
 * `loading`: skeleton placeholder. The width sequence is dealt here, not
 * written by the model — a `width` field would be a second source of truth
 * for a purely visual decision.
 */
export function LoadingNode({ node }: PrototypeRenderProps<GenuiLoading>): ReactNode {
  const variant = node.variant ?? 'block'
  const lines = Math.min(Math.max(Math.trunc(node.lines ?? 3), 1), 3)
  const widths = variant === 'row' ? LOADING_ROW_WIDTHS : (LOADING_BLOCK_WIDTHS[lines] ?? LOADING_BLOCK_WIDTHS[3]!)
  return (
    <div
      className={css.loading}
      data-genui="loading"
      data-orientation={variant}
      role="status"
      aria-busy="true"
      aria-label={node.label ?? t('prototype.loading')}
    >
      <div className={css.skeleton} aria-hidden="true">
        {variant === 'row' && <div className={css.skeletonMedia} />}
        <div className={css.skeletonLines}>
          {widths.map((width, index) => (
            <div key={index} className={css.skeletonBar} data-width={String(width)} />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * `split`: two panes at a fixed ratio. It paints no surface and no padding of
 * its own — the boundary belongs to the `page` each pane carries, and the
 * optional divider is the single exception (`divider: true`).
 */
export function SplitNode({ node, path, renderChildren }: PrototypeRenderProps<GenuiSplit>): ReactNode {
  return (
    <div
      className={css.split}
      data-genui="split"
      data-ratio={node.ratio ?? '1:1'}
      data-divider={node.divider === true ? 'true' : 'false'}
    >
      {node.items.map((child, index) => (
        <div key={index} className={css.splitPane}>
          {renderChildren([child], `${path}.items[${index}]`)}
        </div>
      ))}
    </div>
  )
}
