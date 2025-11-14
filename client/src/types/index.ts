export interface ClipboardItem {
  id: string;
  type: 'text' | 'image' | 'video';
  content: string;
  timestamp: number;
  encrypted?: boolean;
}

export interface WebSocketMessage {
  type: string;
  roomId?: string;
  contentType?: string;
  content?: string;
  message?: string;
  clients?: number;
  timestamp?: number;
}

export interface RoomState {
  roomId: string | null;
  connected: boolean;
  clientCount: number;
}
