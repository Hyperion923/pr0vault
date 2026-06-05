// pr0Vault — Service Worker (Background)
// Handles all messages, DB operations, search, and export.

import { db } from "./shared/db";
import Fuse from "fuse.js";
import { logSync, logErr } from "./shared/logger";
import type {
  VaultMessage,
  VaultResponse,
  SyncProgressMessage,
  SyncCompleteMessage,
} from "./shared/messages";
import type { VaultStats, Comment, Message, ExportData } from "./shared/types";

// ---- Alarm Handler (Auto-Sync) ----

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "pr0vault-sync") {
    logSync("SW", "Auto-Sync triggered");
    handleSyncStart("all").catch((e) => logErr("SW", `Auto-Sync error: ${String(e)}`));
  }
});

// ---- Message Router ----

chrome.runtime.onMessage.addListener(
  (msg: VaultMessage, _sender, sendResponse: (r: VaultResponse) => void) => {
    switch (msg.type) {
      case "STORE_BATCH":
        handleStoreBatch(msg.payload);
        sendResponse({ success: true });
        break;

      case "SYNC_START":
        logSync("SW", `Sync gestartet: ${msg.scope}`);
        handleSyncStart(msg.scope).then((stats) => {
          logSync("SW", `Sync fertig: ${JSON.stringify(stats)}`);
          sendResponse(stats);
        }).catch(e => {
          logErr("SW", `Sync Fehler: ${String(e)}`);
          sendResponse({ success: false, error: String(e) });
        });
        break;

      case "QUERY_SEARCH":
        handleSearch(msg.query, msg.limit ?? 50).then((results) =>
          sendResponse({ results })
        );
        break;

      case "GET_STATS":
        getStats().then((stats) => sendResponse(stats));
        break;

      case "EXPORT":
        handleExport(msg.format, msg.scope).then((result) =>
          sendResponse(result)
        );
        break;
    }

    return true; // Keep channel open for async
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
  chrome.runtime.sendMessage(msg).catch(() => {});
}

async function getPr0Cookies(): Promise<string> {
  const [pp, me] = await Promise.all([
    chrome.cookies.get({ url: "https://pr0gramm.com", name: "pp" }),
    chrome.cookies.get({ url: "https://pr0gramm.com", name: "me" }),
  ]);
  if (!pp || !me) throw new Error("Nicht eingeloggt — bitte pr0gramm.com besuchen.");
  return `pp=${pp.value}; me=${me.value}`;
}

async function getUsername(): Promise<string> {
  try {
    const meCookie = await chrome.cookies.get({ url: "https://pr0gramm.com", name: "me" });
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
  const tabs = await chrome.tabs.query({ url: "https://pr0gramm.com/*" });
  const tab = tabs[0];
  if (tab?.id) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id!, { type: "FETCH_API", endpoint, params }, (resp) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(resp);
      });
    });
  }

  throw new Error("Kein pr0gramm-Tab aktiv und kein Cookie verfügbar.");
}

async function syncComments(me: string, fromPopup: boolean) {
  let before = Math.floor(Date.now() / 1000);
  let page = 0;
  let totalNew = 0;

  while (true) {
    const params: Record<string, string> = { name: me, flags: "15", before: String(before) };

    const data = (await fetchAPI("/profile/comments", params)) as Record<
      string,
      unknown
    > | null;
    if (!data || data.error) break;

    const comments = data.comments as Comment[] | undefined;
    if (!comments || comments.length === 0) break;

    const now = Date.now();
    await db.comments.bulkPut(comments);
    await db.meta.put({ key: "lastSync", value: now });
    totalNew += comments.length;
    page++;

    if (fromPopup) {
      sendSyncProgress("comments", page, 0, totalNew);
    }

    if (!data.hasOlder) break;

    // Use the oldest comment's timestamp for next page
    const oldest = comments[comments.length - 1];
    before = oldest.created;
  }

  return totalNew;
}

async function syncUploads(me: string, fromPopup: boolean) {
  let older: number | undefined;
  let page = 0;
  let totalNew = 0;

  while (true) {
    const params: Record<string, string> = {
      user: me,
      flags: "15",
    };
    if (older !== undefined) params.older = String(older);

    const data = (await fetchAPI("/items/get", params)) as Record<
      string,
      unknown
    > | null;
    if (!data || data.error) break;

    const items = data.items as import("./shared/types").Upload[] | undefined;
    if (!items || items.length === 0) break;

    const now = Date.now();
    const synced = items.map((it) => ({ ...it, syncedAt: now }));
    await db.uploads.bulkPut(synced);
    await db.meta.put({ key: "lastSync", value: now });
    totalNew += items.length;
    page++;

    if (fromPopup) {
      sendSyncProgress("uploads", page, 0, totalNew);
    }

    if (data.atEnd) break;

    older = items[items.length - 1].id;
  }

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
  logSync("SW", `Stored ${synced.length} filters`);
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
  logSync("SW", `Stored ${synced.length} collections`);
  return synced.length;
}

async function syncInbox(me: string) {
  let older = Math.floor(Date.now() / 1000);
  let page = 0;
  let totalNew = 0;

  while (true) {
    const params: Record<string, string> = { older: String(older) };

    const data = (await fetchAPI("/inbox/all", params)) as Record<string, unknown> | null;
    if (!data || data.error) break;

    const messages = data.messages as import("./shared/types").Message[] | undefined;
    if (!messages || messages.length === 0) break;

    const now = Date.now();
    const synced = messages.map((m) => ({ ...m, syncedAt: now }));
    await db.messages.bulkPut(synced);
    totalNew += synced.length;
    page++;

    if (data.atEnd) break;

    older = messages[messages.length - 1].created;
  }

  logSync("SW", `Stored ${totalNew} inbox messages`);
  return totalNew;
}

async function handleSyncStart(scope: string): Promise<VaultStats> {
  // Get username from cookie
  const meCookie = await chrome.cookies.get({
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
  chrome.runtime.sendMessage(complete).catch(() => {});

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

      await chrome.downloads.download({
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

      await chrome.downloads.download({
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
