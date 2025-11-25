export interface WebSocketMessage {
  type: string;
  roomId?: string;
  contentType?: string;
  content?: string;
  encryptedContent?: any; // Can be string or { iv, data }
  senderId?: string;
  message?: string;
  clients?: any;
  timestamp?: number;
  clientId?: string;
  publicKey?: JsonWebKey;
  clientCount?: number;
  
  // Fields for file chunking
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  fileId?: string;
  chunk?: string; // Base64 encoded chunk
  chunkIndex?: number;
  totalChunks?: number;
  progress?: number; // 0-100
}

export interface RoomState {
  roomId: string | null;
  connected: boolean;
  clientCount: number;
  clientId: string | null;
}