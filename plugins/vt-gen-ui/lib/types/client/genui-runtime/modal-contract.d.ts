/**
 * Modal contract predicates shared by repair (guard), diagnostics, and the
 * declared-vs-rendered ledger.
 *
 * One predicate, three consumers: if any of them disagreed about which modals
 * can open, an intentional drop would be counted as a repair failure and the
 * whole fence would degrade to a code block.
 */
/** A modal can open when it has non-empty trigger text or `open: true`. */
export declare function isReachableModal(value: Record<string, unknown>): boolean;
