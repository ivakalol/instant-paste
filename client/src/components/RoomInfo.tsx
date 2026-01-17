import React, { useState } from 'react';
import './RoomInfo.css';
import { RoomState } from '../types';
import { copyToClipboard } from '../utils/clipboard';
import QRCodeModal from './QRCodeModal';
import { useTheme } from './ThemeContext'; // Import useTheme

interface RoomInfoProps {
  roomState: RoomState;
  onLeave: () => void;
  encryptionEnabled: boolean;
  autoCopyEnabled: boolean;
  onToggleAutoCopy: (enabled: boolean) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onClearAll: () => void;
}

const RoomInfo: React.FC<RoomInfoProps> = ({
  roomState,
  onLeave,
  encryptionEnabled,
  autoCopyEnabled,
  onToggleAutoCopy,
  showToast,
  onClearAll
}) => {
  const [showQrCode, setShowQrCode] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme(); // Use the theme hook

  const copyRoomId = () => {
    if (roomState.roomId) {
      copyToClipboard(roomState.roomId)
        .then(() => {
          showToast('Room ID copied to clipboard!', 'success');
        })
        .catch(error => {
          console.error('Failed to copy room ID:', error);
          showToast('Failed to copy room ID', 'error');
        });
    }
  };

  const getRoomUrl = () => {
    return `${window.location.origin}/${roomState.roomId}`;
  };

  return (
    <>
      <div className="room-info">
        <div className="room-header">
          <div className="room-details">
            <h2>Room: {roomState.roomId}</h2>
            <p className="client-count">
              <span className={`connection-status ${roomState.connected ? 'connected' : 'disconnected'}`}></span>
              {roomState.clientCount} {roomState.clientCount === 1 ? 'device' : 'devices'} connected
            </p>
          </div>
          <div className="room-actions">
            <button onClick={() => setShowQrCode(true)} className="btn btn-small" title="Show QR Code to Join">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8.5 10a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5z"/>
                <path d="M2 1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h2V2H2zm11-1H5v14h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM3 13.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5zm0-2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5zm0-2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5zm0-2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5z"/>
              </svg>
              QR Code
            </button>
            <button onClick={copyRoomId} className="btn btn-small" title="Copy Room ID">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M4 1.5H3a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zM5 1.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5z"/>
              </svg>
              Copy ID
            </button>
            <button onClick={onLeave} className="btn btn-small btn-danger">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8.5 10.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm-2 0a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm-2 0a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm-2 0a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5z"/>
                <path d="M12 1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8zm-1 1H5v10h6V2z"/>
              </svg>
              Leave
            </button>
          </div>
        </div>

        <div className="encryption-controls">
          <button 
            className="btn btn-small"
            disabled
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
            </svg>
            {encryptionEnabled ? 'E2E Encrypted' : 'E2EE Disabled'}
          </button>
          
          <button 
            onClick={() => onToggleAutoCopy(!autoCopyEnabled)}
            className={`btn btn-small ${autoCopyEnabled ? 'auto-copy-on' : 'auto-copy-off'}`}
            title="Auto-copy received text to clipboard"
          >
            {autoCopyEnabled ? '[ON] Auto-Copy' : '[OFF] Auto-Copy'}
          </button>
          <button onClick={onClearAll} className="btn btn-small btn-danger" title="Delete all clips from history">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
              <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
            </svg>
            Clear All
          </button>
          <button onClick={toggleTheme} className="btn btn-small" title="Toggle Dark Mode">
            {isDarkMode ? 
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z"/>
              </svg> :
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/>
              </svg>
            }
            {isDarkMode ? ' Light' : ' Dark'}
          </button>
        </div>
      </div>
      {showQrCode && roomState.roomId && (
        <QRCodeModal
          isOpen={showQrCode}
          url={getRoomUrl()}
          onClose={() => setShowQrCode(false)}
        />
      )}
    </>
  );
};

export default RoomInfo;
