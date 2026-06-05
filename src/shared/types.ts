// pr0Vault — Shared Types

export interface Tag {
  id: number;
  confidence: number;
  tag: string;
}

export interface Upload {
  id: number;
  image: string;
  thumb: string;
  flags: number;
  up: number;
  down: number;
  created: number;
  tags: Tag[];
  user: string;
  mark: number;
  promoted: number | null;
  thumbBlob?: Blob;
  fullBlob?: Blob;
  syncedAt: number;
}

export interface Comment {
  id: number;
  itemId: number;
  content: string;
  up: number;
  down: number;
  created: number;
  thumb: string;
}

export interface FilterBookmark {
  name: string;
  link: string;
  isDefault: boolean;
  syncedAt: number;
}

export interface Collection {
  id: number;
  name: string;
  keyword: string;
  isPublic: boolean;
  isDefault: boolean;
  syncedAt: number;
}

export interface CollectionMembership {
  collectionId: number;
  itemId: number;
  syncedAt: number;
}

export interface Message {
  id: number;
  type: string;
  name: string;
  message: string;
  itemId?: number;
  created: number;
  read: boolean;
  syncedAt: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export interface VaultStats {
  uploads: number;
  comments: number;
  filters: number;
  collections: number;
  messages: number;
  storageBytes: number;
  lastSync: number | null;
}

export interface ExportData {
  exportDate: string;
  pr0VaultVersion: string;
  user: string;
  uploads: Upload[];
  comments: Comment[];
  filters: FilterBookmark[];
  collections: { collection: Collection; items: number[] }[];
  messages: Message[];
}
