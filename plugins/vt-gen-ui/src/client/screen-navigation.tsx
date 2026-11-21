/**
 * Screen navigation channel. `GenuiBlock` provides it only when a spec has
 * `screens` and the state machine is enabled; interactive nodes consume it
 * (button `goto`). Without a provider — legacy specs, degraded rendering,
 * standalone `renderNode` callers — `goto` is inert and the old behavior
 * applies unchanged.
 */
import { createContext, useContext } from 'react'

export interface ScreenNavigation {
  /** Switch to a declared screen id; invalid ids are ignored. */
  go(target: string): void
  /** Return to the previous screen; no-op at the root. */
  back(): void
  readonly canGoBack: boolean
  /** Current screen id (present only in a screen-based block). */
  readonly screenId?: string
  /** Zero-based index of the current screen in declaration order. */
  readonly screenIndex?: number
}

export const ScreenNavigationContext = createContext<ScreenNavigation | undefined>(undefined)

/** Current screen navigation, or undefined outside a screen-based block. */
export function useScreenNavigation(): ScreenNavigation | undefined {
  return useContext(ScreenNavigationContext)
}
