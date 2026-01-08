import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import RoomInfo from '../components/RoomInfo';
import ClipboardArea from '../components/ClipboardArea';
import Toast from '../components/Toast';
import { useWebSocket } from '../utils/useWebSocket';
import { loadHistory, saveHistory, clearHistory } from '../utils/indexedDB';
import { addRecentRoom } from '../utils/recentRooms';
import type { ClipboardItem } from '../types/ClipboardItem';
import { WebSocketMessage } from '../types/index';
import { createImageThumbnail } from '../utils/image';
import '../App.css';

const MAX_HISTORY = 20;
const THUMBNAIL_MAX_WIDTH = 200;
const THUMBNAIL_MAX_HEIGHT = 200;

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

const Room: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [history, setHistory] = useState<ClipboardItem[]>([]);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [autoCopyEnabled, setAutoCopyEnabled] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const lastAutoCopyRef = useRef<number>(0);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  const handleToggleAutoCopy = async (enabled: boolean) => {
    if (enabled) {
      if (!navigator.clipboard || !window.isSecureContext) {
        showToast('Auto-copy requires a secure context (HTTPS).', 'error');
        return;
      }
      try {
        const permission = await navigator.permissions.query({ name: 'clipboard-write' as PermissionName });
        if (permission.state === 'denied') {
          showToast('Permission to write to clipboard is denied.', 'error');
          return;
        }
        if (permission.state === 'prompt') {
          showToast('Please allow clipboard access for auto-copy to work.', 'info');
        }
      } catch (error) {
        console.error('Clipboard permission query failed:', error);
      }
    }
    setAutoCopyEnabled(enabled);
  };


  const copyTextToClipboard = useCallback((text: string) => {
    const textArea = document.createElement('textarea');
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        showToast('Text auto-copied to clipboard', 'success');
      } else {
        showToast('Auto-copy failed. Please interact with the page first.', 'error');
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
      showToast('Auto-copy failed. An unexpected error occurred.', 'error');
    }
    document.body.removeChild(textArea);
  }, [showToast]);

  const handleFileTransferUpdate = useCallback((update: WebSocketMessage) => {
    setHistory(prev => prev.map(item => {
      if (item.fileId === update.fileId) {
        const newItem = { ...item };
        if (update.type === 'file-progress') {
          newItem.progress = update.progress;
        } else if (update.type === 'file-complete') {
          // Revoke old blob url if it exists and is a blob url
          if (newItem.content && newItem.content.startsWith('blob:')) {
            URL.revokeObjectURL(newItem.content);
          }
          newItem.status = 'complete';
          newItem.content = update.content!;
          newItem.progress = 100;
        } else if (update.type === 'file-error') {
          showToast(`File transfer failed: ${update.message}`, 'error');
          return null; // remove from history
        }
        return newItem;
      }
      return item;
    }).filter(Boolean) as ClipboardItem[]);
  }, [showToast]);

  const handleClipboardReceived = useCallback((message: WebSocketMessage) => {
    // Handler for all incoming messages from the WebSocket
    switch (message.type) {
      case 'file-start':
        if (message.fileId) {
          const newItem: ClipboardItem = {
            id: message.fileId,
            fileId: message.fileId,
            type: message.fileType as ClipboardItem['type'] || 'file',
            content: '', // No content yet
            timestamp: message.timestamp || Date.now(),
            name: message.fileName,
            size: message.fileSize,
            encrypted: true,
            status: 'generating', // New status for waiting for thumbnail
            progress: 0,
          };
          setHistory(prev => {
            if (prev.some(item => item.id === newItem.id)) return prev;
            return [newItem, ...prev].slice(0, MAX_HISTORY);
          });
        }
        break;

      case 'clipboard':
        if (message.fileId && message.previewContent) {
          // This is the arrival of the thumbnail, update the placeholder
          setHistory(prev => prev.map(item => {
            if (item.fileId === message.fileId) {
              return {
                ...item,
                content: message.previewContent || '',
                type: message.contentType as ClipboardItem['type'] || item.type,
                status: 'downloading', // Start showing progress bar
              };
            }
            return item;
          }));
        } else if (!message.fileId) {
          // This is a regular text message
          const newItem: ClipboardItem = {
            id: Date.now().toString(),
            type: 'text',
            content: message.content || '',
            timestamp: message.timestamp || Date.now(),
            encrypted: true,
            status: 'complete',
            progress: 100,
          };
          setHistory(prev => [newItem, ...prev].slice(0, MAX_HISTORY));

          if (autoCopyEnabled && message.content) {
            const now = Date.now();
            if (now - lastAutoCopyRef.current > 2000) {
              lastAutoCopyRef.current = now;
              if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(message.content)
                  .then(() => showToast('Text auto-copied to clipboard', 'success'))
                  .catch((err) => {
                    console.error('Auto-copy with navigator.clipboard failed, falling back.', err);
                    copyTextToClipboard(message.content!);
                  });
              } else {
                copyTextToClipboard(message.content!);
              }
            }
          }
        }
        break;
    }
  }, [autoCopyEnabled, showToast, copyTextToClipboard]);

  const { roomState, sendMessage, uploadFile, leaveRoom, isE2eeEnabled } = useWebSocket(
    handleClipboardReceived,
    handleFileTransferUpdate,
    roomId
  );

  useEffect(() => {
    if (!roomId) return;
    const fetchHistory = async () => {
      try {
        const savedHistory = await loadHistory(roomId);
        if (savedHistory && Array.isArray(savedHistory)) {
          // Filter out any incomplete transfers from previous sessions
          setHistory(savedHistory.filter(item => item.status === 'complete' || !item.status));
        }
      } catch (error) {
        console.error('Failed to load history from IndexedDB:', error);
        showToast('Could not load history.', 'error');
      } finally {
        setIsHistoryLoaded(true);
      }
    };
    fetchHistory();
  }, [roomId, showToast]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const now = Date.now();
      const thirtyMinutes = 30 * 60 * 1000;
      setHistory(prev => prev.filter(item => now - item.timestamp < thirtyMinutes));
    }, 60 * 1000); // Run every minute

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!roomId || !isHistoryLoaded) return;
  
    const timeoutId = setTimeout(async () => {
      try {
        // Only save completed items to persistent storage
        const historyToSave = history.filter(item => item.status === 'complete' || !item.status);
        await saveHistory(roomId, historyToSave);
      } catch (error) {
        console.error('Failed to save history to IndexedDB:', error);
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          showToast('Storage quota exceeded. History not saved.', 'error');
        } else {
          showToast('Failed to save history.', 'error');
        }
      }
    }, 1000);
  
    return () => clearTimeout(timeoutId);
  }, [history, roomId, showToast, isHistoryLoaded]);

  const handleFileSelect = useCallback(async (file: File) => {
    const fileId = `${Date.now()}-${file.name}`;
    let fileType: ClipboardItem['type'] = 'file';
    const majorType = file.type.split('/')[0];

    switch (majorType) {
      case 'image':
        fileType = 'image';
        break;
      case 'video':
        fileType = 'video';
        break;
      case 'audio':
        fileType = 'audio';
        break;
      case 'application':
        fileType = 'application';
        break;
      default:
        fileType = 'file';
    }
    
    // Create a placeholder for the sender's UI immediately
    const initialItem: ClipboardItem = {
      id: fileId,
      fileId: fileId,
      type: fileType,
      content: '', // Empty initially
      name: file.name,
      size: file.size,
      timestamp: Date.now(),
      encrypted: true,
      status: fileType === 'image' ? 'generating' : 'uploading',
      progress: 0,
    };
    setHistory(prev => [initialItem, ...prev].slice(0, MAX_HISTORY));

    // Generate thumbnail for images
    let previewContent: string | undefined = undefined;
    if (fileType === 'image') {
      try {
        previewContent = await createImageThumbnail(file, THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT);
      } catch (error) {
        console.warn('Could not create thumbnail for image:', error);
      }
    }
    
    // Update the local UI with the thumbnail or a blob URL for local preview
    const localPreviewUrl = previewContent || URL.createObjectURL(file);
    setHistory(prev => prev.map(item => 
      item.id === fileId 
        ? { ...item, content: localPreviewUrl, status: 'uploading' as const }
        : item
    ));

    // The hook now handles the entire upload sequence
    if (uploadFile) {
        await uploadFile(file, fileId, previewContent);
    } else {
       showToast('File upload is not available.', 'error');
    }
  }, [uploadFile, showToast]);

  const handlePaste = useCallback(async (type: string, content: string) => {
    // Check if text is too large for a single WebSocket message (limit is 2MB, safety margin 1MB)
    const sizeInBytes = new Blob([content]).size;
    if (sizeInBytes > 1024 * 1024) {
      showToast('Text too large. sending as file...', 'info');
      const file = new File([content], `Large Text ${new Date().toLocaleTimeString()}.txt`, { type: 'text/plain' });
      handleFileSelect(file);
      return;
    }

    const newItem: ClipboardItem = {
      id: Date.now().toString(),
      type: 'text',
      content,
      timestamp: Date.now(),
      encrypted: true,
      status: 'complete',
      progress: 100,
    };

    setHistory(prev => [newItem, ...prev].slice(0, MAX_HISTORY));

    const sent = await sendMessage({
      type: 'clipboard',
      contentType: 'text',
      content: content,
    });

    if (!sent) {
      showToast('Failed to send content. WebSocket not connected.', 'error');
    }
  }, [sendMessage, showToast, handleFileSelect]);

  const handleLeaveRoom = () => {
    if (roomId) {
      addRecentRoom(roomId);
    }
    leaveRoom();
    navigate('/');
  };

  const handleDeleteItem = useCallback((id: string) => {
    setHistory(prev => prev.filter(item => {
        if (item.id === id && item.content && item.content.startsWith('blob:')) {
            URL.revokeObjectURL(item.content);
        }
        return item.id !== id;
    }));
    showToast('Clip deleted from history', 'info');
  }, [showToast]);

  const handleClearAll = useCallback(async () => {
    setHistory(prev => {
        prev.forEach(item => {
            if (item.content && item.content.startsWith('blob:')) {
                URL.revokeObjectURL(item.content);
            }
        });
        return [];
    });
    if (roomId) {
      try {
        await clearHistory(roomId);
        showToast('All clips have been deleted from history', 'info');
      } catch (error) {
        console.error('Failed to clear history from IndexedDB:', error);
        showToast('Could not clear history.', 'error');
      }
    }
  }, [roomId, showToast]);

  return (
    <>
      <RoomInfo 
        roomState={roomState}
        onLeave={handleLeaveRoom}
        encryptionEnabled={isE2eeEnabled}
        autoCopyEnabled={autoCopyEnabled}
        onToggleAutoCopy={handleToggleAutoCopy}
        showToast={showToast}
        onClearAll={handleClearAll}
      />
      <ClipboardArea 
        onPaste={handlePaste}
        onFileSelect={handleFileSelect}
        history={history}
        encryptionEnabled={isE2eeEnabled}
        showToast={showToast}
        onDeleteItem={handleDeleteItem}
      />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
};

export default Room;
