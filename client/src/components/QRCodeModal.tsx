import React from 'react';
import { default as QRCode } from 'qrcode.react';
import './QRCodeModal.css';

interface QRCodeModalProps {
  roomUrl: string;
  onClose: () => void;
}

const QRCodeModal: React.FC<QRCodeModalProps> = ({ roomUrl, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Scan to Join Room</h2>
        <div className="qrcode-container">
          <QRCode value={roomUrl} size={256} />
        </div>
        <p className="room-url">{roomUrl}</p>
        <button onClick={onClose} className="btn btn-secondary">
          Close
        </button>
      </div>
    </div>
  );
};

export default QRCodeModal;
