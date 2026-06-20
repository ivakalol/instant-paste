// Handles incoming binary file chunks: reassembly, decryption, and completion.

import { decodeBinaryFrame } from './binaryProtocol';
import { decryptChunk } from '../utils/e2ee';
import { WebSocketMessage } from '../types';

const MAX_ORPHAN_BINARY_CHUNKS_PER_FILE = 32;

export interface ActiveFileTransfer {
  dataKey?: CryptoKey;
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
}

export const createFileReceiverState = (): FileReceiverState => ({
  activeTransfers: new Map(),
  memoryChunks: new Map(),
  orphanBinaryChunks: new Map(),
  pendingDataKeys: new Map(),
});

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

  const transfer = state.activeTransfers.get(fileId);
  if (!transfer || transfer.totalChunks === 0) {
    if (!state.orphanBinaryChunks.has(fileId)) {
      state.orphanBinaryChunks.set(fileId, []);
    }
    const orphanChunks = state.orphanBinaryChunks.get(fileId)!;
    if (orphanChunks.length >= MAX_ORPHAN_BINARY_CHUNKS_PER_FILE) {
      onError({ type: 'file-error', fileId, message: 'Received file chunks before metadata' });
      state.orphanBinaryChunks.delete(fileId);
      return;
    }
    orphanChunks.push(frameData);
    return;
  }

  if (transfer.totalChunks !== totalChunks) {
    onError({ type: 'file-error', fileId, message: 'File chunk metadata mismatch' });
    return;
  }

  if (transfer.receivedChunks.has(chunkIndex)) return;

  let plainBytes: Uint8Array;
  if (transfer.dataKey) {
    try {
      plainBytes = await decryptChunk(chunkData, transfer.dataKey);
    } catch (e) {
      console.error(`Chunk ${chunkIndex} decryption failed for ${fileId}:`, e);
      onError({ type: 'file-error', fileId, message: 'Chunk decryption failed' });
      return;
    }
  } else {
    plainBytes = chunkData;
  }

  if (!state.memoryChunks.has(fileId)) {
    state.memoryChunks.set(fileId, new Array(totalChunks).fill(null));
  }

  state.memoryChunks.get(fileId)![chunkIndex] = plainBytes;
  transfer.receivedChunks.add(chunkIndex);

  const progress = (transfer.receivedChunks.size / totalChunks) * 100;
  if (progress - transfer._lastProgress >= 2 || transfer.receivedChunks.size === totalChunks) {
    transfer._lastProgress = progress;
    onProgress({ type: 'file-progress', fileId, progress });
  }

  if (transfer.receivedChunks.size === totalChunks) {
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
      state.memoryChunks.delete(fileId);
      state.activeTransfers.delete(fileId);
    }
  }
};
