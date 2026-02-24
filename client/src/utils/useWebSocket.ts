import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage, RoomState } from '../types/index';
import {
  generateE2eeKeyPair,
  encryptFor,
  decryptFrom,
  E2eeKeyPair,
  generateDataKey,
  exportDataKey,
  importDataKey,
  encryptChunk,
  decryptChunk,
} from './e2ee';
import {
  cleanupStaleTransfers,
} from './fileChunkStore';

const CHUNK_SIZE           = 1024 * 1024; // 1MB – fits in 2MB WS frame even with AES-GCM overhead (+28 B)
const BUFFER_HIGH_WATER    = 8 * 1024 * 1024; // 8MB – allow more in-flight data before pausing

interface UseWebSocketReturn {
  roomState: RoomState;
  sendMessage: (message: WebSocketMessage) => Promise<boolean>;
  uploadFile?: (file: File, fileId: string, previewContent?: string) => void;
  createRoom: () => Promise<string | null>;
  joinRoom: (roomId: string) => Promise<boolean>;
  leaveRoom: () => void;
  isE2eeEnabled: boolean;
  isReady: boolean;
  encryptFiles: boolean;
  setEncryptFiles: (enabled: boolean) => void;
}

interface RoomClient {
  id: string;
  publicKey?: JsonWebKey;
}

interface ActiveFileTransfer {
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
}

type EncryptedPayload = string | Record<string, string>;

// ---- Binary frame helpers ------------------------------------------------
// Format: [2B fileId-length][fileId UTF-8][4B chunkIndex][4B totalChunks][...data]
const encodeBinaryFrame = (
  fileId: string,
  chunkIndex: number,
  totalChunks: number,
  data: Uint8Array,
): ArrayBuffer => {
  const enc = new TextEncoder();
  const idBytes = enc.encode(fileId);
  const headerLen = 2 + idBytes.length + 4 + 4;
  const buf = new ArrayBuffer(headerLen + data.byteLength);
  const view = new DataView(buf);
  let o = 0;
  view.setUint16(o, idBytes.length); o += 2;
  new Uint8Array(buf, o, idBytes.length).set(idBytes); o += idBytes.length;
  view.setUint32(o, chunkIndex); o += 4;
  view.setUint32(o, totalChunks); o += 4;
  new Uint8Array(buf, o).set(data);
  return buf;
};
const decodeBinaryFrame = (
  buf: ArrayBuffer,
): { fileId: string; chunkIndex: number; totalChunks: number; data: Uint8Array } => {
  const view = new DataView(buf);
  let o = 0;
  const idLen = view.getUint16(o); o += 2;
  const fileId = new TextDecoder().decode(new Uint8Array(buf, o, idLen)); o += idLen;
  const chunkIndex = view.getUint32(o); o += 4;
  const totalChunks = view.getUint32(o); o += 4;
  // slice() copies the data so it has its own ArrayBuffer
  const data = new Uint8Array(buf.slice(o));
  return { fileId, chunkIndex, totalChunks, data };
};



export const useWebSocket = (
  onClipboardReceived?: (message: WebSocketMessage) => void,
  onFileTransferUpdate?: (update: WebSocketMessage) => void,
  initialRoomId?: string
): UseWebSocketReturn => {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onClipboardReceivedRef = useRef(onClipboardReceived);
  const onFileTransferUpdateRef = useRef(onFileTransferUpdate);
  const reconnectAttemptRef = useRef<number>(0);
  
  const [roomState, setRoomState] = useState<RoomState>({
    roomId: null,
    connected: false,
    clientCount: 0,
    clientId: null,
  });
  const [keyPair, setKeyPair] = useState<E2eeKeyPair | null>(null);
  const [roomClients, setRoomClients] = useState<Record<string, RoomClient>>({});
  const [isE2eeEnabled, setIsE2eeEnabled] = useState(window.isSecureContext);
  const [isReady, setIsReady] = useState(false);
  const [encryptFiles, setEncryptFiles] = useState(false);
  const activeTransfers = useRef<Map<string, ActiveFileTransfer>>(new Map());
  const pendingDataKeys = useRef<Map<string, CryptoKey>>(new Map());
  const orphanBinaryChunks = useRef<Map<string, ArrayBuffer[]>>(new Map());

  const pendingRoomCreation = useRef<(roomId: string | null) => void>();
  const pendingRoomJoin = useRef<(success: boolean) => void>();

  const onMessageRef = useRef((event: MessageEvent) => {});

  const encryptForRecipients = useCallback(async (plainText: string): Promise<Record<string, string> | null> => {
    if (!isE2eeEnabled || !keyPair || !roomState.clientId) {
      return null;
    }

    const allRecipients = Object.values(roomClients).filter(client => client.id !== roomState.clientId);
    if (allRecipients.length === 0) {
      return null;
    }

    const recipientsMissingPublicKey = allRecipients.some((client) => !client.publicKey);
    if (recipientsMissingPublicKey) {
      return null;
    }

    const encryptedEntries = await Promise.all(
      allRecipients.map(async (recipient) => {
        const encryptedValue = await encryptFor(plainText, keyPair.privateKey, recipient.publicKey!);
        return [recipient.id, encryptedValue] as const;
      })
    );

    return Object.fromEntries(encryptedEntries);
  }, [isE2eeEnabled, keyPair, roomClients, roomState.clientId]);

  const getEncryptedValueForCurrentClient = useCallback((payload?: EncryptedPayload): string | null => {
    if (!payload) {
      return null;
    }
    if (typeof payload === 'string') {
      return payload;
    }
    if (!roomState.clientId) {
      return null;
    }
    return payload[roomState.clientId] || null;
  }, [roomState.clientId]);

  const decryptFromSender = useCallback(async (payload: EncryptedPayload | undefined, senderId?: string): Promise<string | null> => {
    if (!isE2eeEnabled || !keyPair || !senderId) {
      return null;
    }

    const encryptedValue = getEncryptedValueForCurrentClient(payload);
    if (!encryptedValue) {
      return null;
    }

    const sender = roomClients[senderId];
    if (!sender?.publicKey) {
      return null;
    }

    return decryptFrom(encryptedValue, keyPair.privateKey, sender.publicKey);
  }, [getEncryptedValueForCurrentClient, isE2eeEnabled, keyPair, roomClients]);

  const withDecryptedMetadata = useCallback(async (message: WebSocketMessage): Promise<WebSocketMessage> => {
    if (!message.fileId || !message.encryptedMetadata) {
      return message;
    }

    const decryptedMetadata = await decryptFromSender(message.encryptedMetadata, message.senderId);
    if (!decryptedMetadata) {
      return message;
    }

    try {
      const parsed = JSON.parse(decryptedMetadata);
      return {
        ...message,
        fileName: parsed.fileName,
        fileSize: parsed.fileSize,
        fileType: parsed.fileType,
        contentType: parsed.contentType,
        previewContent: parsed.previewContent,
      };
    } catch (error) {
      console.error('Failed to parse decrypted metadata', error);
      return message;
    }
  }, [decryptFromSender]);

  useEffect(() => {
    onClipboardReceivedRef.current = onClipboardReceived;
    onFileTransferUpdateRef.current = onFileTransferUpdate;
  }, [onClipboardReceived, onFileTransferUpdate]);

  useEffect(() => {
    const initKeyPair = async () => {
      // Housekeeping: remove transfers older than 24 h on every load
      cleanupStaleTransfers().catch(() => {});

      let e2eeEnabled = window.isSecureContext;
      try {
        if (!window.isSecureContext) {
          console.warn('Disabling E2EE: running in an insecure context.');
          e2eeEnabled = false;
        } else {
          const pair = await generateE2eeKeyPair();
          setKeyPair(pair);
        }
      } catch (error) {
        console.error('Failed to initialize key pair, disabling E2EE:', error);
        e2eeEnabled = false;
      } finally {
        setIsE2eeEnabled(e2eeEnabled);
        setIsReady(true);
      }
    };
    initKeyPair();
  }, []);

  // In-memory buffers for all receive paths (encrypted & plain)
  const memoryChunks = useRef<Map<string, (ArrayBuffer | null)[]>>(new Map());

  const handleBinaryChunk = useCallback(async (frameData: ArrayBuffer) => {
    const { fileId, chunkIndex, totalChunks, data: chunkData } = decodeBinaryFrame(frameData);

    const transfer = activeTransfers.current.get(fileId);
    if (!transfer || transfer.totalChunks === 0) {
      // Chunk arrived before metadata – store as orphan
      if (!orphanBinaryChunks.current.has(fileId)) {
        orphanBinaryChunks.current.set(fileId, []);
      }
      orphanBinaryChunks.current.get(fileId)!.push(frameData);
      return;
    }

    // Skip duplicates
    if (transfer.receivedChunks.has(chunkIndex)) return;

    // Decrypt if encrypted, otherwise use raw bytes
    let plainBytes: Uint8Array;
    if (transfer.dataKey) {
      try {
        plainBytes = await decryptChunk(chunkData, transfer.dataKey);
      } catch (e) {
        console.error(`Chunk ${chunkIndex} decryption failed for ${fileId}:`, e);
        onFileTransferUpdateRef.current?.({
          type: 'file-error', fileId, message: 'Chunk decryption failed',
        });
        return;
      }
    } else {
      plainBytes = chunkData;
    }

    // Store in memory
    if (!memoryChunks.current.has(fileId)) {
      memoryChunks.current.set(fileId, new Array(totalChunks).fill(null));
    }
    const buf: ArrayBuffer = plainBytes.buffer.byteLength === plainBytes.byteLength
      ? (plainBytes.buffer as ArrayBuffer)
      : (plainBytes.buffer as ArrayBuffer).slice(plainBytes.byteOffset, plainBytes.byteOffset + plainBytes.byteLength);
    memoryChunks.current.get(fileId)![chunkIndex] = buf;
    transfer.receivedChunks.add(chunkIndex);

    // Progress (throttled: ~every 2%)
    const progress = (transfer.receivedChunks.size / totalChunks) * 100;
    if (progress - (transfer as any)._lastProgress >= 2 || transfer.receivedChunks.size === totalChunks) {
      (transfer as any)._lastProgress = progress;
      onFileTransferUpdateRef.current?.({
        type: 'file-progress', fileId, progress,
      });
    }

    // Completion – assemble from memory
    if (transfer.receivedChunks.size === totalChunks) {
      try {
        const chunks = memoryChunks.current.get(fileId)!;
        const blob = new Blob(chunks.map(b => new Uint8Array(b!)), {
          type: transfer.metadata.fileType || 'application/octet-stream',
        });
        const contentUrl = URL.createObjectURL(blob);
        console.log(`[useWebSocket] File complete: fileId=${fileId}, contentUrl=${contentUrl}`);
        onFileTransferUpdateRef.current?.({
          type: 'file-complete', fileId, content: contentUrl,
        });
      } catch (e) {
        console.error('File assembly failed:', e);
        onFileTransferUpdateRef.current?.({
          type: 'file-error', fileId, message: 'File assembly failed',
        });
      } finally {
        memoryChunks.current.delete(fileId);
        activeTransfers.current.delete(fileId);
      }
    }
  }, []);

  useEffect(() => {
    onMessageRef.current = async (event: MessageEvent) => {
      // Binary frames are file-chunk data – route to the binary handler
      if (event.data instanceof ArrayBuffer) {
        await handleBinaryChunk(event.data);
        return;
      }

      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'room-update':
            setRoomState({
              roomId: message.roomId || null,
              connected: true,
              clientCount: message.clientCount || 0,
              clientId: message.clientId || roomState.clientId,
            });
            setRoomClients(message.clients.reduce((acc: any, client: any) => {
              acc[client.id] = client;
              return acc;
            }, {}));
            if (pendingRoomCreation.current && message.roomId) {
              pendingRoomCreation.current(message.roomId);
              pendingRoomCreation.current = undefined;
            }
            if (pendingRoomJoin.current) {
              pendingRoomJoin.current(true);
              pendingRoomJoin.current = undefined;
            }
            break;

          case 'file-key':
            // Decrypt the per-file data key using ECDH
            if (message.encryptedDataKey && message.senderId && message.fileId) {
              const decryptedKeyB64 = await decryptFromSender(
                message.encryptedDataKey, message.senderId,
              );
              if (decryptedKeyB64) {
                try {
                  const dataKey = await importDataKey(decryptedKeyB64);
                  const transfer = activeTransfers.current.get(message.fileId);
                  if (transfer) {
                    transfer.dataKey = dataKey;
                  } else {
                    // Key arrived before file-start – park it
                    pendingDataKeys.current.set(message.fileId, dataKey);
                  }
                } catch (e) {
                  console.error('Failed to import data key:', e);
                }
              }
            }
            break;

          case 'file-start':
            if (message.fileId) {
              const transfer: ActiveFileTransfer = {
                totalChunks: 0,
                receivedChunks: new Set(),
                metadata: {},
                senderId: message.senderId,
                createdAt: Date.now(),
              };
              // Attach data key if it arrived before file-start
              const pendingKey = pendingDataKeys.current.get(message.fileId);
              if (pendingKey) {
                transfer.dataKey = pendingKey;
                pendingDataKeys.current.delete(message.fileId);
              }
              activeTransfers.current.set(message.fileId, transfer);

              if (onClipboardReceivedRef.current) {
                const fileStartMessage = await withDecryptedMetadata(message);
                onClipboardReceivedRef.current(fileStartMessage);
              }
            }
            break;

          case 'clipboard':
            if (onClipboardReceivedRef.current) {
              let clipboardMessage = await withDecryptedMetadata(message);

              // Decrypt text content
              if (!clipboardMessage.fileId && clipboardMessage.encryptedContent) {
                const decryptedContent = await decryptFromSender(
                  clipboardMessage.encryptedContent, clipboardMessage.senderId,
                );
                if (decryptedContent !== null) {
                  clipboardMessage = { ...clipboardMessage, content: decryptedContent };
                } else {
                  clipboardMessage = { ...clipboardMessage, content: '[Unable to decrypt message]' };
                }
              }

              // File-transfer metadata update
              if (clipboardMessage.fileId && clipboardMessage.totalChunks) {
                const transfer = activeTransfers.current.get(clipboardMessage.fileId);
                if (transfer) {
                  transfer.totalChunks = clipboardMessage.totalChunks;
                  transfer.metadata = {
                    fileName: clipboardMessage.fileName,
                    fileSize: clipboardMessage.fileSize,
                    fileType: clipboardMessage.fileType,
                    contentType: clipboardMessage.contentType,
                    previewContent: clipboardMessage.previewContent,
                  };
                }

                // Process any binary chunks that arrived before metadata
                if (orphanBinaryChunks.current.has(clipboardMessage.fileId)) {
                  const chunks = orphanBinaryChunks.current.get(clipboardMessage.fileId)!;
                  console.log(`Processing ${chunks.length} orphaned binary chunks for ${clipboardMessage.fileId}.`);
                  for (const chunkFrame of chunks) {
                    await handleBinaryChunk(chunkFrame);
                  }
                  orphanBinaryChunks.current.delete(clipboardMessage.fileId);
                }
              }
              onClipboardReceivedRef.current(clipboardMessage);
            }
            break;

          case 'chunk-ack':
            // Received by the sender; used for resumability tracking
            break;

          case 'file-chunk':
            // Legacy JSON chunk path – kept for backward compat, should not fire
            console.warn('Received legacy file-chunk JSON message');
            break;

          case 'error':
            console.error('WebSocket error:', message.message);
            if (pendingRoomJoin.current) {
              pendingRoomJoin.current(false);
              pendingRoomJoin.current = undefined;
            }
            if (message.fileId && onFileTransferUpdateRef.current) {
              onFileTransferUpdateRef.current({ type: 'file-error', fileId: message.fileId, message: message.message });
              activeTransfers.current.delete(message.fileId);
            }
            break;

          case 'reload':
            window.location.reload();
            break;

          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }, [decryptFromSender, handleBinaryChunk, roomState.clientId, withDecryptedMetadata]);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws.current = new WebSocket(wsUrl);
    ws.current.binaryType = 'arraybuffer'; // receive binary chunks as ArrayBuffer

    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setRoomState(prev => ({ ...prev, connected: true }));
      reconnectAttemptRef.current = 0;
      
      if (initialRoomId) {
        const joinMessage: WebSocketMessage = {
          type: 'join',
          roomId: initialRoomId,
          ...(isE2eeEnabled && keyPair && { publicKey: keyPair.publicKey }),
        };
        ws.current?.send(JSON.stringify(joinMessage));
      }
    };

    ws.current.onmessage = (event) => onMessageRef.current(event);

    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
      setRoomState(prev => ({ ...prev, connected: false, clientCount: 0, clientId: null }));
      reconnectAttemptRef.current += 1;
      const delay = Math.min(3000 * Math.pow(2, reconnectAttemptRef.current - 1), 30000);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (ws.current?.readyState === WebSocket.CLOSED) {
          console.log(`Reconnecting... attempt ${reconnectAttemptRef.current} (delay: ${delay}ms)`);
          connect();
        }
      }, delay);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [initialRoomId, keyPair, isE2eeEnabled]);

  useEffect(() => {
    if (isReady) {
      connect();
    }
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      ws.current?.close();
    };
  }, [connect, isReady]);

  const sendMessage = useCallback(async (message: WebSocketMessage): Promise<boolean> => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      let messageToSend: WebSocketMessage = { ...message };
      const recipients = Object.values(roomClients).filter(client => client.id !== roomState.clientId);
      const requiresEncryption = isE2eeEnabled && recipients.length > 0;
      
      const isText = message.type === 'clipboard' && !message.fileId && message.content;
      const isFileMetadata = (message.type === 'file-start') || (message.type === 'clipboard' && !!message.fileId);

      if (isFileMetadata) {
        const metadataToEncrypt = {
          fileName: message.fileName,
          fileSize: message.fileSize,
          fileType: message.fileType,
          contentType: message.contentType,
          previewContent: message.previewContent,
        };
        const hasMetadata = Object.values(metadataToEncrypt).some(value => value !== undefined);
        if (hasMetadata) {
          const encryptedMetadata = await encryptForRecipients(JSON.stringify(metadataToEncrypt));
          if (!encryptedMetadata && requiresEncryption) {
            console.error('Blocked insecure metadata send: E2EE required but metadata encryption failed.');
            return false;
          }
          if (encryptedMetadata) {
            messageToSend = {
              ...messageToSend,
              fileName: undefined,
              fileSize: undefined,
              fileType: undefined,
              contentType: undefined,
              previewContent: undefined,
              encryptedMetadata,
            };
          }
        }
      }

      if (isText) {
        const contentToEncrypt = message.content!;
        const encryptedContent = await encryptForRecipients(contentToEncrypt);
        if (!encryptedContent && requiresEncryption) {
          console.error('Blocked insecure text send: E2EE required but content encryption failed.');
          return false;
        }
        if (encryptedContent) {
          messageToSend = { ...messageToSend, content: undefined, encryptedContent };
        }
      }

      if (message.type === 'file-chunk' && message.chunk) {
        const encryptedChunk = await encryptForRecipients(message.chunk);
        if (!encryptedChunk && requiresEncryption) {
          console.error('Blocked insecure file chunk send: E2EE required but chunk encryption failed.');
          return false;
        }
        if (encryptedChunk) {
          messageToSend = { ...messageToSend, chunk: undefined, encryptedChunk };
        }
      }

      ws.current.send(JSON.stringify(messageToSend));
      return true;
    }
    return false;
  }, [encryptForRecipients, isE2eeEnabled, roomClients, roomState.clientId]);

  const uploadFile = useCallback(async (file: File, fileId: string, previewContent?: string) => {
    const recipients = Object.values(roomClients).filter(c => c.id !== roomState.clientId);
    const requiresFileEncryption = isE2eeEnabled && encryptFiles && recipients.length > 0;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // ---- 1. Generate & distribute per-file data key (encrypted once per recipient via ECDH) ----
    let dataKey: CryptoKey | undefined;
    if (requiresFileEncryption) {
      try {
        dataKey = await generateDataKey();
        const dataKeyB64 = await exportDataKey(dataKey);
        const encryptedDataKey = await encryptForRecipients(dataKeyB64);
        if (!encryptedDataKey) {
          onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Failed to encrypt data key for recipients' });
          return;
        }
        const keySent = await sendMessage({ type: 'file-key', fileId, encryptedDataKey } as WebSocketMessage);
        if (!keySent) {
          onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Failed to send data key' });
          return;
        }
      } catch (e) {
        console.error('Data key generation/distribution failed:', e);
        onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Encryption setup failed' });
        return;
      }
    }

    // ---- 2. Announce metadata (JSON, per-recipient encrypted via existing path) ----
    const fileStartSent = await sendMessage({
      type: 'file-start',
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });
    if (!fileStartSent) {
      onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Failed to send file start metadata' });
      return;
    }

    const fileMetadataSent = await sendMessage({
      type: 'clipboard',
      contentType: file.type.startsWith('image/') ? 'image'
        : file.type.startsWith('video/') ? 'video'
        : file.type.startsWith('audio/') ? 'audio' : 'file',
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      totalChunks,
      previewContent,
    });
    if (!fileMetadataSent) {
      onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Failed to send file metadata' });
      return;
    }

    // ---- 3. Stream chunks as binary WebSocket frames with backpressure ----
    let lastReportedProgress = 0;
    for (let i = 0; i < totalChunks; i++) {
      // Connection check
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
        onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Connection lost during upload' });
        return;
      }

      // Flow control: wait until the browser's send buffer drains
      while (ws.current.bufferedAmount > BUFFER_HIGH_WATER) {
        await new Promise(r => setTimeout(r, 50));
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
          onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Connection lost during upload' });
          return;
        }
      }

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const rawChunk = new Uint8Array(await file.slice(start, end).arrayBuffer());

      let payload: Uint8Array;
      if (dataKey) {
        payload = await encryptChunk(rawChunk, dataKey);
      } else {
        payload = rawChunk;
      }

      const frame = encodeBinaryFrame(fileId, i, totalChunks, payload);
      ws.current.send(frame);

      // Throttled progress updates (~every 2%)
      const progress = ((i + 1) / totalChunks) * 100;
      if (progress - lastReportedProgress >= 2 || i === totalChunks - 1) {
        onFileTransferUpdateRef.current?.({ type: 'file-progress', fileId, progress });
        lastReportedProgress = progress;
      }
    }
  }, [sendMessage, encryptForRecipients, isE2eeEnabled, encryptFiles, roomClients, roomState.clientId]);

  const createRoom = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      pendingRoomCreation.current = resolve;
      const message: WebSocketMessage = { type: 'create' };
      if (isE2eeEnabled && keyPair) message.publicKey = keyPair.publicKey;
      ws.current?.send(JSON.stringify(message));
    });
  }, [keyPair, isE2eeEnabled]);

  const joinRoom = useCallback((roomId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      pendingRoomJoin.current = resolve;
      const message: WebSocketMessage = {
        type: 'join',
        roomId,
        ...(isE2eeEnabled && keyPair && { publicKey: keyPair.publicKey }),
      };
      ws.current?.send(JSON.stringify(message));
    });
  }, [keyPair, isE2eeEnabled]);

  const leaveRoom = useCallback(() => {
    ws.current?.send(JSON.stringify({ type: 'leave' }));
    setRoomState({ roomId: null, connected: true, clientCount: 0, clientId: null });
    setRoomClients({});
  }, []);

  return {
    roomState,
    sendMessage,
    uploadFile,
    createRoom,
    joinRoom,
    leaveRoom,
    isE2eeEnabled,
    isReady,
    encryptFiles,
    setEncryptFiles,
  };
};