import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage, RoomState } from '../types';

interface UseWebSocketReturn {
  roomState: RoomState;
  sendMessage: (message: WebSocketMessage) => boolean;
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
}

export const useWebSocket = (
  onClipboardReceived: (message: WebSocketMessage) => void
): UseWebSocketReturn => {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onClipboardReceivedRef = useRef(onClipboardReceived);
  const previousRoomIdRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const [roomState, setRoomState] = useState<RoomState>({
    roomId: null,
    connected: false,
    clientCount: 0,
  });

  // Keep ref updated with latest callback
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
      
      // Reset reconnect attempt counter on successful connection
      reconnectAttemptRef.current = 0;
      
      // Rejoin previous room if reconnecting
      if (previousRoomIdRef.current) {
        console.log(`Rejoining room: ${previousRoomIdRef.current}`);
        ws.current?.send(JSON.stringify({ type: 'join', roomId: previousRoomIdRef.current }));
      }
    };

    ws.current.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'created':
          case 'joined':
            const roomId = message.roomId || null;
            previousRoomIdRef.current = roomId; // Store for reconnection
            setRoomState({
              roomId,
              connected: true,
              clientCount: message.clients || 1,
            });
            break;
          case 'client-joined':
          case 'client-left':
            setRoomState(prev => ({
              ...prev,
              clientCount: message.clients || prev.clientCount,
            }));
            break;
          case 'clipboard':
            onClipboardReceivedRef.current(message);
            break;
          case 'error':
            console.error('WebSocket error:', message.message);
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
      setRoomState(prev => ({
        ...prev,
        connected: false,
        clientCount: 0,
      }));
      
      // Implement exponential backoff for reconnection (3s, 6s, 12s, max 30s)
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
  }, []);

  useEffect(() => {
    connect();

    return () => {
      // Clear any pending timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((message: WebSocketMessage): boolean => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
      return true;
    } else {
      // Retry after a short delay if connection is still being established
      if (ws.current && ws.current.readyState === WebSocket.CONNECTING) {
        // Only create retry timeout if one isn't already pending
        if (!retryTimeoutRef.current) {
          const timeoutId = setTimeout(() => {
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify(message));
            }
            // Clear ref after execution - use the captured timeoutId
            if (retryTimeoutRef.current === timeoutId) {
              retryTimeoutRef.current = null;
            }
          }, 500);
          retryTimeoutRef.current = timeoutId;
        }
        return true; // Will retry
      }
      return false; // Connection not available
    }
  }, []);

  const createRoom = useCallback(() => {
    sendMessage({ type: 'create' });
  }, [sendMessage]);

  const joinRoom = useCallback((roomId: string) => {
    sendMessage({ type: 'join', roomId });
  }, [sendMessage]);

  const leaveRoom = useCallback(() => {
    sendMessage({ type: 'leave' });
    previousRoomIdRef.current = null; // Clear room on intentional leave
    setRoomState({
      roomId: null,
      connected: true,
      clientCount: 0,
    });
  }, [sendMessage]);

  return {
    roomState,
    sendMessage,
    createRoom,
    joinRoom,
    leaveRoom,
  };
};
