import React, { useEffect, useCallback } from 'react';
import type { ClipboardItem } from '../../types/ClipboardItem';
import { downloadFile } from '../../utils/clipboard';
import { convertBlobToPng } from '../../utils/image';
import './MediaViewer.css';

interface MediaViewerProps {
  item: ClipboardItem;
  onClose: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const MediaViewer: React.FC<MediaViewerProps> = ({ item, onClose, showToast }) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const handleDownload = () => {
    const filename = item.name || `paste-${item.id}.${item.type === 'video' ? 'mp4' : 'png'}`;
    downloadFile(item.content, filename);
  };

  const handleCopy = async () => {
    if (!navigator.clipboard || !navigator.clipboard.write) {
      showToast('Copying images is not supported in your browser.', 'error');
      return;
    }
    try {
      const response = await fetch(item.content);
      let blob = await response.blob();

      const supportedTypes = ['image/png'];
      if (!supportedTypes.includes(blob.type)) {
        try {
          blob = await convertBlobToPng(blob);
        } catch {
          showToast('Failed to convert image format for clipboard.', 'error');
          return;
        }
      }

      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      showToast('Image copied to clipboard!', 'success');
    } catch {
      showToast('Failed to copy image.', 'error');
    }
  };

  return (
    <div className="media-viewer-overlay" onClick={onClose}>
      <button className="media-viewer-close" onClick={onClose} aria-label="Close">
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="media-viewer-content" onClick={(e) => e.stopPropagation()}>
        {item.type === 'image' ? (
          <img src={item.content} alt={item.name || 'Image'} className="media-viewer-media" />
        ) : (
          <video src={item.content} className="media-viewer-media" controls autoPlay />
        )}
      </div>

      <div className="media-viewer-toolbar" onClick={(e) => e.stopPropagation()}>
        <button onClick={handleDownload} className="media-viewer-btn">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download
        </button>
        {item.type === 'image' && (
          <button onClick={handleCopy} className="media-viewer-btn">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy
          </button>
        )}
      </div>
    </div>
  );
};

export default MediaViewer;
