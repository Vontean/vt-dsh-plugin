/**
 * Prototype-channel components (slice 1): `page`, `nav`, `list-row`,
 * `field-group`.
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
import type { GenuiFieldGroup, GenuiListRow, GenuiNav, GenuiNode, GenuiPage } from '../spec.ts'

/** Children are rendered by the dispatcher, never imported (avoids a cycle). */
export type RenderPrototypeChildren = (nodes: readonly GenuiNode[], basePath: string) => ReactNode

export interface PrototypeRenderProps<N> {
  readonly node: N
  readonly path: string
  readonly renderChildren: RenderPrototypeChildren
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
export function PageNode({ node, path, renderChildren }: PrototypeRenderProps<GenuiPage>): ReactNode {
  const headingId = useId()
  const hasHeader = node.title !== undefined || node.subtitle !== undefined
    || (node.actions !== undefined && node.actions.length > 0)
  return (
    <section
      className={css.page}
      data-genui="page"
      data-orientation="vertical"
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
      <div className={css.pageBody}>
        {renderChildren(node.items, `${path}.items`)}
      </div>
    </section>
  )
}

/**
 * `nav`: a navigation *sketch*. Clicking only moves the visual selection —
 * it carries no route and never sends an action. The current item is marked
 * with `data-active` (and `aria-current` / `aria-selected` for AT).
 */
export function NavNode({ node }: PrototypeRenderProps<GenuiNav>): ReactNode {
  const variant = node.variant ?? 'top'
  const initial = node.items.findIndex(item => item.active === true)
  const [selected, setSelected] = useState(initial)
  const isTabs = variant === 'tabs'
  const items = node.items.map((item, index) => {
    const active = index === selected
    return (
      <li key={`${index}:${item.label}`} className={css.navItemCell}>
        <button
          type="button"
          className={css.navItem}
          data-active={active ? 'true' : 'false'}
          {...(isTabs ? { role: 'tab', 'aria-selected': active } : { 'aria-current': active ? 'page' : undefined })}
          onClick={() => setSelected(index)}
        >
          {item.icon !== undefined && <span className={css.navIcon} aria-hidden="true">{item.icon}</span>}
          <span>{renderInline(item.label, false)}</span>
        </button>
      </li>
    )
  })
  return (
    <nav
      className={css.nav}
      data-genui="nav"
      data-orientation={variant}
      aria-label={node.label ?? '导航'}
    >
      {isTabs
        ? <div className={css.navList} role="tablist">{items}</div>
        : <ul className={css.navList}>{items}</ul>}
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
