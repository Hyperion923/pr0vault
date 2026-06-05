# Chrome Web Store Submission Notes

Internal notes for store listing + review responses. Not user-facing.

## Listing copy

**Short description (max 132 chars):**
> Dein digitales Gedächtnis auf pr0gramm. Lokales Auto-Backup, Volltextsuche, DSGVO-Export. Open Source, keine Server.

**Detailed description (max 16k chars):** see `README.md` + privacy/permission sections below.

## Privacy Policy URL

<https://github.com/Livvux/pr0vault/blob/main/PRIVACY.md>

## Single Purpose

Local backup and offline browsing of the user's own pr0gramm.com content
(uploads, comments, collections, inbox, filters), plus full-text search and
GDPR-compliant export.

## Permission Justifications (paste verbatim into Web Store form)

### `storage`
Persist user preferences (selected accent color, auto-sync on/off, sync
metadata cursors). Used for small key-value settings only.

### `unlimitedStorage`
Active pr0gramm users can have tens of thousands of comments and inbox
messages plus image thumbnails. Without unlimitedStorage we hit Chrome's
~10 MB IndexedDB quota and the backup becomes useless for the target
audience.

### `downloads`
The user-triggered Export feature creates a `.json` or `.zip` of their
data and saves it via `chrome.downloads.download` to their Downloads
folder. No automatic or background downloads.

### `cookies`
Read the user's existing pr0gramm session cookies (`pp` and `me`) so the
extension can call the pr0gramm API on the user's behalf without asking
them to log in a second time. The extension never writes, modifies, or
sends cookies anywhere except in the `Cookie` header of requests to
`pr0gramm.com`.

### `alarms`
Schedule the optional periodic auto-sync (default: every 60 minutes).
`chrome.alarms` is the only Manifest V3 compliant way to run something
periodically when the service worker is idle.

### Host permission `https://pr0gramm.com/*`
The extension's entire purpose is to back up pr0gramm content. We call
`https://pr0gramm.com/api/*` endpoints for the active sync and inject a
content script on `https://pr0gramm.com/*` pages for the passive
sync-while-browsing feature.

### Host permission `https://img.pr0gramm.com/*`
Load thumbnail images for the "Sammlungen" (collections) tab to give the
user an offline-browseable grid of their favorites.

## Remote code

**None.** The extension contains no `eval`, no `new Function`, no remote
script injection, no dynamic `import()` of third-party URLs. All JavaScript
is bundled at build time from open-source dependencies (Preact, Dexie,
Fuse.js, JSZip) — see `package.json`.

The content script DOES inject `src/page-hook.js` into pr0gramm.com's MAIN
world via `<script src="chrome-extension://.../src/page-hook.js">`. That
file ships with the extension (it's listed in `web_accessible_resources`)
— it's not remote code.

## Data usage disclosure (Web Store form)

- **Authentication information**: Yes — reads pr0gramm session cookies.
  Used **only** to authenticate API calls. Not transmitted to any third
  party. Not stored by the extension (cookies stay in the browser's cookie
  jar managed by Chrome).
- **Personal communications**: Yes — backs up the user's own inbox
  messages and comments. Stored **only** locally in the user's browser
  (IndexedDB). Never transmitted anywhere except for the user-triggered
  Export to their own Downloads folder.
- **User activity, location, financial info, health info, etc.**: No.

## Tester / preview accounts

The reviewer can create a free pr0gramm.com account at
<https://pr0gramm.com/registration> (currently invite-only — request invite
in `Livvux/pr0vault` issue if needed) and use the extension immediately.

## Build reproducibility

```sh
pnpm install --frozen-lockfile
pnpm run build
# → dist/  contains the exact contents of the submitted ZIP
```

Source: <https://github.com/Livvux/pr0vault>
Release ZIPs (auto-built from tags): <https://github.com/Livvux/pr0vault/releases>

## Internal review checklist before each submission

- [ ] `manifest.json.version` matches `package.json.version`
- [ ] Both match the git tag for this release
- [ ] `pnpm build` passes locally with no TS errors
- [ ] Test install of `dist/` in fresh Chrome profile
- [ ] PRIVACY.md "Last updated" bumped if anything changed
- [ ] Screenshots in `store-screenshots/` are current
- [ ] No `console.log` debug statements left in `dist/`
