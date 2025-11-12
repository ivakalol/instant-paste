import React, { useState, useCallback, useEffect } from 'react';
import RoomSelector from './components/RoomSelector';
import RoomInfo from './components/RoomInfo';
import ClipboardArea from './components/ClipboardArea';
import Toast from './components/Toast';
import { useWebSocket } from './utils/useWebSocket';
import { ClipboardItem, WebSocketMessage } from './types';
import { encryptData, decryptData } from './utils/crypto';
import './App.css';

const MAX_HISTORY = 20;

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

const App: React.FC = () => {
  const [history, setHistory] = useState<ClipboardItem[]>([]);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [autoCopyEnabled, setAutoCopyEnabled] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('clipboardHistory');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        // Validate structure before setting state
        if (Array.isArray(parsed) && parsed.every(item => 
          item && typeof item === 'object' && 
          'type' in item && 'content' in item && 'timestamp' in item
        )) {
          setHistory(parsed);
        } else {
          console.warn('Invalid history format in localStorage, clearing...');
          localStorage.removeItem('clipboardHistory');
        }
      } catch (error) {
        console.error('Failed to load history:', error);
        localStorage.removeItem('clipboardHistory');
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('clipboardHistory', JSON.stringify(history));
  }, [history]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  const handleClipboardReceived = useCallback((message: WebSocketMessage) => {
    if (message.type === 'clipboard' && message.contentType && message.content) {
      let content = message.content;
      
      // Decrypt if encryption is enabled
      if (encryptionEnabled && encryptionPassword) {
        const decrypted = decryptData(content, encryptionPassword);
        if (decrypted === null) {
          showToast('Failed to decrypt content. Wrong password?', 'error');
          return;
        }
        content = decrypted;
      }

      const newItem: ClipboardItem = {
        id: Date.now().toString(),
        type: message.contentType as 'text' | 'image' | 'video',
        content,
        timestamp: message.timestamp || Date.now(),
        encrypted: encryptionEnabled,
      };

      setHistory(prev => {
        const updated = [newItem, ...prev].slice(0, MAX_HISTORY);
        return updated;
      });

      // Auto-copy text if enabled by user preference and permissions allow
      // Rate limit: only allow one auto-copy every 2 seconds to prevent clipboard poisoning
      if (autoCopyEnabled && message.contentType === 'text' && navigator.clipboard) {
        const now = Date.now();
        const lastAutoCopy = (window as any).__lastAutoCopy || 0;
        
        if (now - lastAutoCopy > 2000) {
          (window as any).__lastAutoCopy = now;
          navigator.clipboard.writeText(content)
            .then(() => {
              showToast('Text auto-copied to clipboard', 'success');
            })
            .catch(() => {
              showToast('Failed to auto-copy. Please check permissions.', 'error');
            });
        } else {
          console.log('Auto-copy rate limited, skipping...');
        }
      }
    }
  }, [encryptionEnabled, encryptionPassword, autoCopyEnabled, showToast]);

  const { roomState, sendMessage, createRoom, joinRoom, leaveRoom } = useWebSocket(
    handleClipboardReceived
  );

  const handlePaste = useCallback((type: string, content: string) => {
    let contentToSend = content;
    
    // Encrypt if encryption is enabled
    if (encryptionEnabled && encryptionPassword) {
      try {
        contentToSend = encryptData(content, encryptionPassword);
      } catch (error) {
        console.error('Failed to encrypt data:', error);
        showToast('Failed to encrypt data. Content not sent.', 'error');
        return;
      }
    }

    // Add to local history
    const newItem: ClipboardItem = {
      id: Date.now().toString(),
      type: type as 'text' | 'image' | 'video',
      content,
      timestamp: Date.now(),
      encrypted: encryptionEnabled,
    };

    setHistory(prev => {
      const updated = [newItem, ...prev].slice(0, MAX_HISTORY);
      return updated;
    });

    // Send to other clients
    const sent = sendMessage({
      type: 'clipboard',
      contentType: type,
      content: contentToSend,
    });

    if (!sent) {
      showToast('Failed to send content. WebSocket not connected.', 'error');
    }
  }, [sendMessage, encryptionEnabled, encryptionPassword, showToast]);

  const handleToggleEncryption = (enabled: boolean, password: string) => {
    setEncryptionEnabled(enabled);
    setEncryptionPassword(password);
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    // Optionally clear history when leaving
    // setHistory([]);
  };

  return (
    <div className="app">
      <div className="container">
        {!roomState.roomId ? (
          <RoomSelector onCreateRoom={createRoom} onJoinRoom={joinRoom} />
        ) : (
          <>
            <RoomInfo 
              roomState={roomState}
              onLeave={handleLeaveRoom}
              onToggleEncryption={handleToggleEncryption}
              encryptionEnabled={encryptionEnabled}
              autoCopyEnabled={autoCopyEnabled}
              onToggleAutoCopy={setAutoCopyEnabled}
              showToast={showToast}
            />
            <ClipboardArea 
              onPaste={handlePaste}
              history={history}
              encryptionEnabled={encryptionEnabled}
              showToast={showToast}
            />
          </>
        )}
      </div>
      
      <footer className="footer">
        <p>
          Instant Paste - Real-time clipboard sync |{' '}
          <a 
            href="https://github.com/ivakalol/instant-paste" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </p>
      </footer>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default App;
