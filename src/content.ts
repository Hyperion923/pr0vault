// pr0Vault — Content Script (injected on pr0gramm.com)
// Intercepts fetch/XHR API responses and mirrors them to IndexedDB via Service Worker.

import type { Upload, Comment, Message, FilterBookmark, Collection, CollectionItem } from "./shared/types";
import type { StoreBatchMessage } from "./shared/messages";
import { logSync, logErr } from "./shared/logger";

interface PendingBatch {
  uploads?: Upload[];
  comments?: Comment[];
  messages?: Message[];
  filters?: FilterBookmark[];
  collections?: Collection[];
  collectionItems?: CollectionItem[];
}

let pendingBatch: PendingBatch = {};
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (Object.keys(pendingBatch).length > 0) {
    const msg: StoreBatchMessage = {
      type: "STORE_BATCH",
      payload: pendingBatch,
    };
    console.log("[pr0Vault CS] Flushing batch:", Object.keys(pendingBatch).map(k => `${k}:${((pendingBatch as Record<string, unknown[]>)[k]).length}`).join(", "));
    // Send synchronously to ensure data is not lost
    try {
      chrome.runtime.sendMessage(msg, () => {
        if (chrome.runtime.lastError) {
          console.error("[pr0Vault CS] sendMessage error:", chrome.runtime.lastError.message);
        }
      });
    } catch {
      // silent
    }
    pendingBatch = {};
  }
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
}

function enqueue(table: keyof PendingBatch, items: unknown[]) {
  if (!items || items.length === 0) return;

  const existing = pendingBatch[table] || [];
  (pendingBatch[table] as unknown[]) = [...existing, ...items];

  // Flush immediately — no batching to avoid data loss
  flush();
}

// ---- API Response Handlers ----

function handleItemsGet(data: Record<string, unknown>) {
  const items = data.items as Upload[] | undefined;
  if (items && Array.isArray(items)) {
    enqueue("uploads", items);
  }
}

function handleProfileInfo(data: Record<string, unknown>) {
  const comments = data.comments as Comment[] | undefined;
  if (comments && Array.isArray(comments)) {
    enqueue("comments", comments);
  }
      // Store collections from profile info (includes preview items)
      const profileCollections = data.collections as any[] | undefined;
      if (profileCollections?.length) {
        console.log(`[pr0Vault CS] Found ${profileCollections.length} collections in profile/info`);
        const now = Date.now();
    const cols: Collection[] = [];
    const citems: CollectionItem[] = [];
    for (const pc of profileCollections) {
      cols.push({
        id: pc.id,
        name: pc.name ?? "",
        keyword: pc.keyword ?? "",
        isPublic: !!pc.isPublic,
        isDefault: !!pc.isDefault,
        isCurated: false,
        syncedAt: now,
      });
      if (pc.items?.length) {
        for (const it of pc.items) {
          citems.push({
            collectionId: pc.id,
            itemId: it.id,
            userId: 0,
            user: "",
            created: 0,
            image: "",
            thumb: it.thumb ?? "",
            flags: it.flags ?? 0,
            mark: 0,
            up: 0,
            down: 0,
            tags: [],
            syncedAt: now,
          });
        }
      }
    }
    if (cols.length) enqueue("collections", cols);
    if (citems.length) enqueue("collectionItems", citems);
  }
}

function handleInbox(data: Record<string, unknown>, url: string) {
  let messages: Message[] | undefined;
  if (data.messages && Array.isArray(data.messages)) {
    messages = data.messages as Message[];
  }

  if (messages) {
    const now = Date.now();
    const typed: Message[] = messages.map((m) => ({
      ...m,
      syncedAt: now,
    }));
    enqueue("messages", typed);
  }
}

function handleApiResponse(url: string, data: unknown) {
  if (!data || typeof data !== "object") return;
  const obj = data as Record<string, unknown>;

  try {
    // Only intercept items/get when filtered by user (not the main feed)
    if (url.includes("/items/get") && url.includes("user=")) {
      logSync("CS", `Intercepted /items/get: ${(obj.items as unknown[])?.length ?? 0} items`);
      handleItemsGet(obj);
    }
    if (url.includes("/profile/info")) {
      const obj = data as Record<string, unknown>;
      logSync("CS", `Intercepted /profile/info: ${(obj.comments as unknown[])?.length ?? 0} comments`);
      handleProfileInfo(obj);
      // Also backup inbox/messages from profile info if present
      if (obj.messages && Array.isArray(obj.messages)) {
        handleInbox(obj, url);
      }
    }
    if (url.includes("/profile/comments")) {
      logSync("CS", `Intercepted /profile/comments`);
      handleProfileInfo(obj);
    }
    if (url.includes("/bookmarks/get")) {
      logSync("CS", `Intercepted /bookmarks/get`);
      const obj = data as Record<string, unknown>;
      const bookmarks = obj.bookmarks as FilterBookmark[] | undefined;
      if (bookmarks?.length) enqueue("filters", bookmarks);
    }
    if (url.includes("/collections/get")) {
      logSync("CS", `Intercepted /collections/get`);
      const colData = data as Record<string, unknown>;
      const allCols = (colData.collections || colData.curatorCollections) as any[] | undefined;
      if (allCols?.length) {
        const now = Date.now();
        const cols: Collection[] = allCols.map((c: any) => ({
          id: c.id ?? 0,
          name: c.name ?? "",
          keyword: c.keyword ?? "",
          isPublic: !!c.isPublic,
          isDefault: !!c.isDefault,
          isCurated: false,
          syncedAt: now,
        }));
        enqueue("collections", cols);
      }
    }
    if (url.includes("/inbox/")) {
      logSync("CS", `Intercepted inbox: ${url}`);
      handleInbox(obj, url);
    }
  } catch (e) {
    logErr("CS", `handleApiResponse error: ${String(e)}`);
  }
}

// ---- Fetch Interception ----

const originalFetch = window.fetch;

window.fetch = async function pr0VaultFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await originalFetch(input, init);

  try {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : "";

    if (url.includes("/api/")) {
      const clone = response.clone();
      const json = await clone.json();
      handleApiResponse(url, json);
    }
  } catch {
    // Ignore non-JSON or clone failures
  }

  return response;
};

// ---- Active Sync Proxy ----

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "FETCH_API") {
    const { endpoint, params } = msg;
    const url = new URL(`/api${endpoint}`, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
    }

    fetch(url.toString(), { credentials: "include" })
      .then((r) => r.json())
      .then(sendResponse)
      .catch((err) => sendResponse({ error: String(err) }));

    return true; // Keep message channel open for async response
  }
});
