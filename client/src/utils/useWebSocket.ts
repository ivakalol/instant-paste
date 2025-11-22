import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage, RoomState } from '../types/index';
import {
  generateE2eeKeyPair,
  getKeyPair,
  storeKeyPair,
  encryptFor,
  decryptFrom,
  E2eeKeyPair,
} from './e2ee';

const CHUNK_SIZE = 1024 * 1024; // 1MB

interface UseWebSocketReturn {
  roomState: RoomState;
  sendMessage: (message: WebSocketMessage) => Promise<boolean>;
  uploadFile?: (file: File, fileId: string) => void;
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

  const pendingRoomCreation = useRef<(roomId: string | null) => void>();
  const pendingRoomJoin = useRef<(success: boolean) => void>();

  const onMessageRef = useRef((event: MessageEvent) => {});

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
          let pair = getKeyPair();
          if (!pair) {
            pair = await generateE2eeKeyPair();
            storeKeyPair(pair);
          }
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
    if (!message.fileId || !message.chunk) return;

    let incomingFile = incomingFiles.current.get(message.fileId);

    // Retry mechanism to handle potential race conditions
    if (!incomingFile) {
        let retries = 0;
        const maxRetries = 5;
        while (!incomingFile && retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 100));
            incomingFile = incomingFiles.current.get(message.fileId);
            retries++;
        }
    }
    
    if (!incomingFile) {
        console.error('Received chunk for unknown file after retries:', message.fileId);
        return;
    }

    const chunk = message.chunk;
    
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
  }, []);

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
          case 'clipboard':
            if (onClipboardReceivedRef.current) {
                if(message.fileId) { // This is the start of a file transfer
                    incomingFiles.current.set(message.fileId, {
                        chunks: new Array(message.totalChunks),
                        metadata: message,
                    });
                }
                onClipboardReceivedRef.current(message);
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
  }, [handleFileChunk, roomState.clientId]);

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
      
      const isText = message.type === 'clipboard' && !message.fileId && message.content;

      if (isE2eeEnabled && keyPair && roomState.clientId && isText) {
        const recipients = Object.values(roomClients).filter(c => c.id !== roomState.clientId);
        if (recipients.length > 0 && recipients[0].publicKey) {
          const contentToEncrypt = message.content!;
          const encryptedContent = await encryptFor(contentToEncrypt, keyPair.privateKey, recipients[0].publicKey);
          messageToSend = { ...message, content: undefined, encryptedContent };
        }
      }
      ws.current.send(JSON.stringify(messageToSend));
      return true;
    }
    return false;
  }, [isE2eeEnabled, keyPair, roomClients, roomState.clientId]);

  const uploadFile = useCallback(async (file: File, fileId: string) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Send file start message
    await sendMessage({
      type: 'clipboard',
      contentType: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file',
      fileId: fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      totalChunks: totalChunks,
    });
    
    // Send file chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      const reader = new FileReader();
      reader.readAsDataURL(chunk);
      
      await new Promise<void>((resolve, reject) => {
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          const base64Chunk = dataUrl.split(',')[1];
          const sent = await sendMessage({
            type: 'file-chunk',
            fileId: fileId,
            chunkIndex: i,
            totalChunks: totalChunks,
            chunk: base64Chunk,
          });
          if (sent) {
            const progress = ((i + 1) / totalChunks) * 100;
            onFileTransferUpdateRef.current?.({ type: 'file-progress', fileId, progress });
            resolve();
          } else {
            onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'WebSocket disconnected' });
            reject(new Error('Failed to send chunk'));
          }
        };
        reader.onerror = () => {
          onFileTransferUpdateRef.current?.({ type: 'file-error', fileId, message: 'Failed to read file chunk' });
          reject(new Error('Failed to read chunk'));
        };
      });
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