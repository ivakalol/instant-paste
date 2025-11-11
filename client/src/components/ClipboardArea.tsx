import React, { useState, useRef, useEffect } from 'react';
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
  const pasteAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      e.preventDefault();
      
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (item.type.startsWith('text/')) {
          item.getAsString((text) => {
            onPaste('text', text);
          });
        } else if (item.type.indexOf('image') === 0) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = () => {
              onPaste('image', reader.result as string);
            };
            reader.readAsDataURL(blob);
          }
        } else if (item.type.indexOf('video') === 0) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = () => {
              onPaste('video', reader.result as string);
            };
            reader.readAsDataURL(blob);
          }
        }
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
  }, [onPaste]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
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

      if (file.type.startsWith('text/')) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
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

      if (file.type.startsWith('text/')) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
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

  return (
    <div className="clipboard-area">
      <textarea
        ref={pasteAreaRef}
        className={`paste-zone ${isDragging ? 'dragging' : ''}`}
        placeholder="Paste or type here (Ctrl+V / Cmd+V) or drag & drop files..."
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
