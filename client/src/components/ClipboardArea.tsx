import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ClipboardItem as ClipboardHistoryItem } from '../types/ClipboardItem';
import { copyToClipboard, downloadFile } from '../utils/clipboard';

interface ClipboardAreaProps {
  onPaste: (type: string, content: string, name?: string, size?: number) => void;
  history: ClipboardHistoryItem[];
  encryptionEnabled: boolean;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onDeleteItem: (id: string) => void;
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

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

  const processFile = useCallback((file: File) => {
    const passwordPromptSize = 150 * 1024 * 1024; // 150 MB
    const requiredPassword = "qwerty7654321";

    if (file.size > passwordPromptSize) {
      const enteredPassword = prompt(`This file is larger than 150MB. Please enter the password to proceed:`);
      if (enteredPassword === null) {
        return;
      }
      if (enteredPassword !== requiredPassword) {
        showToast('Incorrect password.', 'error');
        return;
      }
    }
    
    const reader = new FileReader();
    
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        showToast('Failed to read file: Invalid result type', 'error');
        return;
      }
      if (file.type.startsWith('image/')) {
        onPaste('image', reader.result, file.name, file.size);
      } else if (file.type.startsWith('video/')) {
        onPaste('video', reader.result, file.name, file.size);
      } else if (file.type.startsWith('text/')) {
        onPaste('text', reader.result, file.name, file.size);
      } else {
        onPaste('file', reader.result, file.name, file.size);
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

  const processClipboardItem = useCallback((item: DataTransferItem) => {
    if (item.kind === 'string' && item.type.startsWith('text/')) {
      item.getAsString((text) => onPaste('text', text));
    } else if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        processFile(file);
      }
    }
  }, [onPaste, processFile]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
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

  const handleDrop = (e: React.DragEvent) => {
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

  const handleCopy = async (item: ClipboardHistoryItem) => {
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
        await navigator.clipboard.write([ new ClipboardItem({ [blob.type]: blob }) ]);
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

  const getMimeType = (dataUrl: string): string | null => {
    const match = dataUrl.match(/^data:([^;]+);/);
    return match ? match[1] : null;
  };

  const getExtension = (mimeType: string | null, fallback: string): string => {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
      'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv',
    };
    return mimeType && mimeToExt[mimeType] ? mimeToExt[mimeType] : fallback;
  };

  const handleDownload = (item: ClipboardHistoryItem) => {
    const filename = item.name || `paste-${item.id}.${getExtension(getMimeType(item.content), 'txt')}`;
    
    if (item.type === 'text' && !item.name) {
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
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        rows={10}
        style={{ resize: 'vertical' }}
      />
      
      <div className="actions">
        <button onClick={handleSendText} className="btn btn-primary" disabled={!typedText.trim()} style={{ marginRight: '10px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11zM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493z"/></svg>
          Send Text
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4.5 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm2 0a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm2 0a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm2 0a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z"/><path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm12 14H2V2h12v13z"/></svg>
          Choose File
        </button>
        <input ref={fileInputRef} type="file" onChange={handleFileSelect} style={{ display: 'none' }} />
      </div>

      {encryptionEnabled && ( <div className="encryption-indicator">🔒 Encryption enabled</div> )}

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
                  {item.type === 'image' && ( <img src={item.content} alt={item.name || 'Pasted Image'} className="media-preview" /> )}
                  {item.type === 'video' && ( <video src={item.content} className="media-preview" controls /> )}
                  {item.type === 'file' && (
                    <div className="file-preview">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M4 0h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H4z"/>
                        <path d="M4.5 12.5A.5.5 0 0 1 5 12h3a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 10h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 8h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 6h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
                      </svg>
                      <span className="file-name">{item.name || 'Untitled File'}</span>
                      {item.size !== undefined && <span className="file-size">({formatBytes(item.size)})</span>}
                    </div>
                  )}
                </div>
                <div className="item-actions">
                  <span className="item-type">{item.type}</span>
                  <span className="item-timestamp">{new Date(item.timestamp).toLocaleTimeString()}</span>
                  <button onClick={() => handleCopy(item)} className="btn-icon" title="Copy">📋</button>
                  <button onClick={() => handleDownload(item)} className="btn-icon" title="Download">💾</button>
                  <button onClick={() => onDeleteItem(item.id)} className="btn-icon btn-danger" title="Delete">🗑️</button>
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