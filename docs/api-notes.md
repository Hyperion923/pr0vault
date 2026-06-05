# pr0Vault — API Notes

Verifizierte API-Realität basierend auf OpenAPI-Spec + Live-Tests (04.06.2026).

## 1. Pagination Matrix

| Endpoint | Pagination-Param | Typ | End-Flag | Response-Feld |
|----------|-----------------|-----|----------|--------------|
| `/profile/info?name=me&flags=15` | keine | — | — | Liefert Uploads (Summary: id, thumb, preview, flags) + Comments (letzte ~20-100) |
| `/profile/comments?name=me&flags=15` | `before` / `after` | Timestamp (Unix-Sek) | `hasOlder` / `hasNewer` (bool) | `comments[]` Array |
| `/items/get?user=me&flags=15` | `older` / `newer` | ItemId | `atEnd` (bool) | `items[]` Array mit vollen Item-Daten |
| `/inbox/all` | `older` | Timestamp (Unix-Sek) | `atEnd` (bool) | `messages[]` Array |
| `/bookmarks/get` | keine | — | — | Alles in einem Call (collections, bookmarks, trending) |
| `/collections/get` | keine | — | — | Alle Collections des Users |
| `/collections/memberships` | keine | — | — | Collection-Memberships |

## 2. Genutzte Endpoints

| Endpoint | Auth | CSRF | Beschreibung | Response-Größe |
|----------|------|------|-------------|---------------|
| `/profile/info?name=me&flags=15` | Cookie | Nein | Uploads + Comments (Summary) | ~20 KB (10-20 Items) |
| `/profile/comments?name=me&flags=15&before=X` | Cookie | Nein | Paginierte Comments | ~5-20 KB pro Page |
| `/items/get?user=me&flags=15&older=X` | Cookie | Nein | Paginierte Items mit vollen Metadaten | ~10-50 KB pro Page |
| `/inbox/all?older=X` | Cookie | Nein | Paginierte Inbox | ~5-20 KB pro Page |
| `/bookmarks/get` | Cookie | Nein | User-Filter + Collections + Trending | ~2-5 KB |
| `/collections/get` | Cookie | Nein | Collection-Liste | ~2 KB |
| `/collections/memberships` | Cookie | Nein | Collection-Items | ~5-50 KB |
| `/user/name` | Cookie | Nein | Aktueller Username | ~50 B |

## 3. Offene API-Fragen

- **Bookmarks-Bedeutung:** `/bookmarks/get` liefert gespeicherte Suchfilter (name+link), NICHT favorisierte Items. Favoriten = Collections (z.B. "Favoriten"-Collection via `/collections/get`). pr0Vault speichert beide separat: `filters` table + `collections` table.
- **`/profile/info` Upload-Limit:** Bei Power-Usern mit 5K+ Uploads liefert `/profile/info` nur die letzten ~20-30 Uploads als Summary. Vollständige Upload-Daten nur via paginiertem `/items/get?user=me`.
- **Comments in `/profile/info`**: Das `comments`-Array in `/profile/info` enthält auch nur die neuesten Comments. Für vollständiges Backup `/profile/comments` paginieren.
- **`/inbox/all`**: Markiert Nachrichten als gelesen beim Abruf. pr0Vault sollte stattdessen `/inbox/pending` (ohne Mark-Read) für Inbox-Backup nutzen.
- **Rate-Limits:** Keine dokumentierten Rate-Limits in der OpenAPI-Spec. Bei manuellem Sync-Trigger (kein Hintergrund-Polling) unwahrscheinlich, aber beobachten.

## 4. Test-Commands

```bash
# Session-Cookies aus Browser holen (vorher auf pr0gramm.com einloggen)
PP="<pp-cookie>"       # 32 hex chars
ME="<me-cookie>"       # url-encoded JSON

# Username abrufen
curl -s "https://pr0gramm.com/api/user/name" \
  -H "Cookie: pp=$PP; me=$ME"

# Profile Info (Uploads + Comments Summary)
curl -s "https://pr0gramm.com/api/profile/info?name=WillyWonkaFDC&flags=15" \
  -H "Cookie: pp=$PP; me=$ME" | jq '{uploads: .uploads | length, comments: .comments | length, commentCount: .commentCount}'

# Comments paginiert
curl -s "https://pr0gramm.com/api/profile/comments?name=WillyWonkaFDC&flags=15" \
  -H "Cookie: pp=$PP; me=$ME" | jq '{count: .comments | length, hasOlder: .hasOlder}'

# Items paginiert (User-Uploads mit vollen Daten)
curl -s "https://pr0gramm.com/api/items/get?user=WillyWonkaFDC&flags=15" \
  -H "Cookie: pp=$PP; me=$ME" | jq '{count: .items | length, atEnd: .atEnd, firstItem: .items[0].id}'

# Bookmarks (User-Filter)
curl -s "https://pr0gramm.com/api/bookmarks/get" \
  -H "Cookie: pp=$PP; me=$ME" | jq '{collections: .collections | length, bookmarks: .bookmarks | length}'

# Inbox (pending — ohne Mark-Read!)
curl -s "https://pr0gramm.com/api/inbox/pending" \
  -H "Cookie: pp=$PP; me=$ME" | jq '.'
```
