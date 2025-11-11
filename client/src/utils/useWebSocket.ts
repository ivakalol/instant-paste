import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage, RoomState } from '../types';

interface UseWebSocketReturn {
  roomState: RoomState;
  sendMessage: (message: WebSocketMessage) => void;
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
  const [roomState, setRoomState] = useState<RoomState>({
    roomId: null,
    connected: false,
    clientCount: 0,
  });

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setRoomState(prev => ({ ...prev, connected: true }));
    };

    ws.current.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'created':
          case 'joined':
            setRoomState({
              roomId: message.roomId || null,
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
            onClipboardReceived(message);
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
      setRoomState({
        roomId: null,
        connected: false,
        clientCount: 0,
      });
      
      // Attempt to reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        if (ws.current?.readyState === WebSocket.CLOSED) {
          connect();
        }
      }, 3000);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [onClipboardReceived]);

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

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      // Retry after a short delay if connection is still being established
      if (ws.current && ws.current.readyState === WebSocket.CONNECTING) {
        // Clear any existing retry timeout
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
        retryTimeoutRef.current = setTimeout(() => {
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
          }
        }, 500);
      }
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
