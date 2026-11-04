# Persist embedded-browser guest storage across app restarts

## Summary

Every guest created through the desktop browser lease bridge lives in an
in-memory session partition. Quitting the app therefore throws away cookies,
localStorage and IndexedDB for every embedded site: users have to sign in again
after each restart, and site-level choices such as "do not warn me again" reset
with them.

## Where

`@deepseek-ai/dsh-desktop`, `lib/types/browser-guests.js` —
`DesktopBrowserGuests.acquire()`. The shipped build is `lib/main.js` in
`app.asar`; the packaged runtime is 0.2.1-rc.5 on Electron 44.7.0.

Current code:

```js
acquire(owner, workspace) {
  let partition = this.partitions.get(workspace);
  if (partition === void 0) {
    partition = `dsh-sidebar-browser-${randomUUID()}`;
    this.configureSession(session.fromPartition(partition));
    this.partitions.set(workspace, partition);
  }
  // ...
}
```

A partition name without the `persist:` prefix makes Chromium keep the storage
in memory only. It survives panel switches and tab changes for the lifetime of
the process, and disappears on quit.

## Why it matters

- The built-in Sidebar browser and any third-party panel using
  `globalThis.dshDesktop.browser` go through this one path, so they all lose
  their session on every restart.
- Sites that gate content behind a login (for example `chat.deepseek.com`) make
  the user sign in again after every launch.
- Site-level preferences reset too. `chat.deepseek.com` stores its
  "environment warning dismissed" flag and its sidebar state in guest
  localStorage; both are discarded on quit.
- A panel plugin cannot work around it: the partition is issued by the main
  process, and `will-attach-webview` rejects any element whose `partition`
  attribute differs from the lease.

## Proposal

Derive a stable, workspace-scoped, disk-backed partition name:

```js
import { createHash } from 'node:crypto';

/**
 * Disk-backed partition for one workspace's guests.
 * @param workspace - workspace storage identity received over IPC.
 * @returns a persistent partition name, stable across app restarts.
 */
function guestPartition(workspace) {
  const digest = createHash('sha256').update(workspace, 'utf8').digest('hex').slice(0, 32);
  return `persist:dsh-sidebar-browser-${digest}`;
}
```

and use it in `acquire()` instead of the random name.

## Precedent in the same codebase

The platform account session already uses exactly this shape
(`persist:dsh-platform-${sha256(origin|userId)}`), so the naming and the
on-disk lifecycle are established rather than new.

## Considerations

- Isolation is preserved: the digest is namespaced per workspace, so two
  workspaces still cannot read each other's storage.
- `release()` semantics do not change: closing a guest still destroys the
  webContents; only the storage now outlives it.
- Data now lives at rest under the app's `userData`. If ephemerality is a
  deliberate privacy property, make it explicit: keep the current behaviour as
  the default and add an opt-in (profile setting, or an `acquire(owner,
  workspace, { persist })` flag that the built-in browser and panel plugins can
  request).
- Worth pairing with a clear action: clearing the partition on sign-out, and a
  documented location for the on-disk directories.

## Test plan

1. Sign in to a site inside a guest, quit the app, relaunch, open the same
   panel: the session is still valid.
2. Sign in as two different workspaces: each keeps its own storage, no
   cross-reading.
3. Leave a panel and return: `release()` still destroys the guest, and no
   orphan webContents remain.
4. Dismiss a site-level notice once, restart, reopen: the notice stays
   dismissed.
