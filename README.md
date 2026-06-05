# pr0Vault

Dein digitales Gedächtnis auf pr0gramm. Chrome Extension für automatisches
Backup aller eigenen Inhalte — lokal im Browser.

<img width="1280" height="800" alt="pr0gramm" src="https://github.com/user-attachments/assets/3a8c2125-f80a-4bef-9768-ef2f972faef7" />


## Features

- **Auto-Backup**: Hochlads, Kommentare, Nachrichten, Filter & Sammlungen
- **Full-Text-Search**: Blitzschnelle Suche über eigene Kommentare & Nachrichten
- **DSGVO-Export**: JSON oder ZIP — alle Daten gehören dir
- **Auto-Sync**: Hält dein Backup alle 30 Minuten aktuell
- **Dark Mode**: 8 Akzentfarben aus dem offiziellen pr0gramm-Styleguide

## Tech Stack

TypeScript · Preact · Dexie.js · Fuse.js · JSZip · Vite · Manifest V3

## Development

\`\`\`bash
pnpm install
pnpm run build        # Build für Chrome
pnpm run build:icons  # Nur Icons generieren
\`\`\`

Zum Laden in Chrome: \`chrome://extensions\` → \"Entpackte Erweiterung laden\" → \`dist/\` auswählen.

## Installation

1. [Neueste Version herunterladen](https://github.com/Livvux/pr0vault/releases/latest) (pr0vault-v*.zip)
2. ZIP entpacken
3. \`chrome://extensions\` öffnen
4. \"Entwicklermodus\" (oben rechts) aktivieren
5. \"Entpackte Erweiterung laden\" → den entpackten Ordner auswählen
6. Auf pr0gramm.com einloggen — Extension klickt aufs Icon

> **Hinweis:** Der Chrome Web Store Review läuft noch. Sobald freigegeben, ist One-Click-Install verfügbar.

## API

pr0gramm API-Dokumentation: siehe [docs/api-notes.md](docs/api-notes.md)

## Privacy

Alle Daten bleiben ausschließlich lokal in deinem Browser (IndexedDB).
Kein Tracking, kein Server, keine externe Kommunikation.

## License

MIT
