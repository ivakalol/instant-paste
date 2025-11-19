export interface ClipboardItem {
  id: string;
  type: 'text' | 'image' | 'video' | 'file';
  content: string;
  timestamp: number;
  name?: string; // To store the original filename
  size?: number; // To store the file size in bytes
  encrypted?: boolean;
}
