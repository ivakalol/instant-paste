import React, { useState } from 'react';
import './RoomInfo.css';
import { RoomState } from '../../types';
import { copyToClipboard } from '../../utils/clipboard';
import QRCodeModal from './QRCodeModal';
import Dialog from '../common/Dialog';

interface RoomInfoProps {
  roomState: RoomState;
  onLeave: () => void;
  encryptionEnabled: boolean;
  autoCopyEnabled: boolean;
  onToggleAutoCopy: (enabled: boolean) => void;
  encryptFilesEnabled: boolean;
  onToggleEncryptFiles: (enabled: boolean) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onClearAll: () => void;
}

const RoomInfo: React.FC<RoomInfoProps> = ({
  roomState,
  onLeave,
  encryptionEnabled,
  autoCopyEnabled,
  onToggleAutoCopy,
  encryptFilesEnabled,
  onToggleEncryptFiles,
  showToast,
  onClearAll
}) => {
  const [showQrCode, setShowQrCode] = useState(false);
  const [activeDialog, setActiveDialog] = useState<'encrypt' | 'clear' | null>(null);

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
        {/* ── Top row: room identity + quick actions ── */}
        <div className="room-header">
          <div className="room-details">
            <h2 className="room-title">
              <span className="room-label">Room</span>
              <span className="room-id">{roomState.roomId}</span>
            </h2>
            <p className="client-count">
              <span className={`connection-dot ${roomState.connected ? 'connected' : 'disconnected'}`} aria-hidden="true" />
              <span role="status">
                {roomState.connected
                  ? `Connected · ${roomState.clientCount} ${roomState.clientCount === 1 ? 'device' : 'devices'}`
                  : 'Reconnecting…'}
              </span>
            </p>
          </div>

          <div className="room-actions">
            <button onClick={() => setShowQrCode(true)} className="room-btn" title="QR Code">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zm4 0h3v3h-3zm-4 4h3v3h-3zm4 0h3v3h-3z"/>
              </svg>
              QR Code
            </button>
            <button onClick={copyRoomId} className="room-btn" title="Copy Room ID">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy ID
            </button>
            <button onClick={onLeave} className="room-btn room-btn--danger" title="Leave Room">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Leave
            </button>
          </div>
        </div>

        {/* ── Controls row ── */}
        <div className="controls-row">
          {/* Encryption badge */}
          <span className={`badge ${encryptionEnabled ? 'badge--secure' : 'badge--insecure'}`}>
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
            </svg>
            {encryptionEnabled ? 'E2EE' : 'No E2EE'}
          </span>

          {/* Toggle: Encrypt Files */}
          <label
            className={`toggle-pill ${encryptFilesEnabled ? 'toggle-pill--on' : ''} ${!encryptionEnabled ? 'toggle-pill--disabled' : ''}`}
            title="Toggle end-to-end encryption for file transfers"
          >
            <input
              type="checkbox"
              checked={encryptFilesEnabled}
              disabled={!encryptionEnabled}
              onChange={() => {
                if (!encryptFilesEnabled) {
                  setActiveDialog('encrypt');
                  return;
                }
                onToggleEncryptFiles(false);
              }}
            />
            <span className="toggle-pill__track">
              <span className="toggle-pill__thumb" />
            </span>
            <span className="toggle-pill__label">Encrypt Files</span>
          </label>

          {/* Toggle: Auto-Copy */}
          <label className={`toggle-pill ${autoCopyEnabled ? 'toggle-pill--on' : ''}`} title="Auto-copy received text to clipboard">
            <input
              type="checkbox"
              checked={autoCopyEnabled}
              onChange={() => onToggleAutoCopy(!autoCopyEnabled)}
            />
            <span className="toggle-pill__track">
              <span className="toggle-pill__thumb" />
            </span>
            <span className="toggle-pill__label">Auto-Copy</span>
          </label>

          {/* Clear All — pushed to the end */}
          <button onClick={() => setActiveDialog('clear')} className="action-text action-text--danger" title="Delete all clips from history">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
            Clear All
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

      <Dialog
        isOpen={activeDialog === 'encrypt'}
        onClose={() => setActiveDialog(null)}
        eyebrow="File security"
        title="Encrypt file transfers?"
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveDialog(null)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onToggleEncryptFiles(true);
                setActiveDialog(null);
              }}
            >
              Enable encryption
            </button>
          </>
        )}
      >
        <p>End-to-end encryption adds extra processing and can make large uploads and downloads noticeably slower.</p>
      </Dialog>

      <Dialog
        isOpen={activeDialog === 'clear'}
        onClose={() => setActiveDialog(null)}
        eyebrow="Clear history"
        title="Delete every clip?"
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveDialog(null)}>Keep clips</button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                onClearAll();
                setActiveDialog(null);
              }}
            >
              Delete all clips
            </button>
          </>
        )}
      >
        <p>This removes the clipboard history stored for this room on this device. This action cannot be undone.</p>
      </Dialog>
    </>
  );
};

export default RoomInfo;
