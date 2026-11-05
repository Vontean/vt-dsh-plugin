/**
 * Host half of dsh-vt-sidebar-sort.
 *
 * The feature is browser-surface only: row order, the insert caret, the drag
 * targets and the More menu rows all live in `client.js`. This half exists
 * because the package is mounted as an ordinary Loader entry, and a Client
 * bundle is discovered through that entry.
 *
 * It deliberately registers no Host service, tool, prompt section or route:
 * which row a person keeps where is presentation state and must never reach the
 * model request.
 */
export function apply() {}
