import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import './QRCodeModal.css';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
}

const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, url }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>&times;</button>
        <h2>Scan to Join Room</h2>
        <div className="qrcode-container">
          <QRCodeCanvas value={url} size={256} />
        </div>
        <p className="modal-url">{url}</p>
      </div>
    </div>
  );
};

export default QRCodeModal;