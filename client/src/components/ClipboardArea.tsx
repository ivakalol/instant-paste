import React, { useState, useRef, useEffect, useCallback } from 'react';
import './ClipboardArea.css';
import type { ClipboardItem as ClipboardHistoryItem } from '../types/ClipboardItem';
import { copyToClipboard, downloadFile } from '../utils/clipboard';
import { convertBlobToPng } from '../utils/image';
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

  const handleFileSelected = useCallback(async (file: File) => {
    const passwordPromptSize = 150 * 1024 * 1024; // 150 MB

    if (file.size > passwordPromptSize) {
      const enteredPassword = prompt(`This file is larger than 150MB. Please enter the password to proceed:`);
      if (enteredPassword === null) {
        return;
      }
      try {
        const response = await fetch('/api/verify-upload-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: enteredPassword }),
        });
        const data = await response.json();
        if (!data.valid) {
          showToast('Incorrect password.', 'error');
          return;
        }
      } catch {
        showToast('Password verification failed. Please try again.', 'error');
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
      // Process all dropped files
      for (let i = 0; i < files.length; i++) {
        handleFileSelected(files[i]);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Process all selected files
      for (let i = 0; i < files.length; i++) {
        handleFileSelected(files[i]);
      }
      // Reset the input so the same files can be selected again
      e.target.value = '';
    }
  };

  const handleCopy = async (item: ClipboardHistoryItem) => {
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
        const response = await fetch(item.content);
        let blob = await response.blob();
        
        // Firefox only reliably supports PNG for writing to clipboard. We convert other types (like JPEG, GIF, WebP) to PNG.
        const supportedTypes = ['image/png'];
        if (!supportedTypes.includes(blob.type)) {
            try {
                blob = await convertBlobToPng(blob);
            } catch (conversionError) {
                console.error('Failed to convert image to PNG:', conversionError);
                showToast('Failed to convert image format for clipboard compatibility.', 'error');
                return;
            }
        }

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
      {/* ── Compose area ── */}
      <div className="compose">
        <textarea
          ref={pasteAreaRef}
          className={`compose__input ${isDragging ? 'compose__input--drag' : ''}`}
          placeholder="Paste, type, or drag files here…"
          value={typedText}
          onChange={(e) => setTypedText(e.target.value)}
          onKeyDown={handleKeyDown}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          rows={4}
        />
        <div className="compose__bar">
          <button onClick={() => fileInputRef.current?.click()} className="compose__attach" title="Attach files">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            Attach
          </button>
          <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} style={{ display: 'none' }} />

          <span className="compose__hint">Ctrl+Enter to send</span>

          <button onClick={handleSendText} className="compose__send" disabled={!typedText.trim()} title="Send text">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Send
          </button>
        </div>
      </div>

      {/* ── Recent clips ── */}
      <div className="clips">
        <div className="clips__header">
          <h3 className="clips__title">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M12 2v6l3-3m-6 0l3 3"/><rect x="3" y="10" width="18" height="12" rx="2"/>
            </svg>
            Recent Clips
            <span className="clips__count">{history.length}</span>
          </h3>
        </div>

        <div className="clips__list">
          {history.length === 0 ? (
            <div className="clips__empty">
              <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="9" y="3" width="6" height="4" rx="1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>No clips yet — paste or send something!</span>
            </div>
          ) : (
            history.map((item) => {
              const isTransferInProgress = item.status === 'uploading' || item.status === 'downloading';
              const isRecentlyCompleted = recentlyCompleted.has(item.id);

              return (
                <div key={item.id} className={`clip-card ${copiedItemId === item.id ? 'clip-card--flash' : ''}`}>
                  <div className="clip-card__body">
                    {item.type === 'text' ? (
                      <div className="clip-card__text">
                        {expandedItems.has(item.id) ? item.content : item.content.substring(0, 100)}
                        {item.content.length > 100 && (
                          <button onClick={() => toggleExpand(item.id)} className="clip-card__expand">
                            {expandedItems.has(item.id) ? 'Show less' : '…more'}
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
                      <div className="clip-card__progress">
                        {item.progress !== 100 && !isRecentlyCompleted && (
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${item.progress || 0}%` }} />
                          </div>
                        )}
                        <span className={`progress-label ${(item.progress === 100 || isRecentlyCompleted) ? 'progress-label--done' : ''}`}>
                          {(item.progress === 100 || isRecentlyCompleted)
                            ? (item.status === 'uploading' ? '✓ Uploaded' : '✓ Downloaded')
                            : `${item.status === 'uploading' ? 'Uploading' : 'Downloading'} ${item.progress?.toFixed(0) ?? 0}%`}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="clip-card__footer">
                    <div className="clip-card__meta">
                      <span className="clip-card__type">{item.type}</span>
                      <span className="clip-card__time">{new Date(item.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="clip-card__actions">
                      <button onClick={() => handleCopy(item)} className="clip-btn" title="Copy">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy
                      </button>
                      <button onClick={() => handleDownload(item)} className="clip-btn" title="Download" disabled={isTransferInProgress}>
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Save
                      </button>
                      <button onClick={() => onDeleteItem(item.id)} className="clip-btn clip-btn--danger" title="Delete">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                        </svg>
                      </button>
                    </div>
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