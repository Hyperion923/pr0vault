# pr0Vault

Dein digitales Gedächtnis auf pr0gramm. Chrome Extension für automatisches
Backup aller eigenen Inhalte — lokal im Browser.

## Features

- **Auto-Backup**: Hochlads, Kommentare, Nachrichten, Filter & Sammlungen
- **Full-Text-Search**: Blitzschnelle Suche über eigene Kommentare & Nachrichten
- **DSGVO-Export**: JSON oder ZIP — alle Daten gehören dir
- **Auto-Sync**: Hält dein Backup alle 30 Minuten aktuell
- **Dark Mode**: 8 Akzentfarben aus dem offiziellen pr0gramm-Styleguide

## Tech Stack

TypeScript · Preact · Dexie.js · Fuse.js · JSZip · Vite · Manifest V3

## Development

```bash
pnpm install
pnpm run build        # Build für Chrome
pnpm run build:icons  # Nur Icons generieren
```

Zum Laden in Chrome: `chrome://extensions` → "Entpackte Erweiterung laden" → `dist/` auswählen.

## API

pr0gramm API-Dokumentation: siehe [docs/api-notes.md](docs/api-notes.md)

## Privacy

Alle Daten bleiben ausschließlich lokal in deinem Browser (IndexedDB).
Kein Tracking, kein Server, keine externe Kommunikation.

## License

MIT
