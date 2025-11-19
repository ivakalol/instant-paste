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

interface UseWebSocketReturn {
  roomState: RoomState;
  sendMessage: (message: WebSocketMessage) => Promise<boolean>;
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

export const useWebSocket = (
  onClipboardReceived?: (message: WebSocketMessage) => void,
  initialRoomId?: string
): UseWebSocketReturn => {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onClipboardReceivedRef = useRef(onClipboardReceived);
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

  const pendingRoomCreation = useRef<(roomId: string | null) => void>();
  const pendingRoomJoin = useRef<(success: boolean) => void>();

  const onMessageRef = useRef((event: MessageEvent) => {});

  useEffect(() => {
    onClipboardReceivedRef.current = onClipboardReceived;
  }, [onClipboardReceived]);

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

  useEffect(() => {
    onMessageRef.current = async (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'created':
            setRoomState({
              roomId: message.roomId || null,
              connected: true,
              clientCount: message.clientCount || 1,
              clientId: message.clientId,
            });
            setRoomClients(message.clients.reduce((acc: any, client: any) => {
              acc[client.id] = client;
              return acc;
            }, {}));
            if (pendingRoomCreation.current) {
              pendingRoomCreation.current(message.roomId || null);
              pendingRoomCreation.current = undefined;
            }
            break;
          case 'joined':
            setRoomState({
              roomId: message.roomId || null,
              connected: true,
              clientCount: message.clients?.length || 1,
              clientId: message.clientId,
            });
            setRoomClients(message.clients.reduce((acc: any, client: any) => {
              acc[client.id] = client;
              return acc;
            }, {}));
            if (pendingRoomJoin.current) {
              pendingRoomJoin.current(true);
              pendingRoomJoin.current = undefined;
            }
            break;
          case 'client-joined':
            setRoomState(prev => ({
              ...prev,
              clientCount: message.clientCount,
            }));
            setRoomClients(prev => ({...prev, [message.client.id]: message.client}));
            break;
          case 'client-left':
            setRoomState(prev => ({
              ...prev,
              clientCount: message.clientCount,
            }));
            setRoomClients(prev => {
              const newClients = {...prev};
              delete newClients[message.clientId];
              return newClients;
            });
            break;
          case 'clipboard':
            if (onClipboardReceivedRef.current) {
              if (isE2eeEnabled && keyPair && message.encryptedContent) {
                const sender = roomClients[message.senderId];
                if (sender?.publicKey) {
                  const decryptedContent = await decryptFrom(message.encryptedContent, keyPair.privateKey, sender.publicKey);
                  if (decryptedContent) {
                    onClipboardReceivedRef.current({ ...message, content: decryptedContent });
                  } else {
                    console.error("Failed to decrypt message");
                  }
                }
              } else if (message.content) { // Handle non-E2EE messages
                onClipboardReceivedRef.current(message);
              }
            }
            break;
          case 'error':
            console.error('WebSocket error:', message.message);
            if (pendingRoomJoin.current) {
              pendingRoomJoin.current(false);
              pendingRoomJoin.current = undefined;
            }
            break;
          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }, [isE2eeEnabled, keyPair, roomClients]);

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
        };
        if (isE2eeEnabled && keyPair) {
          joinMessage.publicKey = keyPair.publicKey;
        }
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

      if (message.type === 'clipboard') {
        if (isE2eeEnabled && keyPair && roomState.clientId) {
          const recipients = Object.values(roomClients).filter(c => c.id !== roomState.clientId);
          if (recipients.length > 0 && recipients[0].publicKey) {
            // This is still not ideal for group chat, but it's a fix for 1-to-1
            const encryptedContent = await encryptFor(message.content!, keyPair.privateKey, recipients[0].publicKey);
            messageToSend = { ...message, content: undefined, encryptedContent };
          }
        }
        // If E2EE is disabled, messageToSend will have the original `content`
      }

      ws.current.send(JSON.stringify(messageToSend));
      return true;
    }
    return false;
  }, [isE2eeEnabled, keyPair, roomClients, roomState.clientId]);

  const createRoom = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      pendingRoomCreation.current = resolve;
      const message = {
        type: 'create',
        ...(isE2eeEnabled && keyPair && { publicKey: keyPair.publicKey }),
      };
      ws.current?.send(JSON.stringify(message));
    });
  }, [keyPair, isE2eeEnabled]);

  const joinRoom = useCallback((roomId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      pendingRoomJoin.current = resolve;
      const message = {
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
    createRoom,
    joinRoom,
    leaveRoom,
    isE2eeEnabled,
    isReady,
  };
};
