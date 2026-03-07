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
} from '../services/fileReceiver';
import { uploadFile as _uploadFile } from '../services/fileUploader';

// ─── Types ───────────────────────────────────────────────────

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

  const [roomState, setRoomState] = useState<RoomState>({
    roomId: null, connected: false, clientCount: 0, clientId: null,
  });
  const [keyPair, setKeyPair] = useState<E2eeKeyPair | null>(null);
  const [roomClients, setRoomClients] = useState<Record<string, RoomClient>>({});
  const [isE2eeEnabled, setIsE2eeEnabled] = useState(window.isSecureContext);
  const [isReady, setIsReady] = useState(false);
  const [encryptFiles, setEncryptFiles] = useState(false);

  const receiverState = useRef(createFileReceiverState());
  const pendingRoomCreation = useRef<(roomId: string | null) => void>();
  const pendingRoomJoin = useRef<(success: boolean) => void>();
  const onMessageRef = useRef((_event: MessageEvent) => {});

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
    (payload: any, senderId?: string) => _decryptFromSender(payload, senderId, {
      isE2eeEnabled, keyPair, roomClients, clientId: roomState.clientId,
    }),
    [isE2eeEnabled, keyPair, roomClients, roomState.clientId],
  );

  const withDecryptedMetadata = useCallback(
    (message: WebSocketMessage) => decryptMetadata(message, {
      isE2eeEnabled, keyPair, roomClients, clientId: roomState.clientId,
    }),
    [isE2eeEnabled, keyPair, roomClients, roomState.clientId],
  );

  // ── Init E2EE key pair ─────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      cleanupStaleTransfers().catch(() => {});
      let e2ee = window.isSecureContext;
      try {
        if (!window.isSecureContext) {
          e2ee = false;
        } else {
          setKeyPair(await generateE2eeKeyPair());
        }
      } catch {
        e2ee = false;
      } finally {
        setIsE2eeEnabled(e2ee);
        setIsReady(true);
      }
    };
    init();
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
          setRoomClients(message.clients.reduce((acc: any, c: any) => {
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
            const decryptedKeyB64 = await decryptFromSender(
              message.encryptedDataKey, message.senderId,
            );
            if (decryptedKeyB64) {
              try {
                const dataKey = await importDataKey(decryptedKeyB64);
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
                await Promise.all(chunks.map(c => handleBinaryChunk(c)));
                receiverState.current.orphanBinaryChunks.delete(clipMsg.fileId);
              }
            }
            onClipboardReceivedRef.current(clipMsg);
          }
          break;

        case 'chunk-ack':
          break;

        case 'file-chunk':
          console.warn('Received legacy file-chunk JSON message');
          break;

        case 'error':
          console.error('WebSocket error:', message.message);
          if (pendingRoomJoin.current) {
            pendingRoomJoin.current(false);
            pendingRoomJoin.current = undefined;
          }
          if (message.fileId && onFileTransferUpdateRef.current) {
            onFileTransferUpdateRef.current({
              type: 'file-error', fileId: message.fileId, message: message.message,
            });
            receiverState.current.activeTransfers.delete(message.fileId);
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

  // ── Connection lifecycle ───────────────────────────────────

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws.current = new WebSocket(wsUrl);
    ws.current.binaryType = 'arraybuffer';

    ws.current.onopen = () => {
      setRoomState(prev => ({ ...prev, connected: true }));
      reconnectAttemptRef.current = 0;

      if (initialRoomId) {
        const joinMsg: WebSocketMessage = {
          type: 'join',
          roomId: initialRoomId,
          ...(isE2eeEnabled && keyPair && { publicKey: keyPair.publicKey }),
        };
        ws.current?.send(JSON.stringify(joinMsg));
      }
    };

    ws.current.onmessage = (event) => onMessageRef.current(event);

    ws.current.onclose = () => {
      setRoomState(prev => ({ ...prev, connected: false, clientCount: 0, clientId: null }));
      reconnectAttemptRef.current += 1;
      const delay = Math.min(3000 * Math.pow(2, reconnectAttemptRef.current - 1), 30000);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (ws.current?.readyState === WebSocket.CLOSED) connect();
      }, delay);
    };

    ws.current.onerror = (error) => console.error('WebSocket error:', error);
  }, [initialRoomId, keyPair, isE2eeEnabled]);

  useEffect(() => {
    if (isReady) connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      ws.current?.close();
    };
  }, [connect, isReady]);

  // ── Send message (with E2EE) ───────────────────────────────

  const sendMessage = useCallback(async (message: WebSocketMessage): Promise<boolean> => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return false;

    let msg: WebSocketMessage = { ...message };
    const recipients = Object.values(roomClients).filter(c => c.id !== roomState.clientId);
    const requiresEncryption = isE2eeEnabled && recipients.length > 0;

    const isText = msg.type === 'clipboard' && !msg.fileId && msg.content;
    const isFileMeta = msg.type === 'file-start' || (msg.type === 'clipboard' && !!msg.fileId);

    if (isFileMeta) {
      const meta = {
        fileName: msg.fileName, fileSize: msg.fileSize, fileType: msg.fileType,
        contentType: msg.contentType, previewContent: msg.previewContent,
      };
      if (Object.values(meta).some(v => v !== undefined)) {
        const encrypted = await encryptForRecipients(JSON.stringify(meta));
        if (!encrypted && requiresEncryption) return false;
        if (encrypted) {
          msg = {
            ...msg, fileName: undefined, fileSize: undefined, fileType: undefined,
            contentType: undefined, previewContent: undefined, encryptedMetadata: encrypted,
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

    ws.current.send(JSON.stringify(msg));
    return true;
  }, [encryptForRecipients, isE2eeEnabled, roomClients, roomState.clientId]);

  // ── Upload file (delegates to service) ─────────────────────

  const uploadFile = useCallback(async (file: File, fileId: string, previewContent?: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

    await _uploadFile(file, fileId, previewContent, {
      ws: ws.current,
      sendMessage,
      encryptionCtx: { isE2eeEnabled, keyPair, roomClients, clientId: roomState.clientId },
      encryptFiles,
      onUpdate: (u) => onFileTransferUpdateRef.current?.(u),
    });
  }, [sendMessage, isE2eeEnabled, keyPair, encryptFiles, roomClients, roomState.clientId]);

  // ── Room operations ────────────────────────────────────────

  const createRoom = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      pendingRoomCreation.current = resolve;
      const msg: WebSocketMessage = { type: 'create' };
      if (isE2eeEnabled && keyPair) msg.publicKey = keyPair.publicKey;
      ws.current?.send(JSON.stringify(msg));
    });
  }, [keyPair, isE2eeEnabled]);

  const joinRoom = useCallback((roomId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      pendingRoomJoin.current = resolve;
      const msg: WebSocketMessage = {
        type: 'join', roomId,
        ...(isE2eeEnabled && keyPair && { publicKey: keyPair.publicKey }),
      };
      ws.current?.send(JSON.stringify(msg));
    });
  }, [keyPair, isE2eeEnabled]);

  const leaveRoom = useCallback(() => {
    ws.current?.send(JSON.stringify({ type: 'leave' }));
    setRoomState({ roomId: null, connected: true, clientCount: 0, clientId: null });
    setRoomClients({});
  }, []);

  return {
    roomState, sendMessage, uploadFile, createRoom, joinRoom, leaveRoom,
    isE2eeEnabled, isReady, encryptFiles, setEncryptFiles,
  };
};
