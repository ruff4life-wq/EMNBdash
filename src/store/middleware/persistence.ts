import type { PersistenceAdapter } from "@/lib/operations/persistence/interface";

export const localStorageAdapter: PersistenceAdapter = {
  load: async <T,>(key: string) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  },
  save: async <T,>(key: string, value: T) => {
    localStorage.setItem(key, JSON.stringify(value));
  },
  delete: async (key: string) => {
    localStorage.removeItem(key);
  },
  clear: async () => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("ebsfk_"))
      .forEach((key) => localStorage.removeItem(key));
  },
};
