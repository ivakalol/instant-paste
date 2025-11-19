import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ClipboardItem } from '../types';
import { copyToClipboard, downloadFile } from '../utils/clipboard';

interface ClipboardAreaProps {
  onPaste: (type: string, content: string) => void;
  history: ClipboardItem[];
  encryptionEnabled: boolean;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onDeleteItem: (id: string) => void;
}

const ClipboardArea: React.FC<ClipboardAreaProps> = ({
  onPaste,
  history,
  encryptionEnabled,
  showToast,
  onDeleteItem
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [typedText, setTypedText] = useState('');
  const pasteAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // Helper function to read and process files
  const processFile = useCallback((file: File) => {
    // Validate file size before reading (50MB limit for base64-encoded content)
    // For text: 50MB text limit
    // For binary (images/videos): 37.5MB original file = ~50MB base64
    const MAX_SIZE = file.type.startsWith('text/') ? 50 * 1024 * 1024 : 37.5 * 1024 * 1024;
    
    if (file.size > MAX_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const maxMB = (MAX_SIZE / (1024 * 1024)).toFixed(1);
      showToast(`File too large (${sizeMB}MB). Maximum size is ${maxMB}MB.`, 'error');
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        showToast('Failed to read file: Invalid result type', 'error');
        return;
      }
      if (file.type.startsWith('image/')) {
        onPaste('image', reader.result);
      } else if (file.type.startsWith('video/')) {
        onPaste('video', reader.result);
      } else if (file.type.startsWith('text/')) {
        onPaste('text', reader.result);
      }
    };
    reader.onerror = () => {
      console.error('Failed to read file:', reader.error);
      showToast('Failed to read file. Please try again.', 'error');
    };

    if (file.type.startsWith('text/')) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  }, [onPaste, showToast]);

  // Helper function to process clipboard items
  const processClipboardItem = useCallback((item: DataTransferItem) => {
    if (item.type.startsWith('text/')) {
      item.getAsString((text) => {
        onPaste('text', text);
      });
    } else if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (blob) {
        processFile(blob);
      }
    } else if (item.type.startsWith('video/')) {
      const blob = item.getAsFile();
      if (blob) {
        processFile(blob);
      }
    }
  }, [onPaste, processFile]);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      e.preventDefault();
      
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        processClipboardItem(items[i]);
      }
    };

    const pasteArea = pasteAreaRef.current;
    if (pasteArea) {
      pasteArea.addEventListener('paste', handlePaste);
    }

    return () => {
      if (pasteArea) {
        pasteArea.removeEventListener('paste', handlePaste);
      }
    };
  }, [processClipboardItem]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleCopy = async (item: ClipboardItem) => {
    if (item.type === 'text') {
      const success = await copyToClipboard(item.content);
      if (success) {
        showToast('Copied to clipboard!', 'success');
        setCopiedItemId(item.id);
        setTimeout(() => setCopiedItemId(null), 1000);
      } else {
        showToast('Failed to copy to clipboard', 'error');
      }
    } else if (item.type === 'image') {
      if (!navigator.clipboard || !navigator.clipboard.write) {
        showToast('Copying images is not supported in your browser.', 'error');
        return;
      }
      try {
        const response = await fetch(item.content);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob,
          }),
        ]);
        showToast('Image copied to clipboard!', 'success');
        setCopiedItemId(item.id);
        setTimeout(() => setCopiedItemId(null), 1000);
      } catch (error) {
        console.error('Failed to copy image to clipboard:', error);
        showToast('Failed to copy image.', 'error');
      }
    } else {
        showToast(`Cannot copy ${item.type} directly. Please use the download button.`, 'info');
    }
  };

  // Helper to extract MIME type from data URL
  const getMimeType = (dataUrl: string): string | null => {
    const match = dataUrl.match(/^data:([^;]+);/);
    return match ? match[1] : null;
  };

  // Helper to map MIME type to file extension
  const getExtension = (mimeType: string | null, fallback: string): string => {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/ogg': 'ogv',
      // add more mappings as needed
    };
    return mimeType && mimeToExt[mimeType] ? mimeToExt[mimeType] : fallback;
  };

  const handleDownload = (item: ClipboardItem) => {
    let ext = 'txt';
    if (item.type === 'image' || item.type === 'video') {
      const mimeType = getMimeType(item.content);
      ext = getExtension(mimeType, item.type === 'image' ? 'png' : 'mp4');
    }
    const filename = `paste-${item.id}.${ext}`;
    
    if (item.type === 'text') {
      const blob = new Blob([item.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      downloadFile(url, filename);
      URL.revokeObjectURL(url);
    } else {
      downloadFile(item.content, filename);
    }
  };

  const handleSendText = () => {
    if (typedText.trim()) {
      onPaste('text', typedText);
      setTypedText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Ctrl+Enter or Cmd+Enter
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendText();
    }
  };

  return (
    <div className="clipboard-area">
      <textarea
        ref={pasteAreaRef}
        className={`paste-zone ${isDragging ? 'dragging' : ''}`}
        placeholder="Paste or type here (Ctrl+V / Cmd+V) or drag & drop files..."
        value={typedText}
        onChange={(e) => setTypedText(e.target.value)}
        onKeyDown={handleKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        rows={10}
        style={{ resize: 'vertical' }}
      />
      
      <div className="actions">
        <button 
          onClick={handleSendText}
          className="btn btn-primary"
          disabled={!typedText.trim()}
          style={{ marginRight: '10px' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11zM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493z"/>
          </svg>
          Send Text
        </button>
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="btn btn-secondary"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M4.5 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm2 0a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm2 0a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm2 0a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z"/>
            <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm12 14H2V2h12v13z"/>
          </svg>
          Choose File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          accept="image/*,video/*,text/*"
          style={{ display: 'none' }}
        />
      </div>

      {encryptionEnabled && (
        <div className="encryption-indicator">
          🔒 Encryption enabled
        </div>
      )}

      <div className="history">
        <h3>Recent Clips ({history.length})</h3>
        <div className="history-items">
          {history.length === 0 ? (
            <p className="empty-state">No clips yet. Start pasting!</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className={`history-item ${copiedItemId === item.id ? 'copied-flash' : ''}`}>
                <div className="item-content">
                  {item.type === 'text' && (
                    <div className="text-preview">
                      {expandedItems.has(item.id) ? item.content : item.content.substring(0, 100)}
                      {item.content.length > 100 && (
                        <button onClick={() => toggleExpand(item.id)} className="btn-icon btn-small">
                          {expandedItems.has(item.id) ? '➖ Collapse' : '➕ Expand'}
                        </button>
                      )}
                    </div>
                  )}
                  {item.type === 'image' && (
                    <img src={item.content} alt="Pasted" className="media-preview" />
                  )}
                  {item.type === 'video' && (
                    <video src={item.content} className="media-preview" controls />
                  )}
                </div>
                <div className="item-actions">
                  <span className="item-type">{item.type}</span>
                  <span className="item-timestamp">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                  <button onClick={() => handleCopy(item)} className="btn-icon" title="Copy">
                    📋
                  </button>
                  <button onClick={() => handleDownload(item)} className="btn-icon" title="Download">
                    💾
                  </button>
                  <button onClick={() => onDeleteItem(item.id)} className="btn-icon btn-danger" title="Delete">
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ClipboardArea;