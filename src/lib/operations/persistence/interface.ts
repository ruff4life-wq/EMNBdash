export interface PersistenceAdapter {
  load<T>(key: string): Promise<T | null>;
  save<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
