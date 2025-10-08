import React, { useState, useCallback, useEffect } from 'react';
import RoomSelector from './components/RoomSelector';
import RoomInfo from './components/RoomInfo';
import ClipboardArea from './components/ClipboardArea';
import { useWebSocket } from './utils/useWebSocket';
import { ClipboardItem, WebSocketMessage } from './types';
import { encryptData, decryptData } from './utils/crypto';
import './App.css';

const MAX_HISTORY = 20;

const App: React.FC = () => {
  const [history, setHistory] = useState<ClipboardItem[]>([]);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState('');

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('clipboardHistory');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('clipboardHistory', JSON.stringify(history));
  }, [history]);

  const handleClipboardReceived = useCallback((message: WebSocketMessage) => {
    if (message.type === 'clipboard' && message.contentType && message.content) {
      let content = message.content;
      
      // Decrypt if encryption is enabled
      if (encryptionEnabled && encryptionPassword) {
        content = decryptData(content, encryptionPassword);
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

      // Auto-copy text if enabled and permissions allow
      if (message.contentType === 'text' && navigator.clipboard) {
        navigator.clipboard.writeText(content).catch(() => {
          // Silent fail - clipboard write may not be available
        });
      }
    }
  }, [encryptionEnabled, encryptionPassword]);

  const { roomState, sendMessage, createRoom, joinRoom, leaveRoom } = useWebSocket(
    handleClipboardReceived
  );

  const handlePaste = useCallback((type: string, content: string) => {
    let contentToSend = content;
    
    // Encrypt if encryption is enabled
    if (encryptionEnabled && encryptionPassword) {
      contentToSend = encryptData(content, encryptionPassword);
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
    sendMessage({
      type: 'clipboard',
      contentType: type,
      content: contentToSend,
    });
  }, [sendMessage, encryptionEnabled, encryptionPassword]);

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
            />
            <ClipboardArea 
              onPaste={handlePaste}
              history={history}
              encryptionEnabled={encryptionEnabled}
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
    </div>
  );
};

export default App;
