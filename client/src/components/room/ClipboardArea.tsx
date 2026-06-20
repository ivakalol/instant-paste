import React, { useState, useRef, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import './ClipboardArea.css';
import type { ClipboardItem as ClipboardHistoryItem } from '../../types/ClipboardItem';
import { copyToClipboard, downloadFile } from '../../utils/clipboard';
import { convertBlobToPng } from '../../utils/image';
import FilePreview from './FilePreview';
import MediaViewer from '../common/MediaViewer';

interface ClipboardAreaProps {
  onPaste?: (type: ClipboardHistoryItem['type'], content: string, name?: string, size?: number) => void;
  onFileSelect: (file: File, uploadToken?: string) => void;
  onFilesSelect: (files: File[], uploadToken?: string) => void;
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
  onFileSelect,
  onFilesSelect,
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
  const [viewerItem, setViewerItem] = useState<ClipboardHistoryItem | null>(null);

  useEffect(() => {
    const completedItems = history.filter(item =>
      item.status === 'complete' &&
      (item.fileId || item.type === 'collection') &&
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

  const verifyLargeFileUpload = useCallback(async (files: File[]): Promise<string | undefined | false> => {
    const passwordPromptSize = 150 * 1024 * 1024; // 150 MB
    let uploadToken: string | undefined;

    if (files.some(file => file.size > passwordPromptSize)) {
      const enteredPassword = prompt(`One or more files are larger than 150MB. Please enter the password to proceed:`);
      if (enteredPassword === null) {
        return false;
      }
      try {
        const response = await fetch('/api/verify-upload-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: enteredPassword }),
        });
        const data = await response.json();
        if (!data.valid || typeof data.uploadToken !== 'string') {
          showToast('Incorrect password.', 'error');
          return false;
        }
        uploadToken = data.uploadToken;
      } catch {
        showToast('Password verification failed. Please try again.', 'error');
        return false;
      }
    }
    return uploadToken;
  }, [showToast]);

  const handleFileSelected = useCallback(async (file: File) => {
    const uploadToken = await verifyLargeFileUpload([file]);
    if (uploadToken === false) {
      return;
    }
    onFileSelect(file, uploadToken);
  }, [onFileSelect, verifyLargeFileUpload]);

  const handleFilesSelected = useCallback(async (selectedFiles: File[] | FileList) => {
    const files = Array.from(selectedFiles);
    if (files.length === 0) return;
    if (files.length === 1) {
      await handleFileSelected(files[0]);
      return;
    }
    const uploadToken = await verifyLargeFileUpload(files);
    if (uploadToken === false) {
      return;
    }
    onFilesSelect(files, uploadToken);
  }, [handleFileSelected, onFilesSelect, verifyLargeFileUpload]);

  const processClipboardItem = useCallback((item: DataTransferItem) => {
    if (item.kind === 'string' && item.type === 'text/html' && onPaste) {
      item.getAsString((text) => onPaste('rich-text', text));
      return true;
    } else if (item.kind === 'string' && item.type === 'text/plain' && onPaste) {
      item.getAsString((text) => onPaste('text', text));
      return true;
    } else if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        handleFileSelected(file);
        return true;
      }
    }
    return false;
  }, [onPaste, handleFileSelected]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      e.preventDefault();

      // Prioritize files and keep multi-file clipboard payloads grouped together.
      const files = Array.from(items)
        .filter(item => item.kind === 'file')
        .map(item => item.getAsFile())
        .filter((file): file is File => Boolean(file));

      if (files.length > 0) {
        handleFilesSelected(files);
        return;
      }

      // Then prioritize rich text (HTML)
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'string' && items[i].type === 'text/html') {
          processClipboardItem(items[i]);
          return;
        }
      }

      // Finally fallback to plain text
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'string' && items[i].type === 'text/plain') {
          processClipboardItem(items[i]);
          return;
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
  }, [processClipboardItem, handleFilesSelected]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFilesSelected(files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFilesSelected(files);
      // Reset the input so the same files can be selected again
      e.target.value = '';
    }
  };

  const isTransferActive = (item: ClipboardHistoryItem) => (
    (item.status === 'uploading' || item.status === 'downloading' || item.status === 'generating')
    && (item.progress ?? 0) < 100
  );

  const getCollectionItems = (item: ClipboardHistoryItem) => item.items ?? [];

  const getCollectionLabel = (item: ClipboardHistoryItem) => {
    const files = getCollectionItems(item);
    if (item.name) return item.name;
    const allPhotos = files.length > 0 && files.every(file => file.type === 'image');
    return `${files.length} ${allPhotos ? 'photos' : 'files'}`;
  };

  const canOpenInViewer = (item: ClipboardHistoryItem) => (
    (item.type === 'image' || item.type === 'video')
    && (!item.status || item.status === 'complete' || item.previewContent)
    && Boolean(item.content || item.previewContent)
  );

  const renderCompactFilePreview = (item: ClipboardHistoryItem) => {
    const content = item.previewContent || item.content;
    if (item.type === 'image' && content && !loadErrors.has(item.id)) {
      return (
        <img
          src={content}
          alt={item.name || 'Image'}
          onError={() => handleMediaError(item.id)}
        />
      );
    }

    if (item.type === 'video' && content && !loadErrors.has(item.id)) {
      return (
        <video
          src={content}
          muted
          playsInline
          onError={() => handleMediaError(item.id)}
        />
      );
    }

    return (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    );
  };

  const handleCopy = async (item: ClipboardHistoryItem) => {
    if (item.type === 'collection') {
      toggleExpand(item.id);
      return;
    }

    if (isTransferActive(item)) {
        showToast('Cannot copy file while it is transferring.', 'info');
        return;
    }

    if (item.type === 'text' || item.type === 'rich-text') {
      if (item.type === 'rich-text' && navigator.clipboard && navigator.clipboard.write) {
        try {
          // Try to copy both HTML and a plain text version
          const plainText = DOMPurify.sanitize(item.content.replace(/<br\s*\/?>/gi, '\n'), { ALLOWED_TAGS: [] }).replace(/&nbsp;/g, ' ');
          const clipboardItem = new ClipboardItem({
            'text/html': new Blob([item.content], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' })
          });
          await navigator.clipboard.write([clipboardItem]);
          showToast('Copied to clipboard!', 'success');
          setCopiedItemId(item.id);
          setTimeout(() => setCopiedItemId(null), 1000);
          return;
        } catch (err) {
          console.error('Failed to copy rich text:', err);
          // Fallback to plain text if rich text copy fails
        }
      }

      const contentToCopy = item.type === 'rich-text'
        ? DOMPurify.sanitize(item.content.replace(/<br\s*\/?>/gi, '\n'), { ALLOWED_TAGS: [] }).replace(/&nbsp;/g, ' ')
        : item.content;

      copyToClipboard(contentToCopy)
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
        if (!item.content) {
          showToast('Full image not yet available.', 'info');
          return;
        }

        // Use the modern promise-based approach for better Safari/iOS compatibility.
        // Safari requires the clipboard write to be triggered by a user gesture,
        // and using a Promise inside ClipboardItem helps maintain that context.
        const clipboardItem = new ClipboardItem({
          'image/png': (async () => {
            const response = await fetch(item.content!);
            const blob = await response.blob();
            if (blob.type === 'image/png') {
              return blob;
            }
            return await convertBlobToPng(blob);
          })()
        });

        await navigator.clipboard.write([clipboardItem]);
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
    if (item.type === 'collection') {
      if (isTransferActive(item)) {
        showToast('Please wait for the folder transfer to finish.', 'info');
        return;
      }

      const downloadableItems = getCollectionItems(item).filter(file => file.content && !isTransferActive(file));
      if (downloadableItems.length === 0) {
        showToast('No files are ready to download yet.', 'info');
        return;
      }

      downloadableItems.forEach(file => {
        downloadFile(file.content, file.name || `paste-${file.id}`);
      });
      showToast(`Downloading ${downloadableItems.length} files...`, 'success');
      return;
    }

    if (isTransferActive(item)) {
        showToast('Cannot download file while it is transferring.', 'info');
        return;
    }
    const filename = item.name || `paste-${item.id}`;

    if ((item.type === 'text' || item.type === 'rich-text') && !item.name) {
      const mimeType = item.type === 'rich-text' ? 'text/html' : 'text/plain';
      const ext = item.type === 'rich-text' ? 'html' : 'txt';
      const blob = new Blob([item.content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      downloadFile(url, `${filename}.${ext}`);
      URL.revokeObjectURL(url);
    } else {
      if (!item.content) {
        showToast('Full version not yet available.', 'info');
        return;
      }
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

  const handlePasteButtonClick = async () => {
    try {
      if (!navigator.clipboard) {
        showToast('Clipboard API not supported in this browser.', 'error');
        return;
      }

      // Try to read generic clipboard items (images, etc) first
      if (navigator.clipboard.read) {
        try {
          const clipboardItems = await navigator.clipboard.read();
          for (const item of clipboardItems) {
            for (const type of item.types) {
              if (type === 'text/html') {
                const blob = await item.getType(type);
                const text = await blob.text();
                if (onPaste) onPaste('rich-text', text);
                return;
              } else if (type.startsWith('image/')) {
                const blob = await item.getType(type);
                const file = new File([blob], `pasted-image-${Date.now()}.${type.split('/')[1]}`, { type });
                handleFileSelected(file);
                return; // Process one item at a time
              } else if (type === 'text/plain') {
                const blob = await item.getType(type);
                const text = await blob.text();
                if (onPaste) onPaste('text', text);
                return;
              }
            }
          }
        } catch (readErr) {
          // Fallback to readText if read() fails (some browsers restrict read())
          const text = await navigator.clipboard.readText();
          if (text && onPaste) {
            onPaste('text', text);
          } else {
            showToast('Failed to paste. Ensure you have given clipboard permission.', 'error');
          }
        }
      } else {
        // Fallback for browsers that only support readText
        const text = await navigator.clipboard.readText();
        if (text && onPaste) {
          onPaste('text', text);
        } else {
          showToast('Failed to paste. Ensure you have given clipboard permission.', 'error');
        }
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      showToast('Failed to paste from clipboard. Check permissions.', 'error');
    }
  };

  const renderCollectionFolder = (item: ClipboardHistoryItem) => {
    const files = getCollectionItems(item);
    const expanded = expandedItems.has(item.id);
    const visiblePreviewFiles = files.slice(0, 4);
    const remainingCount = Math.max(files.length - visiblePreviewFiles.length, 0);

    return (
      <div className="collection-folder">
        <button
          type="button"
          className="collection-folder__summary"
          onClick={() => toggleExpand(item.id)}
          aria-expanded={expanded}
        >
          <span className="collection-folder__icon">
            <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </span>
          <span className="collection-folder__details">
            <strong>{getCollectionLabel(item)}</strong>
            <span>
              {files.length} item{files.length === 1 ? '' : 's'}
              {item.size ? ` • ${formatBytes(item.size)}` : ''}
              {isTransferActive(item) ? ` • ${Math.round(item.progress ?? 0)}%` : ''}
            </span>
          </span>
          <span className={`collection-folder__chevron ${expanded ? 'collection-folder__chevron--open' : ''}`}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>

        <div className="collection-folder__preview-grid">
          {visiblePreviewFiles.map(file => (
            <div key={file.id} className="collection-folder__preview-tile">
              {renderCompactFilePreview(file)}
            </div>
          ))}
          {remainingCount > 0 && (
            <div className="collection-folder__preview-tile collection-folder__preview-tile--more">
              +{remainingCount}
            </div>
          )}
        </div>

        {isTransferActive(item) && (
          <div className="collection-folder__progress">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${item.progress || 0}%` }} />
            </div>
          </div>
        )}

        {expanded && (
          <div className="collection-folder__files">
            {files.map(file => (
              <div key={file.id} className="collection-file">
                <button
                  type="button"
                  className={`collection-file__thumb ${canOpenInViewer(file) ? 'collection-file__thumb--clickable' : ''}`}
                  onClick={() => {
                    if (canOpenInViewer(file)) {
                      setViewerItem(file);
                    }
                  }}
                  disabled={!canOpenInViewer(file)}
                  aria-label={`Open ${file.name || 'file'}`}
                >
                  {renderCompactFilePreview(file)}
                </button>

                <div className="collection-file__info">
                  <span className="collection-file__name">{file.name || `File ${file.id}`}</span>
                  <span className="collection-file__meta">
                    {file.type}
                    {file.size !== undefined ? ` • ${formatBytes(file.size)}` : ''}
                    {isTransferActive(file) ? ` • ${Math.round(file.progress ?? 0)}%` : ''}
                  </span>
                  {isTransferActive(file) && (
                    <div className="collection-file__progress">
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${file.progress || 0}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="collection-file__actions">
                  {(file.type === 'image' || file.type === 'video') && (
                    <button
                      onClick={() => setViewerItem(file)}
                      className="clip-btn"
                      title="Open"
                      disabled={!canOpenInViewer(file)}
                    >
                      Open
                    </button>
                  )}
                  <button
                    onClick={() => handleCopy(file)}
                    className="clip-btn"
                    title="Copy"
                    disabled={isTransferActive(file)}
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => handleDownload(file)}
                    className="clip-btn"
                    title="Download"
                    disabled={isTransferActive(file)}
                  >
                    Save
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
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

          <button onClick={handlePasteButtonClick} className="compose__paste" title="Paste from clipboard">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
              <path d="M9 14h6"/><path d="M12 11v6"/>
            </svg>
            Paste
          </button>

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
              const transferActive = isTransferActive(item);
              const isRecentlyCompleted = recentlyCompleted.has(item.id);
              const typeLabel = item.type === 'collection'
                ? 'folder'
                : item.type === 'rich-text' ? 'rich text' : item.type;

              return (
                <div key={item.id} className={`clip-card ${copiedItemId === item.id ? 'clip-card--flash' : ''}`}>
                  <div className="clip-card__body">
                    {item.type === 'collection' ? (
                      renderCollectionFolder(item)
                    ) : item.type === 'text' ? (
                      <div className="clip-card__text">
                        {expandedItems.has(item.id) ? item.content : item.content.substring(0, 100)}
                        {item.content.length > 100 && (
                          <button onClick={() => toggleExpand(item.id)} className="clip-card__expand">
                            {expandedItems.has(item.id) ? 'Show less' : '…more'}
                          </button>
                        )}
                      </div>
                    ) : item.type === 'rich-text' ? (
                      <div className={`clip-card__rich-text ${expandedItems.has(item.id) ? 'clip-card__rich-text--expanded' : ''}`}>
                        <div
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.content) }}
                        />
                        {item.content.length > 500 && (
                          <button onClick={() => toggleExpand(item.id)} className="clip-card__expand">
                            {expandedItems.has(item.id) ? 'Show less' : '…more'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div
                        className={(item.type === 'image' || item.type === 'video') && (!item.status || item.status === 'complete' || item.previewContent) && (item.content || item.previewContent) ? 'clip-card__media-clickable' : undefined}
                        onClick={() => {
                          if ((item.type === 'image' || item.type === 'video') && (!item.status || item.status === 'complete' || item.previewContent) && (item.content || item.previewContent)) {
                            setViewerItem(item);
                          }
                        }}
                      >
                        <FilePreview
                          key={item.id + item.content}
                          item={item}
                          onMediaError={handleMediaError}
                          loadErrors={loadErrors}
                        />
                      </div>
                    )}
                    {item.type !== 'collection' && (transferActive || isRecentlyCompleted) && (
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
                      <span className="clip-card__type">{typeLabel}</span>
                      <span className="clip-card__time">{new Date(item.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="clip-card__actions">
                      {item.type === 'collection' ? (
                        <>
                          <button onClick={() => toggleExpand(item.id)} className="clip-btn" title="Open folder">
                            {expandedItems.has(item.id) ? 'Close' : 'Open'}
                          </button>
                          <button onClick={() => handleDownload(item)} className="clip-btn" title="Download all" disabled={transferActive}>
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Save all
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleCopy(item)} className="clip-btn" title="Copy">
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            Copy
                          </button>
                          <button onClick={() => handleDownload(item)} className="clip-btn" title="Download" disabled={transferActive}>
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Save
                          </button>
                        </>
                      )}
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

      {viewerItem && (
        <MediaViewer
          item={viewerItem}
          onClose={() => setViewerItem(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
};

export default ClipboardArea;
