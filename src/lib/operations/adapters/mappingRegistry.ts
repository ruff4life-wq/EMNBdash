import type { CanonicalField } from "../types";

export const COLUMN_MAPPINGS_STORAGE_KEY = "ebsfk_column_mappings";

export type AppField = CanonicalField;

export interface ColumnMapping {
  id: string;
  fingerprint: string;
  /** Human label for settings list */
  label: string;
  /** Maps canonical field → source column header title */
  mapping: Partial<Record<AppField, string>>;
  createdAt: string;
}

export interface MappingRegistry {
  save(entry: Omit<ColumnMapping, "id" | "createdAt"> & { id?: string }): ColumnMapping;
  find(fingerprint: string): ColumnMapping | undefined;
  list(): ColumnMapping[];
  delete(id: string): boolean;
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const parseList = (raw: string | null): ColumnMapping[] => {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? (data as ColumnMapping[]) : [];
  } catch {
    return [];
  }
};

/** djb2 on sorted normalized headers joined with pipe */
export function fingerprintFromHeaders(headers: string[]): string {
  const normalized = headers
    .map((h) => h.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const joined = normalized.join("|");
  let hash = 5381;
  for (let i = 0; i < joined.length; i += 1) {
    hash = (hash * 33) ^ joined.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Persistence adapter injected by caller (pass browser `localStorage` from client code only).
 */
export function createLocalStorageMappingStore(storage: StorageLike, key = COLUMN_MAPPINGS_STORAGE_KEY): MappingRegistry {
  const read = (): ColumnMapping[] => parseList(storage.getItem(key));

  const write = (list: ColumnMapping[]) => {
    storage.setItem(key, JSON.stringify(list));
  };

  return {
    save(entry) {
      const list = read().filter((e) => e.fingerprint !== entry.fingerprint && e.id !== entry.id);
      const row: ColumnMapping = {
        id: entry.id ?? `map_${(Date.now() + Math.random()).toString(36).slice(2)}`,
        fingerprint: entry.fingerprint,
        label: entry.label,
        mapping: { ...entry.mapping },
        createdAt: new Date().toISOString(),
      };
      list.push(row);
      write(list);
      return row;
    },
    find(fingerprint) {
      return read().find((e) => e.fingerprint === fingerprint);
    },
    list() {
      return [...read()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    delete(id) {
      const list = read();
      const next = list.filter((e) => e.id !== id);
      if (next.length === list.length) return false;
      write(next);
      return true;
    },
  };
}

export function createMemoryMappingRegistry(seed: ColumnMapping[] = []): MappingRegistry {
  let rows = [...seed];
  return {
    save(entry) {
      const row: ColumnMapping = {
        id: entry.id ?? `map_${rows.length}`,
        fingerprint: entry.fingerprint,
        label: entry.label,
        mapping: { ...entry.mapping },
        createdAt: new Date().toISOString(),
      };
      rows = rows.filter((r) => r.id !== row.id);
      rows.push(row);
      return row;
    },
    find(fingerprint) {
      return rows.find((e) => e.fingerprint === fingerprint);
    },
    list() {
      return [...rows];
    },
    delete(id) {
      const before = rows.length;
      rows = rows.filter((e) => e.id !== id);
      return rows.length < before;
    },
  };
}
