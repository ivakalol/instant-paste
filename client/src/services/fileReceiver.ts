// Handles incoming binary file chunks: reassembly, decryption, and completion.

import { decodeBinaryFrame } from './binaryProtocol';
import { decryptChunk } from '../utils/e2ee';
import { WebSocketMessage } from '../types';

const MAX_ORPHAN_BYTES = 16 * 1024 * 1024;

export interface ActiveFileTransfer {
  dataKey?: CryptoKey;
  requiresEncryption?: boolean;
  receivedBytes?: number;
  totalChunks: number;
  receivedChunks: Set<number>;
  metadata: {
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    contentType?: string;
    previewContent?: string;
  };
  senderId?: string;
  createdAt: number;
  _lastProgress: number;
}

export interface FileReceiverState {
  activeTransfers: Map<string, ActiveFileTransfer>;
  memoryChunks: Map<string, (BlobPart | null)[]>;
  orphanBinaryChunks: Map<string, ArrayBuffer[]>;
  pendingDataKeys: Map<string, CryptoKey>;
  encryptedFiles: Set<string>;
}

export const createFileReceiverState = (): FileReceiverState => ({
  activeTransfers: new Map(),
  memoryChunks: new Map(),
  orphanBinaryChunks: new Map(),
  pendingDataKeys: new Map(),
  encryptedFiles: new Set(),
});

export const clearReceivedFile = (state: FileReceiverState, fileId: string): void => {
  state.activeTransfers.delete(fileId);
  state.memoryChunks.delete(fileId);
  state.orphanBinaryChunks.delete(fileId);
  state.pendingDataKeys.delete(fileId);
  state.encryptedFiles.delete(fileId);
};

export const handleBinaryChunk = async (
  frameData: ArrayBuffer,
  state: FileReceiverState,
  onProgress: (update: WebSocketMessage) => void,
  onComplete: (update: WebSocketMessage) => void,
  onError: (update: WebSocketMessage) => void,
): Promise<void> => {
  let decoded;
  try {
    decoded = decodeBinaryFrame(frameData);
  } catch (e) {
    console.error('Invalid binary file frame:', e);
    onError({ type: 'file-error', message: 'Invalid file chunk received' });
    return;
  }

  const { fileId, chunkIndex, totalChunks, data: chunkData } = decoded;
  const fail = (message: string) => {
    clearReceivedFile(state, fileId);
    onError({ type: 'file-error', fileId, message });
  };

  const transfer = state.activeTransfers.get(fileId);
  if (!transfer || transfer.totalChunks === 0) {
    if (!state.orphanBinaryChunks.has(fileId)) {
      state.orphanBinaryChunks.set(fileId, []);
    }
    const orphanChunks = state.orphanBinaryChunks.get(fileId)!;
    const orphanBytes = [...state.orphanBinaryChunks.values()]
      .reduce((sum, chunks) => sum + chunks.reduce((size, chunk) => size + chunk.byteLength, 0), 0);
    if (state.orphanBinaryChunks.size > 16 || orphanBytes + frameData.byteLength > MAX_ORPHAN_BYTES) {
      fail('Received file chunks before metadata');
      return;
    }
    orphanChunks.push(frameData);
    return;
  }

  if (transfer.totalChunks !== totalChunks) {
    fail('File chunk metadata mismatch');
    return;
  }

  if (transfer.receivedChunks.has(chunkIndex)) return;
  if (transfer.requiresEncryption && !transfer.dataKey) {
    fail('Unable to decrypt file key');
    return;
  }

  let plainBytes: Uint8Array;
  if (transfer.dataKey) {
    try {
      plainBytes = await decryptChunk(chunkData, transfer.dataKey);
    } catch (e) {
      console.error(`Chunk ${chunkIndex} decryption failed for ${fileId}:`, e);
      fail('Chunk decryption failed');
      return;
    }
  } else {
    plainBytes = chunkData;
  }

  // Decryption may finish after cancellation or socket cleanup.
  if (state.activeTransfers.get(fileId) !== transfer) return;
  transfer.receivedBytes = (transfer.receivedBytes || 0) + plainBytes.byteLength;
  if (transfer.metadata.fileSize !== undefined && transfer.receivedBytes > transfer.metadata.fileSize) {
    fail('File exceeds its declared size');
    return;
  }
  if (!state.memoryChunks.has(fileId)) {
    state.memoryChunks.set(fileId, new Array(totalChunks).fill(null));
  }

  // Blob parts can be backed by browser-managed storage instead of retaining JS buffers.
  state.memoryChunks.get(fileId)![chunkIndex] = new Blob([plainBytes]);
  transfer.receivedChunks.add(chunkIndex);

  const progress = (transfer.receivedChunks.size / totalChunks) * 100;
  if (progress - transfer._lastProgress >= 2 || transfer.receivedChunks.size === totalChunks) {
    transfer._lastProgress = progress;
    onProgress({ type: 'file-progress', fileId, progress });
  }

  if (transfer.receivedChunks.size === totalChunks) {
    if (transfer.metadata.fileSize !== undefined && transfer.receivedBytes !== transfer.metadata.fileSize) {
      fail('File size does not match metadata');
      return;
    }
    try {
      const chunks = state.memoryChunks.get(fileId)!;
      const blob = new Blob(chunks.map(b => b!), {
        type: transfer.metadata.fileType || 'application/octet-stream',
      });
      const contentUrl = URL.createObjectURL(blob);
      onComplete({ type: 'file-complete', fileId, content: contentUrl });
    } catch (e) {
      console.error('File assembly failed:', e);
      onError({ type: 'file-error', fileId, message: 'File assembly failed' });
    } finally {
      clearReceivedFile(state, fileId);
    }
  }
};
