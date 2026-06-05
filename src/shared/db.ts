// pr0Vault — IndexedDB via Dexie.js

import Dexie, { type Table } from "dexie";
import type {
  Upload,
  Comment,
  FilterBookmark,
  Collection,
  CollectionMembership,
  Message,
  MetaEntry,
} from "./types";

export class VaultDB extends Dexie {
  uploads!: Table<Upload, number>;
  comments!: Table<Comment, number>;
  filters!: Table<FilterBookmark, string>;
  collections!: Table<Collection, number>;
  collectionItems!: Table<CollectionMembership, [number, number]>;
  messages!: Table<Message, number>;
  meta!: Table<MetaEntry, string>;

  constructor() {
    super("pr0Vault");

    this.version(1).stores({
      uploads: "id, created, user, flags",
      comments: "id, itemId, created",
      filters: "name",
      collections: "id, name",
      collectionItems: "[collectionId+itemId], collectionId, itemId",
      messages: "id, type, created, fromUser",
      meta: "key",
    });
  }

  async getStats(): Promise<{
    uploads: number;
    comments: number;
    filters: number;
    collections: number;
    messages: number;
    lastSync: number | null;
  }> {
    const [uploads, comments, filters, collections, messages, lastSync] =
      await Promise.all([
        this.uploads.count(),
        this.comments.count(),
        this.filters.count(),
        this.collections.count(),
        this.messages.count(),
        this.meta.get("lastSync"),
      ]);

    return {
      uploads,
      comments,
      filters,
      collections,
      messages,
      lastSync: (lastSync?.value as number) ?? null,
    };
  }
}

export const db = new VaultDB();
