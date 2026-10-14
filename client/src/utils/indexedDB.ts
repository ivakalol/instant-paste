import type { ClipboardItem } from '../types/ClipboardItem';

const DB_NAME = 'InstantPasteDB';
const STORE_NAME = 'clipboardHistory';

const openDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
  request.onsuccess = () => resolve(request.result);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'roomId' });
  };
});

// Resolve only after commit, and close every connection on success or failure.
async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('History transaction failed.'));
    });
  } finally {
    db.close();
  }
}

export const saveHistory = async (roomId: string, history: ClipboardItem[]): Promise<void> => {
  if (roomId) await withStore('readwrite', store => store.put({ roomId, history }));
};

export const loadHistory = async (roomId: string): Promise<ClipboardItem[] | null> => {
  if (!roomId) return null;
  const record = await withStore('readonly', store => store.get(roomId));
  if (!Array.isArray(record?.history)) return null;
  return record.history.filter((item: unknown): item is ClipboardItem => {
    if (!item || typeof item !== 'object') return false;
    const value = item as ClipboardItem;
    return typeof value.id === 'string' && typeof value.content === 'string'
      && (value.type === 'text' || value.type === 'rich-text') && Number.isFinite(value.timestamp);
  });
};

export const clearHistory = async (roomId: string): Promise<void> => {
  if (roomId) await withStore('readwrite', store => store.delete(roomId));
};
