import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ClipboardItem as ClipboardHistoryItem } from '../types/ClipboardItem';
import { copyToClipboard, downloadFile, getMimeType } from '../utils/clipboard';
import FilePreview from './FilePreview';

interface ClipboardAreaProps {
  onPaste?: (type: string, content: string, name?: string, size?: number) => void;
  onFileSelect: (file: File) => void;
  history: ClipboardHistoryItem[];
  encryptionEnabled: boolean;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onDeleteItem: (id: string) => void;
}

const ClipboardArea: React.FC<ClipboardAreaProps> = ({
  onPaste,
  onFileSelect,
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
  const [loadErrors, setLoadErrors] = useState<Set<string>>(new Set());
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    const completedItems = history.filter(item => 
      item.status === 'complete' && 
      item.fileId && 
      !recentlyCompleted.has(item.id)
    );

    if (completedItems.length > 0) {
      const newCompleted = new Set(recentlyCompleted);
      completedItems.forEach(item => newCompleted.add(item.id));
      setRecentlyCompleted(newCompleted);

      completedItems.forEach(item => {
        setTimeout(() => {
          setRecentlyCompleted(prev => {
            const newSet = new Set(prev);
            newSet.delete(item.id);
            return newSet;
          });
        }, 5000); // Show status for 5 seconds
      });
    }
  }, [history, recentlyCompleted]);

  const handleMediaError = (id: string) => {
    setLoadErrors(prev => new Set(prev).add(id));
  };

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

  const handleFileSelected = useCallback((file: File) => {
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
    onFileSelect(file);
  }, [onFileSelect, showToast]);

  const processClipboardItem = useCallback((item: DataTransferItem) => {
    if (item.kind === 'string' && item.type.startsWith('text/') && onPaste) {
      item.getAsString((text) => onPaste('text', text));
    } else if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        handleFileSelected(file);
      }
    }
  }, [onPaste, handleFileSelected]);

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
      handleFileSelected(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]);
      // Reset the input so the same file can be selected again
      e.target.value = '';
    }
  };

  const handleCopy = (item: ClipboardHistoryItem) => {
    if (item.status && item.status !== 'complete') {
        showToast('Cannot copy file while it is transferring.', 'info');
        return;
    }

    if (item.type === 'text') {
      copyToClipboard(item.content)
        .then(() => {
          showToast('Copied to clipboard!', 'success');
          setCopiedItemId(item.id);
          setTimeout(() => setCopiedItemId(null), 1000);
        })
        .catch(error => {
          console.error('Failed to copy text to clipboard:', error);
          showToast('Failed to copy to clipboard', 'error');
        });
    } else if (item.type === 'image') {
      if (!navigator.clipboard || !navigator.clipboard.write) {
        showToast('Copying images is not supported in your browser.', 'error');
        return;
      }
      try {
        // Create a promise that resolves to the blob
        const blobPromise = fetch(item.content).then(res => res.blob());
        const mimeType = getMimeType(item.name);

        // Create a ClipboardItem with a promise for the blob
        const clipboardItem = new ClipboardItem({
          [mimeType]: blobPromise,
        });

        // Call write() synchronously with the ClipboardItem
        navigator.clipboard.write([clipboardItem])
          .then(() => {
            showToast('Image copied to clipboard!', 'success');
            setCopiedItemId(item.id);
            setTimeout(() => setCopiedItemId(null), 1000);
          })
          .catch(error => {
            console.error('Failed to copy image to clipboard:', error);
            showToast('Failed to copy image.', 'error');
          });
      } catch (error) {
        console.error('An unexpected error occurred during image copy setup:', error);
        showToast('Failed to copy image.', 'error');
      }
    } else {
        showToast(`Cannot copy ${item.type} directly. Please use the download button.`, 'info');
    }
  };

  const handleDownload = (item: ClipboardHistoryItem) => {
    if (item.status && item.status !== 'complete') {
        showToast('Cannot download file while it is transferring.', 'info');
        return;
    }
    const filename = item.name || `paste-${item.id}.dat`;
    
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
    if (typedText.trim() && onPaste) {
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
        <input ref={fileInputRef} type="file" onChange={handleFileChange} style={{ display: 'none' }} />
      </div>

      {encryptionEnabled && ( <div className="encryption-indicator">🔒 Encryption enabled</div> )}

      <div className="history">
        <h3>Recent Clips ({history.length})</h3>
        <div className="history-items">
          {history.length === 0 ? (
            <p className="empty-state">No clips yet. Start pasting!</p>
          ) : (
            history.map((item) => {
              const isTransferInProgress = item.status === 'uploading' || item.status === 'downloading';
              const isRecentlyCompleted = recentlyCompleted.has(item.id);

              return (
                <div key={item.id} className={`history-item ${copiedItemId === item.id ? 'copied-flash' : ''}`}>
                  <div className="item-content">
                    {item.type === 'text' ? (
                      <div className="text-preview">
                        {expandedItems.has(item.id) ? item.content : item.content.substring(0, 100)}
                        {item.content.length > 100 && (
                          <button onClick={() => toggleExpand(item.id)} className="btn-icon btn-small">
                            {expandedItems.has(item.id) ? '➖ Collapse' : '➕ Expand'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <FilePreview 
                        key={item.id + item.content}
                        item={item} 
                        onMediaError={handleMediaError}
                        loadErrors={loadErrors}
                      />
                    )}
                    {(isTransferInProgress || isRecentlyCompleted) && (
                      <div className="progress-bar-container">
                        {item.progress !== 100 && !isRecentlyCompleted && <progress value={item.progress || 0} max="100" />}
                        <span className={`progress-text ${item.progress === 100 || isRecentlyCompleted ? 'progress-complete' : ''}`}>
                          {(item.progress === 100 || isRecentlyCompleted)
                            // For recently completed downloads, status will be 'complete'. We determine the action based on the 'fileId' which is only present for downloads.
                            ? (item.status === 'uploading' ? 'Uploaded' : 'Downloaded')
                            : `${item.status === 'uploading' ? 'Uploading' : 'Downloading'} ${item.progress?.toFixed(0) ?? 0}%`}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="item-actions">
                    <span className="item-type">{item.type}</span>
                    <span className="item-timestamp">{new Date(item.timestamp).toLocaleTimeString()}</span>
                    <button onClick={() => handleCopy(item)} className="btn-icon" title="Copy">📋</button>
                    <button onClick={() => handleDownload(item)} className="btn-icon" title="Download" disabled={isTransferInProgress}>💾</button>
                    <button onClick={() => onDeleteItem(item.id)} className="btn-icon btn-danger" title="Delete">🗑️</button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ClipboardArea;