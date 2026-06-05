// pr0Vault — Message Protocol

import type { Upload, Comment, FilterBookmark, Message, VaultStats, Collection, CollectionItem } from "./types";

// --- Content Script → Service Worker ---

export interface StoreBatchMessage {
  type: "STORE_BATCH";
  payload: {
    uploads?: Upload[];
    comments?: Comment[];
    filters?: FilterBookmark[];
    messages?: Message[];
    collections?: Collection[];
    collectionItems?: CollectionItem[];
  };
}

// --- Popup → Service Worker ---

export interface SyncStartMessage {
  type: "SYNC_START";
  scope: "all" | "uploads" | "comments" | "filters" | "collections" | "inbox";
}

export interface QuerySearchMessage {
  type: "QUERY_SEARCH";
  query: string;
  limit?: number;
}

export interface GetStatsMessage {
  type: "GET_STATS";
}

export interface ExportMessage {
  type: "EXPORT";
  format: "json" | "zip";
  scope: "all" | "comments" | "uploads";
}

export interface CacheThumbMessage {
  type: "CACHE_THUMB";
  itemId: number;
  blobBase64: string;
}

export interface GetCollectionsMessage {
  type: "GET_COLLECTIONS";
}

export interface GetCollectionItemsMessage {
  type: "GET_COLLECTION_ITEMS";
  collectionId: number;
  offset?: number;
  limit?: number;
}

// --- Service Worker → Popup ---

export interface SyncProgressMessage {
  type: "SYNC_PROGRESS";
  scope: string;
  page: number;
  total: number;
  newItems: number;
  done?: boolean;
}

export interface SyncCompleteMessage {
  type: "SYNC_COMPLETE";
  stats: VaultStats;
}

// --- Service Worker → Content Script ---

export interface FetchApiMessage {
  type: "FETCH_API";
  endpoint: string;
  params: Record<string, string>;
}

// --- Union Type ---

export type VaultMessage =
  | StoreBatchMessage
  | SyncStartMessage
  | QuerySearchMessage
  | GetStatsMessage
  | ExportMessage
  | CacheThumbMessage
  | GetCollectionsMessage
  | GetCollectionItemsMessage
  | SyncProgressMessage
  | SyncCompleteMessage
  | FetchApiMessage;

export type VaultResponse =
  | VaultStats
  | { results: { score: number; item: unknown }[] }
  | { success: boolean; filename?: string }
  | { success: boolean; error?: string }
  | { data: unknown }
  | { collections: Collection[]; counts: Record<number, number> }
  | { items: CollectionItem[]; atEnd: boolean }
  | void;
