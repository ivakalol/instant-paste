import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ClipboardItem } from '../types';
import { copyToClipboard, downloadFile } from '../utils/clipboard';

interface ClipboardAreaProps {
  onPaste: (type: string, content: string) => void;
  history: ClipboardItem[];
  encryptionEnabled: boolean;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ClipboardArea: React.FC<ClipboardAreaProps> = ({ 
  onPaste, 
  history,
  encryptionEnabled,
  showToast
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [typedText, setTypedText] = useState('');
  const pasteAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to read and process files
  const processFile = useCallback((file: File) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      if (file.type.startsWith('image/')) {
        onPaste('image', reader.result as string);
      } else if (file.type.startsWith('video/')) {
        onPaste('video', reader.result as string);
      } else if (file.type.startsWith('text/')) {
        onPaste('text', reader.result as string);
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
      } else {
        showToast('Failed to copy to clipboard', 'error');
      }
    }
  };

  const handleDownload = (item: ClipboardItem) => {
    const ext = item.type === 'image' ? 'png' : item.type === 'video' ? 'mp4' : 'txt';
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
        rows={3}
        style={{ resize: 'vertical' }}
      />
      
      <div className="actions">
        <button 
          onClick={handleSendText}
          className="send-btn"
          disabled={!typedText.trim()}
        >
          📤 Send Text
        </button>
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="btn btn-small"
        >
          📎 Choose File
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
              <div key={item.id} className="history-item">
                <div className="item-content">
                  {item.type === 'text' && (
                    <div className="text-preview">
                      {item.content.substring(0, 100)}
                      {item.content.length > 100 && '...'}
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
                  <button onClick={() => handleCopy(item)} className="btn-icon" title="Copy">
                    📋
                  </button>
                  <button onClick={() => handleDownload(item)} className="btn-icon" title="Download">
                    💾
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
