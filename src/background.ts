// pr0Vault — Service Worker (Background)
// Handles all messages, DB operations, search, and export.

import {db} from "./shared/db";
import Fuse from "fuse.js";
import {logErr, logSync} from "./shared/logger";
import {browser} from "./shared/browser";
import type {SyncCompleteMessage, SyncProgressMessage, VaultMessage,} from "./shared/messages";
import type {Comment, ExportData, Message, VaultStats} from "./shared/types";

// ---- Alarm Handler (Auto-Sync) ----

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "pr0vault-sync") {
    logSync("SW", "Auto-Sync triggered");
    handleSyncStart("all").catch((e) => logErr("SW", `Auto-Sync error: ${String(e)}`));
  }
});

// ---- Message Router ----

browser.runtime.onMessage.addListener(
  (msg: any, _sender: any): any => {
    const vaultMsg = msg as VaultMessage;
    switch (vaultMsg.type) {
      case "STORE_BATCH":
        return handleStoreBatch(vaultMsg.payload).then(() => ({ success: true }));

      case "SYNC_START":
        logSync("SW", `Sync gestartet: ${vaultMsg.scope}`);
        return handleSyncStart(vaultMsg.scope).then((stats) => {
          logSync("SW", `Sync fertig: ${JSON.stringify(stats)}`);
          return stats;
        }).catch(e => {
          logErr("SW", `Sync Fehler: ${String(e)}`);
          return { success: false, error: String(e) };
        });

      case "QUERY_SEARCH":
        return handleSearch(vaultMsg.query, vaultMsg.limit ?? 50).then((results) =>
          ({ results })
        );

      case "GET_STATS":
        return getStats();

      case "EXPORT":
        return handleExport(vaultMsg.format, vaultMsg.scope);

      default:
        // Return false for unhandled messages to allow other listeners or close channel
        return false;
    }
  }
);

// ---- Store Batch ----

async function handleStoreBatch(payload: {
  uploads?: import("./shared/types").Upload[];
  comments?: Comment[];
  messages?: Message[];
}) {
  const now = Date.now();

  if (payload.uploads?.length) {
    const items = payload.uploads.map((u) => ({ ...u, syncedAt: now }));
    await db.uploads.bulkPut(items);
    await db.meta.put({ key: "lastSync", value: now });
    logSync("SW", `Stored ${items.length} uploads`);
  }
  if (payload.comments?.length) {
    await db.comments.bulkPut(payload.comments);
    await db.meta.put({ key: "lastSync", value: now });
    logSync("SW", `Stored ${payload.comments.length} comments`);
  }
  if (payload.messages?.length) {
    await db.messages.bulkPut(payload.messages);
    await db.meta.put({ key: "lastSync", value: now });
    logSync("SW", `Stored ${payload.messages.length} messages`);
  }
}

// ---- Active Sync ----

async function sendSyncProgress(
  scope: string,
  page: number,
  total: number,
  newItems: number
) {
  const msg: SyncProgressMessage = {
    type: "SYNC_PROGRESS",
    scope,
    page,
    total,
    newItems,
  };
  // Broadcast to popup via runtime
  browser.runtime.sendMessage(msg).catch(() => {});
}

async function getPr0Cookies(): Promise<string> {
  const [pp, me] = await Promise.all([
    browser.cookies.get({ url: "https://pr0gramm.com", name: "pp" }),
    browser.cookies.get({ url: "https://pr0gramm.com", name: "me" }),
  ]);
  if (!pp || !me) throw new Error("Nicht eingeloggt — bitte pr0gramm.com besuchen.");
  return `pp=${pp.value}; me=${me.value}`;
}

async function getUsername(): Promise<string> {
  try {
    const meCookie = await browser.cookies.get({ url: "https://pr0gramm.com", name: "me" });
    if (meCookie) {
      const decoded = JSON.parse(decodeURIComponent(meCookie.value));
      return decoded.n || "";
    }
  } catch { /* fall through */ }
  return "me";
}

async function fetchAPI(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  // Try direct fetch with cookies first
  try {
    const cookie = await getPr0Cookies();
    const url = new URL(`/api${endpoint}`, "https://pr0gramm.com");
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    const resp = await fetch(url.toString(), {
      headers: { Cookie: cookie },
    });
    if (resp.ok) return resp.json();
  } catch {
    // Fall through to CS proxy
  }

  // Fallback: use content script on active pr0gramm tab
  const tabs = await browser.tabs.query({ url: "https://pr0gramm.com/*" });
  const tab = tabs[0];
  if (tab?.id) {
    return browser.tabs.sendMessage(tab.id, { type: "FETCH_API", endpoint, params });
  }

  throw new Error("Kein pr0gramm-Tab aktiv und kein Cookie verfügbar.");
}

async function syncComments(me: string, fromPopup: boolean) {
  // Inkrementell: nur neuere als den letzten bekannten Kommentar holen
  const lastMeta = await db.meta.get("lastCommentTs");
  const lastTs = (lastMeta?.value as number) || 0;
  const isIncremental = lastTs > 0;

  let after = isIncremental ? lastTs : 0;
  let totalNew = 0;
  let page = 0;

  while (true) {
    const params: Record<string, string> = { name: me, flags: "15" };
    if (after > 0) {
      params.after = String(after);
    } else {
      // Initial-Sync: starte bei neuesten, paginiere rückwärts mit before
      params.before = String(Math.floor(Date.now() / 1000));
    }

    const data = (await fetchAPI("/profile/comments", params)) as Record<string, unknown> | null;
    if (!data || data.error) break;

    const comments = data.comments as Comment[] | undefined;
    if (!comments || comments.length === 0) break;

    // Bei Incremental-Sync: early stop wenn alle IDs schon bekannt
    if (isIncremental) {
      const knownIds = new Set(
        (await db.comments.where("id").anyOf(comments.map(c => c.id)).toArray()).map(c => c.id)
      );
      const newComments = comments.filter(c => !knownIds.has(c.id));
      if (newComments.length === 0 && knownIds.size > 0) break;

      await db.comments.bulkPut(newComments);
      await db.meta.put({ key: "lastSync", value: Date.now() });
      totalNew += newComments.length;
    } else {
      // Initial backfill: alle speichern
      await db.comments.bulkPut(comments);
      await db.meta.put({ key: "lastSync", value: Date.now() });
      totalNew += comments.length;
    }
    page++;

    // Track newest timestamp
    const maxTs = Math.max(...comments.map(c => c.created));
    await db.meta.put({ key: "lastCommentTs", value: maxTs });

    if (fromPopup) sendSyncProgress("comments", page, 0, totalNew);

    if (isIncremental) {
      if (!data.hasNewer) break;
      after = Math.max(...comments.map(c => c.created));
    } else {
      if (!data.hasOlder) break;
      after = 0; // switch to before-based for next pages
    }

    if (!isIncremental) {
      if (!data.hasOlder) break;
      // Use oldest comment's timestamp for next before-based page
      params.before = String(comments[comments.length - 1].created);
      // Drop after, use before only
    }

    // Throttle
    await new Promise(r => setTimeout(r, 300));
  }

  logSync("SW", `Synced ${totalNew} comments (incremental: ${isIncremental})`);
  return totalNew;
}

async function syncUploads(me: string, fromPopup: boolean) {
  const lastMeta = await db.meta.get("lastUploadId");
  const lastId = (lastMeta?.value as number) || 0;
  const isIncremental = lastId > 0;

  let newer: number | undefined = isIncremental ? lastId : undefined;
  let older: number | undefined = isIncremental ? undefined : undefined;
  let totalNew = 0;
  let page = 0;

  while (true) {
    const params: Record<string, string> = { user: me, flags: "15" };
    if (newer !== undefined) params.newer = String(newer);
    if (older !== undefined) params.older = String(older);

    const data = (await fetchAPI("/items/get", params)) as Record<string, unknown> | null;
    if (!data || data.error) break;

    const items = data.items as import("./shared/types").Upload[] | undefined;
    if (!items || items.length === 0) break;

    // Early stop when all known
    const knownIds = new Set(
      (await db.uploads.where("id").anyOf(items.map(i => i.id)).toArray()).map(i => i.id)
    );
    const newItems = items.filter(i => !knownIds.has(i.id));

    if (isIncremental && newItems.length === 0) break;

    const now = Date.now();
    const synced = newItems.map((it) => ({ ...it, syncedAt: now }));
    await db.uploads.bulkPut(synced);
    await db.meta.put({ key: "lastSync", value: now });
    totalNew += newItems.length;
    page++;

    // Track highest ID
    const maxId = Math.max(...items.map(i => i.id));
    await db.meta.put({ key: "lastUploadId", value: maxId });

    if (fromPopup) sendSyncProgress("uploads", page, 0, totalNew);

    if (data.atEnd) break;

    newer = isIncremental ? Math.max(...items.map(i => i.id)) : undefined;
    if (!isIncremental) older = items[items.length - 1].id;

    await new Promise(r => setTimeout(r, 300));
  }

  logSync("SW", `Synced ${totalNew} uploads (incremental: ${isIncremental})`);
  return totalNew;
}

async function syncFilters() {
  const data = (await fetchAPI("/bookmarks/get")) as Record<string, unknown> | null;
  if (!data || data.error) return 0;
  const bookmarks = data.bookmarks as import("./shared/types").FilterBookmark[] | undefined;
  if (!bookmarks || bookmarks.length === 0) return 0;
  const now = Date.now();
  const synced = bookmarks.map((b) => ({ ...b, syncedAt: now }));
  await db.filters.bulkPut(synced);
  return synced.length;
}

async function syncCollections() {
  const data = (await fetchAPI("/collections/get")) as Record<string, unknown> | null;
  if (!data || data.error) return 0;
  const collections = data.collections as import("./shared/types").Collection[] | undefined;
  if (!collections || collections.length === 0) return 0;
  const now = Date.now();
  const synced = collections.map((c) => ({ ...c, syncedAt: now }));
  await db.collections.bulkPut(synced);
  return synced.length;
}

async function syncInbox(me: string) {
  const lastMeta = await db.meta.get("lastInboxTs");
  const lastTs = (lastMeta?.value as number) || 0;

  // Nutze /inbox/pending — markiert nichts als gelesen
  const data = (await fetchAPI("/inbox/pending")) as Record<string, unknown> | null;
  if (!data || data.error) return 0;

  const messages = data.messages as import("./shared/types").Message[] | undefined;
  if (!messages || messages.length === 0) return 0;

  // Early stop: nur neue Nachrichten seit letztem Sync
  const newMessages = lastTs > 0
    ? messages.filter(m => m.created > lastTs)
    : messages;

  if (newMessages.length === 0) return 0;

  const now = Date.now();
  const synced = newMessages.map((m) => ({ ...m, syncedAt: now }));
  await db.messages.bulkPut(synced);

  const maxTs = Math.max(...newMessages.map(m => m.created));
  await db.meta.put({ key: "lastInboxTs", value: maxTs });
  await db.meta.put({ key: "lastSync", value: now });

  logSync("SW", `Stored ${synced.length} new inbox messages`);
  return synced.length;
}

async function handleSyncStart(scope: string): Promise<VaultStats> {
  // Get username from cookie
  const meCookie = await browser.cookies.get({
    url: "https://pr0gramm.com",
    name: "me",
  });
  if (!meCookie) throw new Error("Nicht eingeloggt — bitte pr0gramm.com besuchen.");

  const decoded = JSON.parse(decodeURIComponent(meCookie.value));
  const me: string = decoded.n || "";

  if (!me) throw new Error("Username nicht gefunden.");

  const doAll = scope === "all";
  const doUploads = doAll || scope === "uploads";
  const doComments = doAll || scope === "comments";
  const doFilters = doAll || scope === "filters";
  const doCollections = doAll || scope === "collections";
  const doInbox = doAll || scope === "inbox";

  if (doUploads) await syncUploads(me, true);
  if (doComments) await syncComments(me, true);
  if (doFilters) { try { await syncFilters(); } catch(e) { logErr("SW", `Filter sync error: ${String(e)}`); } }
  if (doCollections) { try { await syncCollections(); } catch(e) { logErr("SW", `Collection sync error: ${String(e)}`); } }
  if (doInbox) { try { await syncInbox(me); } catch(e) { logErr("SW", `Inbox sync error: ${String(e)}`); } }

  const stats = await getStats();
  const complete: SyncCompleteMessage = { type: "SYNC_COMPLETE", stats };
  browser.runtime.sendMessage(complete).catch(() => {});

  return stats;
}

// ---- Search ----

async function handleSearch(query: string, limit: number) {
  const comments = await db.comments.toArray();
  const messages = await db.messages.toArray();

  const all: Array<Comment | Message & { _type: string }> = [
    ...comments.map((c) => ({ ...c, _type: "comment" })),
    ...messages.map((m) => ({ ...m, _type: "message" })),
  ];

  const fuse = new Fuse(all, {
    keys: ["content", "message"],
    threshold: 0.4,
    minMatchCharLength: 2,
    includeScore: true,
    includeMatches: true,
  });

  const fuseResults = fuse.search(query).slice(0, limit);
  return fuseResults.map((r) => ({ ...r, score: r.score ?? 0 }));
}

// ---- Stats ----

async function getStats(): Promise<VaultStats> {
  const stats = await db.getStats();
  // Estimate storage — very rough
  const storageBytes = stats.uploads * 512 + stats.comments * 256;
  return { ...stats, storageBytes };
}

// ---- Export ----

async function handleExport(
  format: "json" | "zip",
  scope: "all" | "comments" | "uploads"
): Promise<{ success: boolean; filename?: string; error?: string }> {
  try {
    const uploads = scope === "all" || scope === "uploads" ? await db.uploads.toArray() : [];
    const comments = scope === "all" || scope === "comments" ? await db.comments.toArray() : [];
    const filters = scope === "all" ? await db.filters.toArray() : [];
    const collections = scope === "all" ? await db.collections.toArray() : [];
    const messages = scope === "all" ? await db.messages.toArray() : [];

    const collectionItems = scope === "all"
      ? await db.collectionItems.toArray()
      : [];
    const collectionMap = new Map<number, number[]>();
    for (const ci of collectionItems) {
      const arr = collectionMap.get(ci.collectionId) || [];
      arr.push(ci.itemId);
      collectionMap.set(ci.collectionId, arr);
    }

    const data: ExportData = {
      exportDate: new Date().toISOString(),
      pr0VaultVersion: "0.1.0",
      user: await getUsername(),
      uploads: uploads.map(({ thumbBlob, fullBlob, ...rest }) => rest),
      comments,
      filters,
      collections: collections.map((c) => ({
        collection: c,
        items: collectionMap.get(c.id) || [],
      })),
      messages,
    };

    const dateStr = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);

      await browser.downloads.download({
        url,
        filename: `pr0vault-export-${dateStr}.json`,
        saveAs: true,
      });

      return { success: true, filename: `pr0vault-export-${dateStr}.json` };
    } else {
      // ZIP export
      const JSZipModule = await import("jszip");
      const JSZip = JSZipModule.default;
      const zip = new JSZip();

      zip.file("data.json", JSON.stringify(data, null, 2));

      // Add thumbnails if available
      for (const upload of uploads) {
        if (upload.thumbBlob) {
          zip.file(
            `uploads/${upload.id}.jpg`,
            upload.thumbBlob,
            { binary: true }
          );
        }
      }

      const readme = `pr0Vault Export\n==============\nDatum: ${data.exportDate}\nUser: ${data.user}\nUploads: ${data.uploads.length}\nComments: ${data.comments.length}\n`;
      zip.file("README.txt", readme);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);

      await browser.downloads.download({
        url,
        filename: `pr0vault-export-${dateStr}.zip`,
        saveAs: true,
      });

      return { success: true, filename: `pr0vault-export-${dateStr}.zip` };
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
