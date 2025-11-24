export interface ClipboardItem {
  id: string;
  fileId?: string; // Unique ID for file transfers
  type: 'text' | 'image' | 'video' | 'file' | 'audio' | 'application';
  content: string;
  timestamp: number;
  name?: string; // To store the original filename
  size?: number; // To store the file size in bytes
  encrypted?: boolean;
  status?: 'complete' | 'uploading' | 'downloading'; // Transfer status
  progress?: number; // Upload/download progress (0-100)
}
