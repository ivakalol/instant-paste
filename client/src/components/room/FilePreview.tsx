import React, { useEffect } from 'react';
import type { ClipboardItem } from '../../types/ClipboardItem';
import { getFileExtension, truncateFilename } from '../../utils/clipboard';

interface FilePreviewProps {
  item: ClipboardItem;
  onMediaError: (id: string) => void;
  loadErrors: Set<string>;
}

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

const FilePreview: React.FC<FilePreviewProps> = ({ item, onMediaError, loadErrors }) => {
  useEffect(() => {
    // Cleanup function to revoke blob URLs
    const contentToRevoke = item.content;
    const previewToRevoke = item.previewContent;
    return () => {
      if (contentToRevoke && contentToRevoke.startsWith('blob:')) {
        URL.revokeObjectURL(contentToRevoke);
      }
      if (previewToRevoke && previewToRevoke.startsWith('blob:')) {
        URL.revokeObjectURL(previewToRevoke);
      }
    };
  }, []);

  const fileExtension = getFileExtension(item.name);
  
  // Prefer full content if available and complete, otherwise use previewContent
  const isComplete = item.status === 'complete' || !item.status;
  const displayContent = (isComplete && item.content) ? item.content : (item.previewContent || item.content);

  // Show loading indicator while thumbnail is being generated
  if (item.status === 'generating') {
    return (
      <div className="file-preview generating">
        <div className="generating-preview">
          <div className="spinner" />
          <span>Thumbnail loading...</span>
        </div>
        <div className="file-info">
          <span className="file-name">{truncateFilename(item.name)}</span>
          {item.size !== undefined && <span className="file-size">({formatBytes(item.size)})</span>}
        </div>
      </div>
    );
  }

  if (loadErrors.has(item.id)) {
    return (
      <div className="file-preview error">
        <span>Preview of <strong>.{fileExtension}</strong> not available.</span>
        <span className="download-prompt">Please download <span className="file-name">{truncateFilename(item.name)}</span>.</span>
      </div>
    );
  }

  switch (item.type) {
    case 'image':
      return (
        <img
          src={displayContent}
          alt={item.name || 'Pasted Image'}
          className="media-preview"
          onError={() => onMediaError(item.id)}
        />
      );
    case 'video':
      return (
        <video
          src={displayContent}
          className="media-preview"
          controls
          onError={() => onMediaError(item.id)}
        />
      );
    case 'audio':
        return (
          <div className="file-preview">
            <audio src={displayContent} controls className="media-preview" onError={() => onMediaError(item.id)} />
            <div className="file-info">
              <span className="file-name">{truncateFilename(item.name)}</span>
              {item.size !== undefined && <span className="file-size">({formatBytes(item.size)})</span>}
            </div>
          </div>
        );
    case 'application':
      if (fileExtension === 'pdf') {
        return (
            <div className="file-preview">
                <object data={displayContent} type="application/pdf" width="100%" height="500px">
                    <p>PDF preview is not supported in your browser. You can <a href={displayContent} download={item.name}>download it instead</a>.</p>
                </object>
            </div>
        );
      }
      return (
        <div className="item-info">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
            <path d="M4 0h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H4z"/>
            <path d="M4.5 12.5A.5.5 0 0 1 5 12h3a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 10h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 8h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 6h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
          </svg>
          <div className="file-info">
            <span className="file-name">{truncateFilename(item.name)}</span>
            {item.size !== undefined && <span className="file-size">{formatBytes(item.size)}</span>}
          </div>
        </div>
      );
    default:
        return (
            <div className="item-info">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                <path d="M4 0h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H4z"/>
                <path d="M4.5 12.5A.5.5 0 0 1 5 12h3a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 10h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 8h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 6h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
              </svg>
              <div className="file-info">
                <span className="file-name">{truncateFilename(item.name)}</span>
                {item.size !== undefined && <span className="file-size">{formatBytes(item.size)}</span>}
              </div>
            </div>
          );
  }
};

export default FilePreview;