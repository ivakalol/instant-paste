// src/utils/indexedDB.ts

const DB_NAME = 'InstantPasteDB';
const DB_VERSION = 1;
const STORE_NAME = 'clipboardHistory';

interface HistoryRecord {
  roomId: string;
  history: any[];
}

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(new Error('Failed to open IndexedDB.'));
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'roomId' });
      }
    };
  });
};

export const saveHistory = async (roomId: string, history: any[]): Promise<void> => {
  if (!roomId) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const record: HistoryRecord = { roomId, history };
    const request = store.put(record);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Failed to save history to IndexedDB.'));
  });
};

export const loadHistory = async (roomId: string): Promise<any[] | null> => {
    if (!roomId) return null;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(roomId);

        request.onsuccess = () => {
            const record = request.result as HistoryRecord | undefined;
            resolve(record ? record.history : null);
        };
        request.onerror = () => reject(request.error || new Error('Failed to load history from IndexedDB.'));
    });
};

export const clearHistory = async (roomId: string): Promise<void> => {
    if (!roomId) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(roomId);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Failed to clear history from IndexedDB.'));
    });
};
