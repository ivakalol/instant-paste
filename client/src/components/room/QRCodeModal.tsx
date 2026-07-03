import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import Dialog from '../common/Dialog';
import './QRCodeModal.css';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
}

const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, url }) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="Share this room"
      title="Scan to join"
      className="qr-dialog"
    >
      <p className="qr-dialog__intro">Open the camera on another device and scan this code to join instantly.</p>
      <div className="qrcode-container">
        <QRCodeCanvas value={url} size={240} bgColor="#ffffff" fgColor="#101827" />
      </div>
      <p className="modal-url">{url}</p>
    </Dialog>
  );
};

export default QRCodeModal;
