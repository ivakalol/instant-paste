import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage, RoomState } from '../types';
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
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onClipboardReceivedRef = useRef(onClipboardReceived);
  const reconnectAttemptRef = useRef<number>(0);
  
  const [roomState, setRoomState] = useState<RoomState>({
    roomId: null,
    connected: false,
    clientCount: 0,
  });
  const [keyPair, setKeyPair] = useState<E2eeKeyPair | null>(null);
  const [roomClients, setRoomClients] = useState<Record<string, RoomClient>>({});
  const [isE2eeEnabled, setIsE2eeEnabled] = useState(true);

  const pendingRoomCreation = useRef<(roomId: string | null) => void>();
  const pendingRoomJoin = useRef<(success: boolean) => void>();

  useEffect(() => {
    const initKeyPair = async () => {
      let pair = getKeyPair();
      if (!pair) {
        pair = await generateE2eeKeyPair();
        storeKeyPair(pair);
      }
      setKeyPair(pair);
    };
    initKeyPair();
  }, []);

  useEffect(() => {
    onClipboardReceivedRef.current = onClipboardReceived;
  }, [onClipboardReceived]);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setRoomState(prev => ({ ...prev, connected: true }));
      reconnectAttemptRef.current = 0;
      
      if (initialRoomId && keyPair) {
        console.log(`Joining room from URL: ${initialRoomId}`);
        ws.current?.send(JSON.stringify({ 
          type: 'join', 
          roomId: initialRoomId,
          publicKey: keyPair.publicKey 
        }));
      }
    };

    ws.current.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'created':
            const newRoomId = message.roomId || null;
            setRoomState({
              roomId: newRoomId,
              connected: true,
              clientCount: message.clients?.length || 1,
            });
            setRoomClients(message.clients.reduce((acc: any, client: any) => {
              acc[client.id] = client;
              return acc;
            }, {}));
            if (pendingRoomCreation.current) {
              pendingRoomCreation.current(newRoomId);
              pendingRoomCreation.current = undefined;
            }
            break;
          case 'joined':
            const joinedRoomId = message.roomId || null;
            setRoomState({
              roomId: joinedRoomId,
              connected: true,
              clientCount: message.clients?.length || 1,
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
              clientCount: prev.clientCount + 1,
            }));
            setRoomClients(prev => ({...prev, [message.client.id]: message.client}));
            break;
          case 'client-left':
            setRoomState(prev => ({
              ...prev,
              clientCount: prev.clientCount - 1,
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
              } else if (!isE2eeEnabled) {
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

    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
      setRoomState(prev => ({ ...prev, connected: false, clientCount: 0 }));
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
  }, [initialRoomId, keyPair, isE2eeEnabled, roomClients]);

  useEffect(() => {
    if (keyPair) {
      connect();
    }
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      ws.current?.close();
    };
  }, [connect, keyPair]);

  const sendMessage = useCallback(async (message: WebSocketMessage): Promise<boolean> => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      let messageToSend = message;
      if (message.type === 'clipboard' && isE2eeEnabled && keyPair) {
        const recipients = Object.values(roomClients).filter(c => c.id !== ws.current?.url); // A bit of a hack to get client id
        if (recipients.length > 0 && recipients[0].publicKey) {
          const encryptedContent = await encryptFor(message.content!, keyPair.privateKey, recipients[0].publicKey);
          messageToSend = { ...message, content: '', encryptedContent };
        }
      }

      ws.current.send(JSON.stringify(messageToSend));
      return true;
    }
    return false;
  }, [isE2eeEnabled, keyPair, roomClients]);

  const createRoom = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      if (keyPair) {
        pendingRoomCreation.current = resolve;
        ws.current?.send(JSON.stringify({ type: 'create', publicKey: keyPair.publicKey }));
      } else {
        resolve(null);
      }
    });
  }, [keyPair]);

  const joinRoom = useCallback((roomId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (keyPair) {
        pendingRoomJoin.current = resolve;
        ws.current?.send(JSON.stringify({ type: 'join', roomId, publicKey: keyPair.publicKey }));
      } else {
        resolve(false);
      }
    });
  }, [keyPair]);

  const leaveRoom = useCallback(() => {
    ws.current?.send(JSON.stringify({ type: 'leave' }));
    setRoomState({ roomId: null, connected: true, clientCount: 0 });
    setRoomClients({});
  }, []);

  return {
    roomState,
    sendMessage,
    createRoom,
    joinRoom,
    leaveRoom,
    isE2eeEnabled,
  };
};
