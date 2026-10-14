import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage, RoomState } from '../types/index';
import { generateE2eeKeyPair, importDataKey, E2eeKeyPair } from '../utils/e2ee';
import { cleanupStaleTransfers } from '../utils/fileChunkStore';

import {
  encryptForRecipients as _encryptForRecipients,
  decryptFromSender as _decryptFromSender,
  decryptMetadata,
} from '../services/wsEncryption';
import {
  handleBinaryChunk as _handleBinaryChunk,
  createFileReceiverState,
  ActiveFileTransfer,
  clearReceivedFile,
} from '../services/fileReceiver';
import { uploadFile as _uploadFile } from '../services/fileUploader';

// ─── Types ───────────────────────────────────────────────────

interface UseWebSocketReturn {
  roomState: RoomState;
  sendMessage: (message: WebSocketMessage) => Promise<boolean>;
  uploadFile?: (file: File, fileId: string, previewContent?: string, uploadToken?: string, collection?: FileUploadCollection) => void;
  createRoom: () => Promise<string | null>;
  joinRoom: (roomId: string) => Promise<boolean>;
  leaveRoom: () => void;
  isE2eeEnabled: boolean;
  isReady: boolean;
  roomError: string | null;
  encryptFiles: boolean;
  setEncryptFiles: (enabled: boolean) => void;
}

interface RoomClient {
  id: string;
  publicKey?: JsonWebKey;
}

interface FileUploadCollection {
  collectionId: string;
  collectionTotal: number;
  collectionIndex: number;
}

// ─── Hook ────────────────────────────────────────────────────

export const useWebSocket = (
  onClipboardReceived?: (message: WebSocketMessage) => void,
  onFileTransferUpdate?: (update: WebSocketMessage) => void,
  initialRoomId?: string,
): UseWebSocketReturn => {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onClipboardReceivedRef = useRef(onClipboardReceived);
  const onFileTransferUpdateRef = useRef(onFileTransferUpdate);
  const reconnectAttemptRef = useRef<number>(0);
  const shouldReconnectRef = useRef(true);

  const [roomState, setRoomState] = useState<RoomState>({
    roomId: null, connected: false, clientCount: 0, clientId: null,
  });
  const [keyPair, setKeyPair] = useState<E2eeKeyPair | null>(null);
  const [roomClients, setRoomClients] = useState<Record<string, RoomClient>>({});
  const [isE2eeEnabled, setIsE2eeEnabled] = useState(window.isSecureContext);
  const [isReady, setIsReady] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [encryptFiles, setEncryptFiles] = useState(false);

  const receiverState = useRef(createFileReceiverState());
  const uploads = useRef(new Map<string, AbortController>());
  const pendingRoomCreation = useRef<(roomId: string | null) => void>();
  const pendingRoomJoin = useRef<(success: boolean) => void>();
  const onMessageRef = useRef<(_event: MessageEvent) => Promise<void>>(async () => {});
  const encryptionContextRef = useRef({ isE2eeEnabled, keyPair, roomClients, clientId: roomState.clientId });
  encryptionContextRef.current = { isE2eeEnabled, keyPair, roomClients, clientId: roomState.clientId };

  const resetTransfers = useCallback(() => {
    uploads.current.forEach(controller => controller.abort());
    uploads.current.clear();
    for (const fileId of receiverState.current.activeTransfers.keys()) {
      onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Connection lost during transfer' });
    }
    receiverState.current.activeTransfers.clear();
    receiverState.current.memoryChunks.clear();
    receiverState.current.orphanBinaryChunks.clear();
    receiverState.current.pendingDataKeys.clear();
    receiverState.current.encryptedFiles.clear();
  }, []);

  // Keep callback refs up to date
  useEffect(() => {
    onClipboardReceivedRef.current = onClipboardReceived;
    onFileTransferUpdateRef.current = onFileTransferUpdate;
  }, [onClipboardReceived, onFileTransferUpdate]);

  // ── Encryption helpers (wrapping service functions) ────────

  const encryptForRecipients = useCallback(
    (plainText: string) => _encryptForRecipients(plainText, {
      isE2eeEnabled, keyPair, roomClients, clientId: roomState.clientId,
    }),
    [isE2eeEnabled, keyPair, roomClients, roomState.clientId],
  );

  const decryptFromSender = useCallback(
    (payload: WebSocketMessage['encryptedContent'], senderId?: string) =>
      _decryptFromSender(payload, senderId, encryptionContextRef.current),
    [],
  );

  const withDecryptedMetadata = useCallback(
    (message: WebSocketMessage) => decryptMetadata(message, encryptionContextRef.current),
    [],
  );

  // ── Init E2EE key pair ─────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      cleanupStaleTransfers().catch(() => {});
      let e2ee = window.isSecureContext;
      try {
        if (!window.isSecureContext) {
          e2ee = false;
        } else {
          const generated = await generateE2eeKeyPair();
          if (!cancelled) setKeyPair(generated);
        }
      } catch {
        e2ee = false;
      } finally {
        if (!cancelled) {
          setIsE2eeEnabled(e2ee);
          setIsReady(true);
        }
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // ── Binary chunk handler ───────────────────────────────────

  const handleBinaryChunk = useCallback((frameData: ArrayBuffer) => {
    return _handleBinaryChunk(
      frameData,
      receiverState.current,
      (u) => onFileTransferUpdateRef.current?.(u),
      (u) => onFileTransferUpdateRef.current?.(u),
      (u) => onFileTransferUpdateRef.current?.(u),
    );
  }, []);

  // ── Message handler (assigned to ref, always up-to-date) ───

  onMessageRef.current = async (event: MessageEvent) => {
    const receivingSocket = ws.current;
    if (event.data instanceof ArrayBuffer) {
      await handleBinaryChunk(event.data);
      return;
    }

    let message: WebSocketMessage | undefined;
    try {
      message = JSON.parse(event.data) as WebSocketMessage;
      if (!message || typeof message !== 'object') return;

      switch (message.type) {
        case 'room-update':
          const clients = Array.isArray(message.clients) ? message.clients : [];
          // Update immediately: another frame may arrive before React renders this state.
          encryptionContextRef.current = {
            ...encryptionContextRef.current,
            clientId: message.clientId || encryptionContextRef.current.clientId,
            roomClients: Object.fromEntries(clients.map(c => [c.id, c])),
          };
          setRoomState({
            roomId: message.roomId || null,
            connected: true,
            clientCount: message.clientCount || 0,
            clientId: encryptionContextRef.current.clientId,
          });
          setRoomError(null);
          setRoomClients(clients.reduce((acc: any, c: any) => {
            acc[c.id] = c;
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
          if (message.encryptedDataKey && message.senderId && message.fileId) {
            if (receiverState.current.encryptedFiles.size >= 160 && !receiverState.current.encryptedFiles.has(message.fileId)) {
              receivingSocket?.close(1008, 'Too many pending file keys');
              return;
            }
            receiverState.current.encryptedFiles.add(message.fileId);
            const decryptedKeyB64 = await decryptFromSender(
              message.encryptedDataKey, message.senderId,
            );
            if (ws.current !== receivingSocket || receivingSocket?.readyState !== WebSocket.OPEN) return;
            if (decryptedKeyB64) {
              try {
                const dataKey = await importDataKey(decryptedKeyB64);
                if (ws.current !== receivingSocket || receivingSocket?.readyState !== WebSocket.OPEN) return;
                const transfer = receiverState.current.activeTransfers.get(message.fileId);
                if (transfer) {
                  transfer.dataKey = dataKey;
                } else {
                  receiverState.current.pendingDataKeys.set(message.fileId, dataKey);
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
              _lastProgress: 0,
              requiresEncryption: receiverState.current.encryptedFiles.has(message.fileId),
            };
            const pendingKey = receiverState.current.pendingDataKeys.get(message.fileId);
            if (pendingKey) {
              transfer.dataKey = pendingKey;
              receiverState.current.pendingDataKeys.delete(message.fileId);
            }
            receiverState.current.activeTransfers.set(message.fileId, transfer);

            if (onClipboardReceivedRef.current) {
              onClipboardReceivedRef.current(await withDecryptedMetadata(message));
            }
          }
          break;

        case 'clipboard':
          if (onClipboardReceivedRef.current) {
            let clipMsg = await withDecryptedMetadata(message);
            if (ws.current !== receivingSocket || receivingSocket?.readyState !== WebSocket.OPEN) return;

            if (!clipMsg.fileId && clipMsg.encryptedContent) {
              const decrypted = await decryptFromSender(clipMsg.encryptedContent, clipMsg.senderId);
              clipMsg = decrypted !== null
                ? { ...clipMsg, content: decrypted }
                : { ...clipMsg, content: '[Unable to decrypt message]' };
            }

            if (clipMsg.fileId && clipMsg.totalChunks) {
              const transfer = receiverState.current.activeTransfers.get(clipMsg.fileId);
              if (transfer) {
                transfer.totalChunks = clipMsg.totalChunks;
                transfer.metadata = {
                  fileName: clipMsg.fileName,
                  fileSize: clipMsg.fileSize,
                  fileType: clipMsg.fileType,
                  contentType: clipMsg.contentType,
                  previewContent: clipMsg.previewContent,
                };
              }

              if (receiverState.current.orphanBinaryChunks.has(clipMsg.fileId)) {
                const chunks = receiverState.current.orphanBinaryChunks.get(clipMsg.fileId)!;
                for (const chunk of chunks) await handleBinaryChunk(chunk);
                receiverState.current.orphanBinaryChunks.delete(clipMsg.fileId);
              }
            }
            onClipboardReceivedRef.current(clipMsg);
          }
          break;

        case 'chunk-ack':
          break;

        case 'file-cancel':
          if (message.fileId) {
            clearReceivedFile(receiverState.current, message.fileId);
            onFileTransferUpdateRef.current?.({
              type: 'file-error',
              fileId: message.fileId,
              message: 'File transfer was cancelled',
            });
          }
          break;

        case 'room-closed':
        case 'server-shutdown':
          setRoomState(prev => ({ ...prev, connected: false, clientCount: 0 }));
          break;

        case 'file-chunk':
          console.warn('Received legacy file-chunk JSON message');
          break;

        case 'error':
          console.error('WebSocket error:', message.message);
          if (!message.fileId) {
            setRoomError(message.message || 'The room could not be opened.');
          }
          if (pendingRoomJoin.current) {
            pendingRoomJoin.current(false);
            pendingRoomJoin.current = undefined;
          }
          pendingRoomCreation.current?.(null);
          pendingRoomCreation.current = undefined;
          if (message.fileId && onFileTransferUpdateRef.current) {
            uploads.current.get(message.fileId)?.abort();
            onFileTransferUpdateRef.current({
              type: 'file-error', fileId: message.fileId, message: message.message,
            });
            clearReceivedFile(receiverState.current, message.fileId);
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
      if (message?.fileId) {
        clearReceivedFile(receiverState.current, message.fileId);
        onFileTransferUpdateRef.current?.({ type: 'file-error', fileId: message.fileId, message: 'Invalid or unreadable file metadata' });
      }
    }
  };

  // ── Connection lifecycle ───────────────────────────────────

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    const socket = new WebSocket(wsUrl);
    ws.current = socket;
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      if (ws.current !== socket) return;
      setRoomState(prev => ({ ...prev, connected: true }));
      reconnectAttemptRef.current = 0;

      if (initialRoomId) {
        const joinMsg: WebSocketMessage = {
          type: 'join',
          roomId: initialRoomId,
          ...(isE2eeEnabled && keyPair && { publicKey: keyPair.publicKey }),
        };
        socket.send(JSON.stringify(joinMsg));
      }
    };

    // WebSocket delivery is ordered, but async handlers are not. Serialize decrypt/key/
    // metadata work as well, otherwise encrypted bytes may be assembled as plaintext.
    let messageQueue = Promise.resolve();
    let queuedBytes = 0;
    socket.onmessage = (event) => {
      const bytes = event.data instanceof ArrayBuffer ? event.data.byteLength : new Blob([event.data]).size;
      queuedBytes += bytes;
      if (queuedBytes > 128 * 1024 * 1024) {
        socket.close(1008, 'Receive queue exceeded');
        return;
      }
      messageQueue = messageQueue.then(async () => {
        if (ws.current === socket && socket.readyState === WebSocket.OPEN) {
          await onMessageRef.current(event);
        }
      }).catch(error => console.error('Failed to handle message:', error))
        .finally(() => { queuedBytes -= bytes; });
    };

    socket.onclose = () => {
      if (ws.current !== socket || !shouldReconnectRef.current) return;
      resetTransfers();
      pendingRoomCreation.current?.(null);
      pendingRoomJoin.current?.(false);
      pendingRoomCreation.current = undefined;
      pendingRoomJoin.current = undefined;
      setRoomClients({});
      setRoomState(prev => ({ ...prev, connected: false, clientCount: 0, clientId: null }));
      reconnectAttemptRef.current += 1;
      const delay = Math.min(3000 * Math.pow(2, reconnectAttemptRef.current - 1), 30000);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (shouldReconnectRef.current && ws.current === socket && socket.readyState === WebSocket.CLOSED) {
          connect();
        }
      }, delay);
    };

    socket.onerror = (error) => console.error('WebSocket error:', error);
  }, [initialRoomId, keyPair, isE2eeEnabled, resetTransfers]);

  useEffect(() => {
    if (isReady) {
      shouldReconnectRef.current = true;
      connect();
    }
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      pendingRoomCreation.current?.(null);
      pendingRoomJoin.current?.(false);
      pendingRoomCreation.current = undefined;
      pendingRoomJoin.current = undefined;
      const socket = ws.current;
      ws.current = null;
      socket?.close();
      resetTransfers();
    };
  }, [connect, isReady, resetTransfers]);

  // ── Send message (with E2EE) ───────────────────────────────

  const sendMessage = useCallback(async (message: WebSocketMessage): Promise<boolean> => {
    const socket = ws.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;

    try {
      let msg: WebSocketMessage = { ...message };
      const recipients = Object.values(roomClients).filter(c => c.id !== roomState.clientId);
      const requiresEncryption = isE2eeEnabled && recipients.length > 0;

      const isText = msg.type === 'clipboard' && !msg.fileId && msg.content;
      const isFileMeta = msg.type === 'file-start' || (msg.type === 'clipboard' && !!msg.fileId);

      if (isFileMeta) {
        const meta = {
          fileName: msg.fileName, fileSize: msg.fileSize, fileType: msg.fileType,
          contentType: msg.contentType, previewContent: msg.previewContent,
          collectionId: msg.collectionId, collectionTotal: msg.collectionTotal,
          collectionIndex: msg.collectionIndex,
        };
        if (Object.values(meta).some(v => v !== undefined)) {
          const encrypted = await encryptForRecipients(JSON.stringify(meta));
          if (!encrypted && requiresEncryption) return false;
          if (encrypted) {
            msg = {
              ...msg, fileName: undefined, fileSize: undefined, fileType: undefined,
              contentType: undefined, previewContent: undefined, collectionId: undefined,
              collectionTotal: undefined, collectionIndex: undefined, encryptedMetadata: encrypted,
            };
          }
        }
      }

      if (isText) {
        const encrypted = await encryptForRecipients(msg.content!);
        if (!encrypted && requiresEncryption) return false;
        if (encrypted) msg = { ...msg, content: undefined, encryptedContent: encrypted };
      }

      if (msg.type === 'file-chunk' && msg.chunk) {
        const encrypted = await encryptForRecipients(msg.chunk);
        if (!encrypted && requiresEncryption) return false;
        if (encrypted) msg = { ...msg, chunk: undefined, encryptedChunk: encrypted };
      }

      if (ws.current !== socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(msg));
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }, [encryptForRecipients, isE2eeEnabled, roomClients, roomState.clientId]);

  // ── Upload file (delegates to service) ─────────────────────

  const uploadFile = useCallback(async (file: File, fileId: string, previewContent?: string, uploadToken?: string, collection?: FileUploadCollection) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Not connected' });
      return;
    }

    const controller = new AbortController();
    uploads.current.set(fileId, controller);
    const uploadSocket = ws.current;
    try {
      await _uploadFile(file, fileId, previewContent, uploadToken, {
        ws: ws.current,
        sendMessage,
        encryptionCtx: { isE2eeEnabled, keyPair, roomClients, clientId: roomState.clientId },
        encryptFiles,
        signal: controller.signal,
        onUpdate: (u) => onFileTransferUpdateRef.current?.(u),
      }, collection);
    } catch (error) {
      onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: error instanceof Error ? error.message : 'Upload failed' });
      if (ws.current === uploadSocket) await sendMessage({ type: 'file-cancel', fileId });
    } finally {
      uploads.current.delete(fileId);
    }
  }, [sendMessage, isE2eeEnabled, keyPair, encryptFiles, roomClients, roomState.clientId]);

  // ── Room operations ────────────────────────────────────────

  const createRoom = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      setRoomError(null);
      if (pendingRoomCreation.current || pendingRoomJoin.current) { resolve(null); return; }
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
        resolve(null);
        return;
      }
      const timeout = setTimeout(() => {
        pendingRoomCreation.current?.(null);
        pendingRoomCreation.current = undefined;
      }, 15000);
      pendingRoomCreation.current = value => { clearTimeout(timeout); resolve(value); };
      const msg: WebSocketMessage = { type: 'create' };
      if (isE2eeEnabled && keyPair) msg.publicKey = keyPair.publicKey;
      ws.current?.send(JSON.stringify(msg));
    });
  }, [keyPair, isE2eeEnabled]);

  const joinRoom = useCallback((roomId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setRoomError(null);
      if (pendingRoomCreation.current || pendingRoomJoin.current) { resolve(false); return; }
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
        resolve(false);
        return;
      }
      const timeout = setTimeout(() => {
        pendingRoomJoin.current?.(false);
        pendingRoomJoin.current = undefined;
      }, 15000);
      pendingRoomJoin.current = value => { clearTimeout(timeout); resolve(value); };
      const msg: WebSocketMessage = {
        type: 'join', roomId,
        ...(isE2eeEnabled && keyPair && { publicKey: keyPair.publicKey }),
      };
      ws.current?.send(JSON.stringify(msg));
    });
  }, [keyPair, isE2eeEnabled]);

  const leaveRoom = useCallback(() => {
    const connected = ws.current?.readyState === WebSocket.OPEN;
    if (connected) ws.current?.send(JSON.stringify({ type: 'leave' }));
    resetTransfers();
    setRoomState({ roomId: null, connected, clientCount: 0, clientId: null });
    setRoomClients({});
  }, [resetTransfers]);

  return {
    roomState, sendMessage, uploadFile, createRoom, joinRoom, leaveRoom,
    isE2eeEnabled, isReady, roomError, encryptFiles, setEncryptFiles,
  };
};
