import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage, RoomState } from '../types/index';
import {
  generateE2eeKeyPair,
  encryptFor,
  decryptFrom,
  E2eeKeyPair,
} from './e2ee';

const CHUNK_SIZE = 1024 * 1024; // 1MB

interface UseWebSocketReturn {
  roomState: RoomState;
  sendMessage: (message: WebSocketMessage) => Promise<boolean>;
  uploadFile?: (file: File, fileId: string, previewContent?: string) => void;
  createRoom: () => Promise<string | null>;
  joinRoom: (roomId: string) => Promise<boolean>;
  leaveRoom: () => void;
  isE2eeEnabled: boolean;
  isReady: boolean;
}

interface RoomClient {
  id: string;
  publicKey?: JsonWebKey;
}

interface IncomingFile {
  chunks: string[];
  metadata: WebSocketMessage;
}

type EncryptedPayload = string | Record<string, string>;



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
  const incomingFiles = useRef<Map<string, IncomingFile>>(new Map());
  const orphanChunks = useRef<Map<string, WebSocketMessage[]>>(new Map());

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

  const handleFileChunk = useCallback(async (message: WebSocketMessage) => {
    if (!message.fileId || (!message.chunk && !message.encryptedChunk)) return;

    let incomingFile = incomingFiles.current.get(message.fileId);

    if (!incomingFile) {
        // This chunk has arrived before its metadata, store it as an orphan
        if (!orphanChunks.current.has(message.fileId)) {
            orphanChunks.current.set(message.fileId, []);
        }
        orphanChunks.current.get(message.fileId)!.push(message);
        console.log(`Orphaned chunk for ${message.fileId} received and stored.`);
        return;
    }

    let chunk = message.chunk;

    if (message.encryptedChunk) {
      const decryptedChunk = await decryptFromSender(message.encryptedChunk, message.senderId);
      if (decryptedChunk === null) {
        onFileTransferUpdateRef.current?.({ type: 'file-error', fileId: message.fileId, message: 'Failed to decrypt file chunk' });
        incomingFiles.current.delete(message.fileId);
        return;
      }

      chunk = decryptedChunk;
    }

    if (typeof chunk !== 'string') {
      console.error('Chunk is not a string:', message.fileId);
      return;
    }

    incomingFile.chunks[message.chunkIndex!] = chunk;
    
    const progress = (incomingFile.chunks.filter(Boolean).length / message.totalChunks!) * 100;
    onFileTransferUpdateRef.current?.({
        type: 'file-progress',
        fileId: message.fileId,
        progress: progress,
    });

    if (incomingFile.chunks.filter(Boolean).length === message.totalChunks) {
        try {
            const byteArrays = incomingFile.chunks.map(base64Chunk => {
                const byteCharacters = atob(base64Chunk);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                return new Uint8Array(byteNumbers);
            });

            const blob = new Blob(byteArrays, { type: incomingFile.metadata.fileType });
            const contentUrl = URL.createObjectURL(blob);
            console.log(`[useWebSocket] File complete: fileId=${message.fileId}, fileType=${incomingFile.metadata.fileType}, contentUrl=${contentUrl}`);

            onFileTransferUpdateRef.current?.({
                type: 'file-complete',
                fileId: message.fileId,
                content: contentUrl,
            });
        } catch (error) {
            console.error("Error reassembling file:", error);
            onFileTransferUpdateRef.current?.({ type: 'file-error', fileId: message.fileId, message: 'File reassembly failed' });
        } finally {
            incomingFiles.current.delete(message.fileId);
        }
    }
  }, [decryptFromSender]);

  useEffect(() => {
    onMessageRef.current = async (event: MessageEvent) => {
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
          case 'file-start':
            if (onClipboardReceivedRef.current) {
              const fileStartMessage = await withDecryptedMetadata(message);
              onClipboardReceivedRef.current(fileStartMessage);
            }
            break;
          case 'clipboard':
            if (onClipboardReceivedRef.current) {
              let clipboardMessage = await withDecryptedMetadata(message);

              if (!clipboardMessage.fileId && clipboardMessage.encryptedContent) {
                const decryptedContent = await decryptFromSender(clipboardMessage.encryptedContent, clipboardMessage.senderId);
                if (decryptedContent !== null) {
                  clipboardMessage = { ...clipboardMessage, content: decryptedContent };
                } else {
                  clipboardMessage = { ...clipboardMessage, content: '[Unable to decrypt message]' };
                }
              }

              if (clipboardMessage.fileId && clipboardMessage.totalChunks) { // This is the metadata for a file transfer
                incomingFiles.current.set(clipboardMessage.fileId, {
                  chunks: new Array(clipboardMessage.totalChunks),
                  metadata: clipboardMessage,
                });
                    
                // Now that metadata is set, process any orphaned chunks that arrived early
                if (orphanChunks.current.has(clipboardMessage.fileId)) {
                  const chunks = orphanChunks.current.get(clipboardMessage.fileId)!;
                  console.log(`Processing ${chunks.length} orphaned chunks for ${clipboardMessage.fileId}.`);
                  chunks.sort((a, b) => a.chunkIndex! - b.chunkIndex!); // Ensure order
                  for (const chunkMsg of chunks) {
                    await handleFileChunk(chunkMsg);
                  }
                  orphanChunks.current.delete(clipboardMessage.fileId);
                }
              }
              onClipboardReceivedRef.current(clipboardMessage);
            }
            break;
          case 'file-chunk':
            await handleFileChunk(message);
            break;
          case 'error':
            console.error('WebSocket error:', message.message);
            if (pendingRoomJoin.current) {
              pendingRoomJoin.current(false);
              pendingRoomJoin.current = undefined;
            }
            if (message.fileId && onFileTransferUpdateRef.current) {
              onFileTransferUpdateRef.current({ type: 'file-error', fileId: message.fileId, message: message.message });
              incomingFiles.current.delete(message.fileId);
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
  }, [decryptFromSender, handleFileChunk, roomState.clientId, withDecryptedMetadata]);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws.current = new WebSocket(wsUrl);

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
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    const sendChunk = async (base64Chunk: string, chunkIndex: number): Promise<boolean> => {
      const sent = await sendMessage({
        type: 'file-chunk',
        fileId: fileId,
        chunkIndex,
        totalChunks,
        chunk: base64Chunk,
      });

      if (!sent) {
        onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Failed to send encrypted file chunk (connection or E2EE issue)' });
        return false;
      }

      const progress = ((chunkIndex + 1) / totalChunks) * 100;
      onFileTransferUpdateRef.current?.({ type: 'file-progress', fileId, progress });
      return true;
    };
    
    // Announce the file transfer first
    const fileStartSent = await sendMessage({
      type: 'file-start',
      fileId: fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });
    if (!fileStartSent) {
      onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Failed to send file metadata (connection or E2EE issue)' });
      return;
    }

    // Send the clipboard message with the preview and full metadata
    const fileMetadataSent = await sendMessage({
      type: 'clipboard',
      contentType: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'file',
      fileId: fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      totalChunks: totalChunks,
      previewContent: previewContent,
    });
    if (!fileMetadataSent) {
      onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Failed to send encrypted file metadata' });
      return;
    }

    // Send file chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      const reader = new FileReader();
      reader.readAsDataURL(chunk);
      
      const chunkSent = await new Promise<boolean>((resolve) => {
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          const base64Chunk = dataUrl.split(',')[1];
          resolve(await sendChunk(base64Chunk, i));
        };
        reader.onerror = () => {
          onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Failed to read file chunk' });
          resolve(false);
        };
      });

      if (!chunkSent) {
        return;
      }
    }
  }, [sendMessage]);

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
  };
};