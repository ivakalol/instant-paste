export interface ClipboardItem {
  id: string;
  fileId?: string; // Unique ID for file transfers
  collectionId?: string; // Groups files selected together
  collectionTotal?: number;
  collectionIndex?: number;
  type: 'text' | 'rich-text' | 'image' | 'video' | 'file' | 'audio' | 'application' | 'collection';
  content: string;
  previewContent?: string; // Small compressed variant for initial preview
  timestamp: number;
  name?: string; // To store the original filename
  size?: number; // To store the file size in bytes
  items?: ClipboardItem[];
  encrypted?: boolean;
  status?: 'complete' | 'uploading' | 'downloading' | 'generating'; 
  progress?: number;
}
