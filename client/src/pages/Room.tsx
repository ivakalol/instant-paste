import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import RoomInfo from '../components/RoomInfo';
import ClipboardArea from '../components/ClipboardArea';
import Toast from '../components/Toast';
import { useWebSocket } from '../utils/useWebSocket';
import { ClipboardItem, WebSocketMessage } from '../types';
import '../App.css';

const MAX_HISTORY = 20;

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

const Room: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [history, setHistory] = useState<ClipboardItem[]>([]);
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

  const handleClipboardReceived = useCallback((message: WebSocketMessage) => {
    if (message.type === 'clipboard' && message.contentType && message.content) {
      const newItem: ClipboardItem = {
        id: Date.now().toString(),
        type: message.contentType as 'text' | 'image' | 'video',
        content: message.content,
        timestamp: message.timestamp || Date.now(),
        encrypted: true, // E2EE is always on
      };

      setHistory(prev => {
        const updated = [newItem, ...prev].slice(0, MAX_HISTORY);
        return updated;
      });

      if (autoCopyEnabled && message.contentType === 'text' && message.content) {
        const now = Date.now();
        if (now - lastAutoCopyRef.current > 2000) {
          lastAutoCopyRef.current = now;
          if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(message.content)
              .then(() => {
                showToast('Text auto-copied to clipboard', 'success');
              })
              .catch((err) => {
                console.error('Auto-copy with navigator.clipboard failed, falling back.', err);
                if (message.content) {
                  copyTextToClipboard(message.content);
                }
              });
          } else {
            if (message.content) {
              copyTextToClipboard(message.content);
            }
          }
        } else {
          console.log('Auto-copy rate limited, skipping...');
        }
      }
    }
  }, [autoCopyEnabled, showToast, copyTextToClipboard]);


  const { roomState, sendMessage, leaveRoom, isE2eeEnabled } = useWebSocket(
    handleClipboardReceived,
    roomId
  );

  useEffect(() => {
    const savedHistory = localStorage.getItem(`clipboardHistory_${roomId}`);
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed) && parsed.every(item => 
          item && typeof item === 'object' && 
          'type' in item && 'content' in item && 'timestamp' in item
        )) {
          setHistory(parsed);
        } else {
          console.warn('Invalid history format in localStorage, clearing...');
          localStorage.removeItem(`clipboardHistory_${roomId}`);
        }
      } catch (error) {
        console.error('Failed to load history:', error);
        localStorage.removeItem(`clipboardHistory_${roomId}`);
      }
    }
  }, [roomId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(`clipboardHistory_${roomId}`, JSON.stringify(history));
      } catch (e) {
        console.error('Failed to save history to localStorage:', e);
        showToast('Storage quota exceeded. History not saved.', 'error');
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [history, roomId, showToast]);

  const handlePaste = useCallback(async (type: string, content: string) => {
    const newItem: ClipboardItem = {
      id: Date.now().toString(),
      type: type as 'text' | 'image' | 'video',
      content,
      timestamp: Date.now(),
      encrypted: true,
    };

    setHistory(prev => {
      const updated = [newItem, ...prev].slice(0, MAX_HISTORY);
      return updated;
    });

    const sent = await sendMessage({
      type: 'clipboard',
      contentType: type,
      content: content,
    });

    if (!sent) {
      showToast('Failed to send content. WebSocket not connected.', 'error');
    }
  }, [sendMessage, showToast]);

  const handleLeaveRoom = () => {
    leaveRoom();
    navigate('/');
  };

  const handleDeleteItem = useCallback((id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
    showToast('Clip deleted from history', 'info');
  }, [showToast]);

  return (
    <>
      <RoomInfo 
        roomState={roomState}
        onLeave={handleLeaveRoom}
        encryptionEnabled={isE2eeEnabled}
        autoCopyEnabled={autoCopyEnabled}
        onToggleAutoCopy={handleToggleAutoCopy}
        showToast={showToast}
      />
      <ClipboardArea 
        onPaste={handlePaste}
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
