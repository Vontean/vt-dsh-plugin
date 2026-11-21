/**
 * Close channel for modal panels: `button.close` consumes it so a confirmation
 * dialog can dismiss itself without an action round trip. A button closes the
 * panel it sits in — there is no id to match, which also makes the nested case
 * impossible to express.
 */
import { createContext, useContext } from 'react'

export interface ModalClose {
  /** Close the containing modal panel. */
  close(): void
}

export const ModalCloseContext = createContext<ModalClose | undefined>(undefined)

/** The close channel of the enclosing modal, or undefined outside one. */
export function useModalClose(): ModalClose | undefined {
  return useContext(ModalCloseContext)
}
