import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import RoomInfo from '../components/room/RoomInfo';
import ClipboardArea from '../components/room/ClipboardArea';
import Toast from '../components/common/Toast';
import { useWebSocket } from '../hooks/useWebSocket';
import { loadHistory, saveHistory, clearHistory } from '../utils/indexedDB';
import { addRecentRoom } from '../utils/recentRooms';
import type { ClipboardItem } from '../types/ClipboardItem';
import { WebSocketMessage } from '../types/index';
import { createImageThumbnail } from '../utils/image';
import '../App.css';
//this is a test comit
const MAX_HISTORY = 20;
const ALLOWED_CONTENT_TYPES: ReadonlySet<ClipboardItem['type']> = new Set([
  'text', 'rich-text', 'image', 'video', 'file', 'audio', 'application', 'collection',
]);
const toContentType = (value: string | undefined): ClipboardItem['type'] =>
  value && (ALLOWED_CONTENT_TYPES as Set<string>).has(value)
    ? (value as ClipboardItem['type'])
    : 'text';
const THUMBNAIL_MAX_WIDTH = 200;
const THUMBNAIL_MAX_HEIGHT = 200;

const createLocalId = () => (
  window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const getClipboardItemType = (
  contentType?: string,
  fileType?: string,
): ClipboardItem['type'] => {
  const source = contentType || fileType || '';

  if (source === 'text' || source === 'rich-text' || source === 'image'
    || source === 'video' || source === 'audio' || source === 'application'
    || source === 'file') {
    return source;
  }

  switch (source.split('/')[0]) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'application':
      return 'application';
    default:
      return 'file';
  }
};

const revokeClipboardItemUrls = (item: ClipboardItem) => {
  if (item.content?.startsWith('blob:')) {
    URL.revokeObjectURL(item.content);
  }
  if (item.previewContent?.startsWith('blob:')) {
    URL.revokeObjectURL(item.previewContent);
  }
  item.items?.forEach(revokeClipboardItemUrls);
};

const trimHistory = (items: ClipboardItem[]) => {
  items.slice(MAX_HISTORY).forEach(revokeClipboardItemUrls);
  return items.slice(0, MAX_HISTORY);
};

const getCollectionName = (items: ClipboardItem[], total = items.length) => {
  const count = total || items.length;
  const allKnownItemsArePhotos = items.length > 0 && items.every(item => item.type === 'image');
  const noun = allKnownItemsArePhotos
    ? (count === 1 ? 'photo' : 'photos')
    : (count === 1 ? 'file' : 'files');
  return `${count} ${noun}`;
};

const getTransferProgress = (item: ClipboardItem) => (
  item.status === 'complete' || !item.status ? 100 : item.progress ?? 0
);

const sortCollectionItems = (items: ClipboardItem[]) => (
  [...items].sort((a, b) => {
    const aIndex = a.collectionIndex ?? Number.MAX_SAFE_INTEGER;
    const bIndex = b.collectionIndex ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex || a.timestamp - b.timestamp;
  })
);

const refreshCollectionItem = (item: ClipboardItem): ClipboardItem => {
  const items = sortCollectionItems(item.items ?? []);
  const collectionTotal = item.collectionTotal ?? items.length;
  const progressDivisor = collectionTotal || items.length || 1;
  const totalProgress = items.reduce((sum, child) => sum + getTransferProgress(child), 0);
  const allComplete = items.length > 0
    && items.length >= collectionTotal
    && items.every(child => child.status === 'complete' || !child.status);
  const hasDownloading = items.some(child => child.status === 'downloading');
  const hasUploading = items.some(child => child.status === 'uploading' || child.status === 'generating');

  return {
    ...item,
    collectionTotal,
    items,
    name: getCollectionName(items, collectionTotal),
    size: items.reduce((sum, child) => sum + (child.size ?? 0), 0),
    status: allComplete ? 'complete' : hasDownloading ? 'downloading' : hasUploading ? 'uploading' : item.status,
    progress: allComplete ? 100 : totalProgress / progressDivisor,
  };
};

const createLocalFileItem = (
  file: File,
  fileId: string,
  timestamp: number,
  collectionId?: string,
  collectionTotal?: number,
  collectionIndex?: number,
): ClipboardItem => {
  const fileType = getClipboardItemType(undefined, file.type);
  return {
    id: fileId,
    fileId,
    collectionId,
    collectionTotal,
    collectionIndex,
    type: fileType,
    content: '',
    name: file.name,
    size: file.size,
    timestamp,
    encrypted: true,
    status: fileType === 'image' ? 'generating' : 'uploading',
    progress: 0,
  };
};

const createIncomingFileItem = (
  message: WebSocketMessage,
  status: ClipboardItem['status'],
): ClipboardItem => ({
  id: message.fileId!,
  fileId: message.fileId,
  collectionId: message.collectionId,
  collectionTotal: message.collectionTotal,
  collectionIndex: message.collectionIndex,
  type: getClipboardItemType(message.contentType, message.fileType),
  content: '',
  previewContent: message.previewContent,
  timestamp: message.timestamp || Date.now(),
  name: message.fileName,
  size: message.fileSize,
  encrypted: true,
  status,
  progress: 0,
});

const upsertCollectionFile = (
  history: ClipboardItem[],
  collectionId: string,
  incomingFile: ClipboardItem,
  collectionTotal?: number,
) => {
  let foundCollection = false;

  const next = history.map(item => {
    if (item.type !== 'collection' || item.collectionId !== collectionId) {
      return item;
    }

    foundCollection = true;
    let foundFile = false;
    const items = (item.items ?? []).map(child => {
      if (child.fileId !== incomingFile.fileId) return child;

      foundFile = true;
      return {
        ...child,
        ...incomingFile,
        content: incomingFile.content || child.content,
        previewContent: incomingFile.previewContent ?? child.previewContent,
        name: incomingFile.name ?? child.name,
        size: incomingFile.size ?? child.size,
        status: child.status === 'complete' ? 'complete' as const : incomingFile.status ?? child.status,
        progress: incomingFile.progress ?? child.progress,
      };
    });

    if (!foundFile) {
      items.push(incomingFile);
    }

    return refreshCollectionItem({
      ...item,
      collectionTotal: collectionTotal ?? item.collectionTotal ?? incomingFile.collectionTotal,
      items,
    });
  });

  if (foundCollection) return next;

  const collection = refreshCollectionItem({
    id: collectionId,
    collectionId,
    collectionTotal: collectionTotal ?? incomingFile.collectionTotal,
    type: 'collection',
    content: '',
    timestamp: incomingFile.timestamp,
    encrypted: true,
    status: incomingFile.status,
    progress: incomingFile.progress,
    items: [incomingFile],
  });

  return trimHistory([collection, ...history]);
};

const updateFileInHistory = (
  history: ClipboardItem[],
  fileId: string,
  updater: (item: ClipboardItem) => ClipboardItem | null,
) => (
  history.map(item => {
    if (item.fileId === fileId) {
      return updater(item);
    }

    if (item.type === 'collection' && item.items?.length) {
      let changed = false;
      let removedChild = false;
      const items = item.items.map(child => {
        if (child.fileId !== fileId) return child;

        changed = true;
        const updatedChild = updater(child);
        if (!updatedChild) removedChild = true;
        return updatedChild;
      }).filter(Boolean) as ClipboardItem[];

      if (!changed) return item;
      if (items.length === 0) return null;

      return refreshCollectionItem({
        ...item,
        collectionTotal: removedChild ? items.length : item.collectionTotal,
        items,
      });
    }

    return item;
  }).filter(Boolean) as ClipboardItem[]
);

const updateFilePreviewInHistory = (
  history: ClipboardItem[],
  fileId: string,
  previewContent: string | undefined,
  content: string,
) => updateFileInHistory(history, fileId, item => ({
  ...item,
  previewContent,
  content,
  status: 'uploading',
}));

const getCollectionUploadConcurrency = (files: File[]) => {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const hasVideo = files.some(file => file.type.startsWith('video/'));

  if (hasVideo || totalSize > 200 * 1024 * 1024) {
    return 1;
  }

  return Math.min(3, files.length);
};

async function runUploadQueue<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  }));
}

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
  const historyRef = useRef<ClipboardItem[]>([]);

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

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    return () => {
      historyRef.current.forEach(revokeClipboardItemUrls);
    };
  }, []);

  const prependHistoryItem = useCallback((newItem: ClipboardItem) => {
    setHistory(prev => {
      if (prev.some(item => item.id === newItem.id)) return prev;

      return trimHistory([newItem, ...prev]);
    });
  }, []);

  const handleFileTransferUpdate = useCallback((update: WebSocketMessage) => {
    if (!update.fileId) return;

    setHistory(prev => updateFileInHistory(prev, update.fileId!, item => {
        const newItem = { ...item };
        if (update.type === 'file-progress') {
          newItem.progress = update.progress;
        } else if (update.type === 'file-complete') {
          // If content is provided (receiver side), replace old blob url
          if (update.content) {
            if (newItem.content && newItem.content.startsWith('blob:')) {
              URL.revokeObjectURL(newItem.content);
            }
            newItem.content = update.content;
          }
          newItem.status = 'complete';
          newItem.progress = 100;
        } else if (update.type === 'file-error') {
          revokeClipboardItemUrls(item);
          showToast(`File transfer failed: ${update.message}`, 'error');
          return null; // remove from history
        }
        return newItem;
    }));
  }, [showToast]);

  const handleClipboardReceived = useCallback((message: WebSocketMessage) => {
    // Handler for all incoming messages from the WebSocket
    switch (message.type) {
      case 'file-start':
        if (message.fileId) {
          const newItem = createIncomingFileItem(message, 'generating');
          if (message.collectionId) {
            setHistory(prev => upsertCollectionFile(
              prev,
              message.collectionId!,
              newItem,
              message.collectionTotal,
            ));
          } else {
            prependHistoryItem(newItem);
          }
        }
        break;

      case 'clipboard':
        if (message.fileId) {
          const fileId = message.fileId;
          if (message.collectionId) {
            setHistory(prev => upsertCollectionFile(
              prev,
              message.collectionId!,
              createIncomingFileItem(message, 'downloading'),
              message.collectionTotal,
            ));
            break;
          }

          setHistory(prev => {
            let updatedExisting = false;
            const next = prev.map(item => {
              if (item.fileId === fileId) {
                updatedExisting = true;
                return {
                  ...item,
                  previewContent: message.previewContent ?? item.previewContent,
                  type: getClipboardItemType(message.contentType, message.fileType),
                  name: message.fileName ?? item.name,
                  size: message.fileSize ?? item.size,
                  status: item.status === 'complete' ? 'complete' as const : 'downloading' as const,
                };
              }
              return item;
            });

            if (updatedExisting) return next;

            const newItem: ClipboardItem = {
              id: fileId,
              fileId,
              type: getClipboardItemType(message.contentType, message.fileType),
              content: '',
              previewContent: message.previewContent,
              timestamp: message.timestamp || Date.now(),
              name: message.fileName,
              size: message.fileSize,
              encrypted: true,
              status: 'downloading',
              progress: 0,
            };
            return trimHistory([newItem, ...prev]);
          });
        } else if (!message.fileId) {
          // This is a regular text or rich-text message
          const contentType = toContentType(message.contentType);
          const newItem: ClipboardItem = {
            id: createLocalId(),
            type: contentType,
            content: message.content || '',
            timestamp: message.timestamp || Date.now(),
            encrypted: true,
            status: 'complete',
            progress: 100,
          };
          prependHistoryItem(newItem);

          if (autoCopyEnabled && message.content && contentType === 'text') {
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
  }, [autoCopyEnabled, showToast, copyTextToClipboard, prependHistoryItem]);

  const { roomState, sendMessage, uploadFile, leaveRoom, isE2eeEnabled, encryptFiles, setEncryptFiles } = useWebSocket(
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
          // File blob URLs are session-local, so only text-like entries survive reloads.
          setHistory(savedHistory.filter(item => (
            (item.status === 'complete' || !item.status)
            && item.type !== 'collection'
            && !item.fileId
            && !item.content?.startsWith('blob:')
          )));
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
      setHistory(prev => prev.filter(item => {
        const keep = now - item.timestamp < thirtyMinutes;
        if (!keep) revokeClipboardItemUrls(item);
        return keep;
      }));
    }, 60 * 1000); // Run every minute

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!roomId || !isHistoryLoaded) return;

    const timeoutId = setTimeout(async () => {
      try {
        // Only save completed items to persistent storage
        const historyToSave = history.filter(item => (
          (item.status === 'complete' || !item.status)
          && item.type !== 'collection'
          && !item.fileId
          && !item.content.startsWith('blob:')
        ));
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
    const fileId = createLocalId();

    // Create a placeholder for the sender's UI immediately
    const initialItem = createLocalFileItem(file, fileId, Date.now());
    prependHistoryItem(initialItem);

    // Generate thumbnail for images
    let previewContent: string | undefined = undefined;
    if (initialItem.type === 'image') {
      try {
        previewContent = await createImageThumbnail(file, THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT);
      } catch (error) {
        console.warn('Could not create thumbnail for image:', error);
      }
    }

    // Update the local UI with the thumbnail and the full file blob URL
    const fullFileBlobUrl = URL.createObjectURL(file);
    setHistory(prev => updateFilePreviewInHistory(prev, fileId, previewContent, fullFileBlobUrl));

    // The hook now handles the entire upload sequence
    if (uploadFile) {
        await uploadFile(file, fileId, previewContent);
    } else {
       showToast('File upload is not available.', 'error');
    }
  }, [uploadFile, showToast, prependHistoryItem]);

  const handleFilesSelect = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    if (files.length === 1) {
      await handleFileSelect(files[0]);
      return;
    }

    if (!uploadFile) {
      showToast('File upload is not available.', 'error');
      return;
    }

    const collectionId = createLocalId();
    const collectionTotal = files.length;
    const timestamp = Date.now();
    const initialItems = files.map((file, index) => (
      createLocalFileItem(
        file,
        createLocalId(),
        timestamp + index,
        collectionId,
        collectionTotal,
        index,
      )
    ));

    prependHistoryItem(refreshCollectionItem({
      id: collectionId,
      collectionId,
      collectionTotal,
      type: 'collection',
      content: '',
      timestamp,
      encrypted: true,
      status: 'uploading',
      progress: 0,
      items: initialItems,
    }));

    await runUploadQueue(files, getCollectionUploadConcurrency(files), async (file, index) => {
      const item = initialItems[index];
      if (!item.fileId) return;

      let previewContent: string | undefined = undefined;
      if (item.type === 'image') {
        try {
          previewContent = await createImageThumbnail(file, THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT);
        } catch (error) {
          console.warn('Could not create thumbnail for image:', error);
        }
      }

      const fullFileBlobUrl = URL.createObjectURL(file);
      setHistory(prev => updateFilePreviewInHistory(prev, item.fileId!, previewContent, fullFileBlobUrl));

      await uploadFile(file, item.fileId, previewContent, {
        collectionId,
        collectionTotal,
        collectionIndex: index,
      });
    });
  }, [handleFileSelect, uploadFile, showToast, prependHistoryItem]);

  const handlePaste = useCallback(async (type: ClipboardItem['type'], content: string) => {
    // Check if content is too large for a single WebSocket message (limit is 2MB, safety margin 1MB)
    const sizeInBytes = new Blob([content]).size;
    if (sizeInBytes > 1024 * 1024) {
      showToast('Content too large. sending as file...', 'info');
      const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = type === 'rich-text' ? `Rich Text ${safeTimestamp}.html` : `Large Text ${safeTimestamp}.txt`;
      const file = new File([content], filename, { type: type === 'rich-text' ? 'text/html' : 'text/plain' });
      handleFileSelect(file);
      return;
    }

    const contentType = type as ClipboardItem['type'];
    const newItem: ClipboardItem = {
      id: createLocalId(),
      type: contentType,
      content,
      timestamp: Date.now(),
      encrypted: true,
      status: 'complete',
      progress: 100,
    };

    prependHistoryItem(newItem);

    const sent = await sendMessage({
      type: 'clipboard',
      contentType: contentType,
      content: content,
    });

    if (!sent) {
      showToast('Failed to send content. Check connection or E2EE key sync.', 'error');
    }
  }, [sendMessage, showToast, handleFileSelect, prependHistoryItem]);

  const handleLeaveRoom = () => {
    if (roomId) {
      addRecentRoom(roomId);
    }
    leaveRoom();
    navigate('/');
  };

  const handleDeleteItem = useCallback((id: string) => {
    setHistory(prev => prev.filter(item => {
        if (item.id === id) {
            revokeClipboardItemUrls(item);
        }
        return item.id !== id;
    }));
    showToast('Clip deleted from history', 'info');
  }, [showToast]);

  const handleClearAll = useCallback(async () => {
    setHistory(prev => {
        prev.forEach(item => {
            revokeClipboardItemUrls(item);
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
        encryptFilesEnabled={encryptFiles}
        onToggleEncryptFiles={setEncryptFiles}
        showToast={showToast}
        onClearAll={handleClearAll}
      />
      <ClipboardArea
        onPaste={handlePaste}
        onFileSelect={handleFileSelect}
        onFilesSelect={handleFilesSelect}
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

