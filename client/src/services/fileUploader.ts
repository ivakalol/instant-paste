// Handles streaming file uploads over WebSocket with backpressure.

import { CHUNK_SIZE, BUFFER_HIGH_WATER, encodeBinaryFrame } from './binaryProtocol';
import { encryptChunk, generateDataKey, exportDataKey } from '../utils/e2ee';
import { WebSocketMessage } from '../types';
import { EncryptionContext, encryptForRecipients } from './wsEncryption';

export interface UploadDeps {
  ws: WebSocket;
  sendMessage: (msg: WebSocketMessage) => Promise<boolean>;
  encryptionCtx: EncryptionContext;
  encryptFiles: boolean;
  onUpdate: (update: WebSocketMessage) => void;
}

export const uploadFile = async (
  file: File,
  fileId: string,
  previewContent: string | undefined,
  deps: UploadDeps,
): Promise<void> => {
  const { ws, sendMessage, encryptionCtx, encryptFiles, onUpdate } = deps;

  const recipients = Object.values(encryptionCtx.roomClients)
    .filter(c => c.id !== encryptionCtx.clientId);
  const requiresEncryption = encryptionCtx.isE2eeEnabled && encryptFiles && recipients.length > 0;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // 1. Generate & distribute per-file data key
  let dataKey: CryptoKey | undefined;
  if (requiresEncryption) {
    try {
      dataKey = await generateDataKey();
      const dataKeyB64 = await exportDataKey(dataKey);
      const encryptedDataKey = await encryptForRecipients(dataKeyB64, encryptionCtx);
      if (!encryptedDataKey) {
        onUpdate({ type: 'file-error', fileId, message: 'Failed to encrypt data key for recipients' });
        return;
      }
      const keySent = await sendMessage({ type: 'file-key', fileId, encryptedDataKey } as WebSocketMessage);
      if (!keySent) {
        onUpdate({ type: 'file-error', fileId, message: 'Failed to send data key' });
        return;
      }
    } catch (e) {
      console.error('Data key generation/distribution failed:', e);
      onUpdate({ type: 'file-error', fileId, message: 'Encryption setup failed' });
      return;
    }
  }

  // 2. Announce metadata
  const fileStartSent = await sendMessage({
    type: 'file-start', fileId,
    fileName: file.name, fileSize: file.size, fileType: file.type,
  });
  if (!fileStartSent) {
    onUpdate({ type: 'file-error', fileId, message: 'Failed to send file start metadata' });
    return;
  }

  const fileMetaSent = await sendMessage({
    type: 'clipboard',
    contentType: file.type.startsWith('image/') ? 'image'
      : file.type.startsWith('video/') ? 'video'
      : file.type.startsWith('audio/') ? 'audio' : 'file',
    fileId, fileName: file.name, fileSize: file.size,
    fileType: file.type, totalChunks, previewContent,
  });
  if (!fileMetaSent) {
    onUpdate({ type: 'file-error', fileId, message: 'Failed to send file metadata' });
    return;
  }

  // 3. Stream chunks as binary frames with backpressure
  const reusableBuf = dataKey ? null : new Uint8Array(CHUNK_SIZE);
  let lastReportedProgress = 0;

  for (let i = 0; i < totalChunks; i++) {
    if (ws.readyState !== WebSocket.OPEN) {
      onUpdate({ type: 'file-error', fileId, message: 'Connection lost during upload' });
      return;
    }

    while (ws.bufferedAmount > BUFFER_HIGH_WATER) {
      await new Promise(r => setTimeout(r, 50));
      if (ws.readyState !== WebSocket.OPEN) {
        onUpdate({ type: 'file-error', fileId, message: 'Connection lost during upload' });
        return;
      }
    }

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkLen = end - start;
    const sliceAB = await file.slice(start, end).arrayBuffer();

    let payload: Uint8Array;
    if (dataKey) {
      payload = await encryptChunk(new Uint8Array(sliceAB), dataKey);
    } else {
      const view = new Uint8Array(sliceAB);
      if (reusableBuf && chunkLen === CHUNK_SIZE) {
        reusableBuf.set(view);
        payload = reusableBuf;
      } else {
        payload = view;
      }
    }

    const frame = encodeBinaryFrame(fileId, i, totalChunks, payload);
    ws.send(frame);

    const progress = ((i + 1) / totalChunks) * 100;
    if (progress - lastReportedProgress >= 2 || i === totalChunks - 1) {
      onUpdate({ type: 'file-progress', fileId, progress });
      lastReportedProgress = progress;
    }
  }

  // Signal upload complete so the sender's UI transitions to 'complete'
  onUpdate({ type: 'file-complete', fileId });
};
