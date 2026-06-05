# Privacy Policy — pr0Vault

**Last updated:** 2026-06-05

## TL;DR

pr0Vault stores everything **locally** in your browser. No tracking, no
analytics, no servers, no third parties. Your data never leaves your device
unless you explicitly export it yourself.

## What data does pr0Vault process?

When you actively trigger a sync (or have auto-sync enabled), the extension
fetches the following from your own pr0gramm.com account, via the official
pr0gramm API, using your existing pr0gramm login cookies:

- Your own uploads (metadata: ID, timestamp, tags, thumb URL — **no full
  images or videos**)
- Your own comments (text + timestamps)
- Your own collections / favorites (metadata + item lists)
- Your inbox messages (private messages, comment replies, follows, notifications)
- Your filter bookmarks

## Where is it stored?

Exclusively in your browser's local **IndexedDB**, scoped to the
`chrome-extension://` origin. Settings (accent color, auto-sync toggle) live
in `chrome.storage.local`.

The database name is `pr0Vault`. You can inspect it via
`chrome://extensions` → pr0Vault → "Service Worker" → DevTools →
Application → IndexedDB.

## Where is it NOT sent?

- **No telemetry.** The extension makes zero requests to any server we control,
  because we don't operate any server.
- **No analytics.** No Google Analytics, no Sentry, no anything.
- **No third parties.** The only external endpoints contacted are
  `pr0gramm.com` and `img.pr0gramm.com`, which are your account's own
  provider.

## Permissions explained

| Permission | Why |
|---|---|
| `storage` + `unlimitedStorage` | Save backed-up data (potentially many MB) in IndexedDB. |
| `downloads` | Save the export file (`.json` / `.zip`) to your Downloads folder when you click "Export". |
| `cookies` | Read the pr0gramm session cookies (`pp`, `me`) so we can call the API on your behalf. We never write cookies. |
| `alarms` | Run a periodic incremental sync (default: every 60 min) when auto-sync is enabled. |
| `host_permissions: https://pr0gramm.com/*` | Required to call the pr0gramm API. |
| `host_permissions: https://img.pr0gramm.com/*` | Required to load collection thumbnails. |

## What about the export file?

When you click "Export starten", the data is written **directly** to your
Downloads folder as a `.json` or `.zip` file. The file is not uploaded
anywhere. What you do with that file afterwards is up to you — we recommend
treating it like any other sensitive backup (encrypted disk, password manager,
etc.).

## Deletion

Open the Extension Options → "Datenverwaltung" → "Alle Daten löschen". This
wipes the entire IndexedDB and `chrome.storage.local`. Uninstalling the
extension also removes everything.

## Source code

100% open source: <https://github.com/Livvux/pr0vault>

If you spot a privacy issue, please open an issue or PR.

## Changes to this policy

Material changes will be noted in the GitHub release notes and the
"Last updated" date above will be bumped.

## Contact

Issues: <https://github.com/Livvux/pr0vault/issues>
