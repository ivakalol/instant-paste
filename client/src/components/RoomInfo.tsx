import React, { useState } from 'react';
import { RoomState } from '../types';
import { copyToClipboard } from '../utils/clipboard';

interface RoomInfoProps {
  roomState: RoomState;
  onLeave: () => void;
  onToggleEncryption: (enabled: boolean, password: string) => void;
  encryptionEnabled: boolean;
  autoCopyEnabled: boolean;
  onToggleAutoCopy: (enabled: boolean) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const RoomInfo: React.FC<RoomInfoProps> = ({ 
  roomState, 
  onLeave,
  onToggleEncryption,
  encryptionEnabled,
  autoCopyEnabled,
  onToggleAutoCopy,
  showToast
}) => {
  const [showEncryption, setShowEncryption] = useState(false);
  const [password, setPassword] = useState('');

  const handleToggleEncryption = () => {
    if (encryptionEnabled) {
      onToggleEncryption(false, '');
      setPassword('');
    } else if (password) {
      onToggleEncryption(true, password);
      setShowEncryption(false);
    }
  };

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

  return (
    <div className="room-info">
      <div className="room-header">
        <div className="room-details">
          <h2>Room: {roomState.roomId}</h2>
          <p className="client-count">
            {roomState.clientCount} {roomState.clientCount === 1 ? 'device' : 'devices'} connected
          </p>
        </div>
        <div className="room-actions">
          <button onClick={copyRoomId} className="btn btn-small" title="Copy Room ID">
            📋 Copy ID
          </button>
          <button onClick={onLeave} className="btn btn-small btn-danger">
            ❌ Leave
          </button>
        </div>
      </div>

      <div className="encryption-section">
        <button 
          onClick={() => setShowEncryption(!showEncryption)}
          className="btn btn-small"
        >
          🔐 {encryptionEnabled ? 'Encryption On' : 'Enable Encryption'}
        </button>
        
        <button 
          onClick={() => onToggleAutoCopy(!autoCopyEnabled)}
          className="btn btn-small"
          title="Auto-copy received text to clipboard"
        >
          📋 {autoCopyEnabled ? 'Auto-Copy On' : 'Auto-Copy Off'}
        </button>
        
        {showEncryption && (
          <div className="encryption-form">
            <input
              type="password"
              placeholder="Enter encryption password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="password-input"
            />
            <button 
              onClick={handleToggleEncryption}
              className="btn btn-small"
              disabled={!password && !encryptionEnabled}
            >
              {encryptionEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomInfo;
