// pr0Vault — Message Protocol

import type { Upload, Comment, FilterBookmark, Message, VaultStats } from "./types";

// --- Content Script → Service Worker ---

export interface StoreBatchMessage {
  type: "STORE_BATCH";
  payload: {
    uploads?: Upload[];
    comments?: Comment[];
    filters?: FilterBookmark[];
    messages?: Message[];
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

// --- Service Worker → Popup ---

export interface SyncProgressMessage {
  type: "SYNC_PROGRESS";
  scope: string;
  page: number;
  total: number;
  newItems: number;
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
  | SyncProgressMessage
  | SyncCompleteMessage
  | FetchApiMessage;

export type VaultResponse =
  | VaultStats
  | { results: { score: number; item: unknown }[] }
  | { success: boolean; filename?: string }
  | { success: boolean; error?: string }
  | { data: unknown }
  | void;
