export interface WebSocketMessage {
  type: string;
  roomId?: string;
  contentType?: string;
  content?: string;
  encryptedContent?: string;
  senderId?: string;
  message?: string;
  clients?: any;
  timestamp?: number;
  clientId?: string;
  publicKey?: JsonWebKey;
}

export interface RoomState {
  roomId: string | null;
  connected: boolean;
  clientCount: number;
  clientId: string | null;
}