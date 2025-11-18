import React, { useState } from 'react';
import { RoomState } from '../types';
import { copyToClipboard } from '../utils/clipboard';
import QRCodeModal from './QRCodeModal';
import { useTheme } from '../App'; // Import useTheme

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

  const copyRoomId = async () => {
    if (roomState.roomId) {
      const success = await copyToClipboard(roomState.roomId);
      if (success) {
        showToast('Room ID copied to clipboard!', 'success');
      } else {
        showToast('Failed to copy room ID', 'error');
      }
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
              📱 QR
            </button>
            <button onClick={copyRoomId} className="btn btn-small" title="Copy Room ID">
              📋 Copy ID
            </button>
            <button onClick={onLeave} className="btn btn-small btn-danger">
              ❌ Leave
            </button>
          </div>
        </div>

        <div className="encryption-controls">
          <button 
            className="btn btn-small"
            disabled
          >
            🔐 {encryptionEnabled ? 'E2E Encrypted' : 'E2EE Disabled'}
          </button>
          
          <button 
            onClick={() => onToggleAutoCopy(!autoCopyEnabled)}
            className={`btn btn-small ${autoCopyEnabled ? 'auto-copy-on' : 'auto-copy-off'}`}
            title="Auto-copy received text to clipboard"
          >
            {autoCopyEnabled ? '[ON] Auto-Copy' : '[OFF] Auto-Copy'}
          </button>
          <button onClick={onClearAll} className="btn btn-small btn-danger" title="Delete all clips from history">
            🗑️ Clear All
          </button>
          <button onClick={toggleTheme} className="btn btn-small" title="Toggle Dark Mode">
            {isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
        </div>
      </div>
      {showQrCode && roomState.roomId && (
        <QRCodeModal
          roomUrl={getRoomUrl()}
          onClose={() => setShowQrCode(false)}
        />
      )}
    </>
  );
};

export default RoomInfo;
