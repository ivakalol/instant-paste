export interface ClipboardItem {
  id: string;
  type: 'text' | 'image' | 'video';
  content: string;
  timestamp: number;
  encrypted?: boolean;
}
