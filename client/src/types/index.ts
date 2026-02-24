export interface WebSocketMessage {
  type: string;
  roomId?: string;
  contentType?: string;
  content?: string;
  encryptedContent?: string | Record<string, string>;
  encryptedMetadata?: string | Record<string, string>;
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
  chunk?: string; // Base64 encoded chunk (legacy)
  encryptedChunk?: string | Record<string, string>; // (legacy)
  encryptedDataKey?: string | Record<string, string>; // Per-recipient encrypted data key for file transfers
  chunkIndex?: number;
  totalChunks?: number;
  progress?: number; // 0-100
  previewContent?: string; // Base64 encoded thumbnail
}

export interface RoomState {
  roomId: string | null;
  connected: boolean;
  clientCount: number;
  clientId: string | null;
}