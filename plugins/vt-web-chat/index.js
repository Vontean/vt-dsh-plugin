/**
 * Host half of dsh-vt-web-chat.
 *
 * The feature is browser-surface only: the sidebar entry, the main-area panel
 * and the embedded guest all live in `client.js`. This half exists because the
 * package is mounted as an ordinary Loader entry, and a Client bundle is
 * discovered through that entry.
 *
 * It deliberately registers no Host service, tool, prompt section or route:
 * the embedded page is user-side presentation state and must never reach the
 * model request.
 */
export function apply() {}
