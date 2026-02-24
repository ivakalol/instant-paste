// src/utils/fileChunkStore.ts
// Persists incoming file-transfer chunks to IndexedDB so large files
// never need to live entirely in RAM.  Also stores checkpoints so
// interrupted transfers can be resumed.

const CHUNK_DB_NAME = 'InstantPasteFileTransfer';
const CHUNK_DB_VERSION = 1;
const CHUNK_STORE = 'chunks';
const CHECKPOINT_STORE = 'checkpoints';

interface ChunkRecord {
  key: string; // `${fileId}:${chunkIndex}`
  fileId: string;
  chunkIndex: number;
  data: ArrayBuffer;
}

export interface CheckpointRecord {
  fileId: string;
  totalChunks: number;
  receivedCount: number;
  receivedSet: number[]; // sorted indices of received chunks
  metadata: {
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    contentType?: string;
    previewContent?: string;
  };
  createdAt: number;
  updatedAt: number;
}

// ─── Database lifecycle ──────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(CHUNK_DB_NAME, CHUNK_DB_VERSION);
    request.onerror = () => {
      dbPromise = null;
      reject(new Error('Failed to open file-transfer DB'));
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const store = db.createObjectStore(CHUNK_STORE, { keyPath: 'key' });
        store.createIndex('fileId', 'fileId', { unique: false });
      }
      if (!db.objectStoreNames.contains(CHECKPOINT_STORE)) {
        db.createObjectStore(CHECKPOINT_STORE, { keyPath: 'fileId' });
      }
    };
  });
  return dbPromise;
};

// ─── Chunk operations ────────────────────────────────────────────────

export const storeChunk = async (
  fileId: string,
  chunkIndex: number,
  data: ArrayBuffer,
): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNK_STORE, 'readwrite');
    tx.objectStore(CHUNK_STORE).put({
      key: `${fileId}:${chunkIndex}`,
      fileId,
      chunkIndex,
      data,
    } as ChunkRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// ─── Checkpoint operations ───────────────────────────────────────────

export const saveCheckpoint = async (cp: CheckpointRecord): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHECKPOINT_STORE, 'readwrite');
    tx.objectStore(CHECKPOINT_STORE).put(cp);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getCheckpoint = async (fileId: string): Promise<CheckpointRecord | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHECKPOINT_STORE, 'readonly');
    const request = tx.objectStore(CHECKPOINT_STORE).get(fileId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
};

// ─── File assembly ───────────────────────────────────────────────────

/**
 * Reads all persisted chunks for a file, assembles them in order, and
 * returns a single Blob.  Throws if any chunk is missing.
 */
export const assembleFile = async (
  fileId: string,
  totalChunks: number,
  fileType: string,
): Promise<Blob> => {
  const db = await openDB();
  const chunks: ArrayBuffer[] = new Array(totalChunks);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNK_STORE, 'readonly');
    const index = tx.objectStore(CHUNK_STORE).index('fileId');
    const request = index.openCursor(IDBKeyRange.only(fileId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const record = cursor.value as ChunkRecord;
        chunks[record.chunkIndex] = record.data;
        cursor.continue();
      }
    };

    tx.oncomplete = () => {
      for (let i = 0; i < totalChunks; i++) {
        if (!chunks[i]) {
          reject(new Error(`Missing chunk ${i} for file ${fileId}`));
          return;
        }
      }
      resolve(new Blob(chunks, { type: fileType }));
    };

    tx.onerror = () => reject(tx.error);
  });
};

// ─── Cleanup ─────────────────────────────────────────────────────────

/**
 * Removes all chunks and the checkpoint for a given file transfer.
 */
export const deleteTransfer = async (fileId: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([CHUNK_STORE, CHECKPOINT_STORE], 'readwrite');

    // Delete all chunks
    const chunkStore = tx.objectStore(CHUNK_STORE);
    const idx = chunkStore.index('fileId');
    const cursorReq = idx.openKeyCursor(IDBKeyRange.only(fileId));
    cursorReq.onsuccess = () => {
      const c = cursorReq.result;
      if (c) {
        chunkStore.delete(c.primaryKey);
        c.continue();
      }
    };

    // Delete checkpoint
    tx.objectStore(CHECKPOINT_STORE).delete(fileId);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

/**
 * Removes transfers older than `maxAgeMs` (default 24 h).
 */
export const cleanupStaleTransfers = async (
  maxAgeMs: number = 24 * 60 * 60 * 1000,
): Promise<void> => {
  const db = await openDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([CHUNK_STORE, CHECKPOINT_STORE], 'readwrite');
    const cpStore = tx.objectStore(CHECKPOINT_STORE);
    const chunkStore = tx.objectStore(CHUNK_STORE);
    const chunkIdx = chunkStore.index('fileId');

    const request = cpStore.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const cp = cursor.value as CheckpointRecord;
        if (now - cp.createdAt > maxAgeMs) {
          // Delete associated chunks
          const cr = chunkIdx.openKeyCursor(IDBKeyRange.only(cp.fileId));
          cr.onsuccess = () => {
            const c = cr.result;
            if (c) {
              chunkStore.delete(c.primaryKey);
              c.continue();
            }
          };
          cursor.delete();
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
