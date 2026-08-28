import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRecentRooms, addRecentRoom } from '../../utils/recentRooms';
import './RoomSelector.css';

interface RoomSelectorProps {
  onCreateRoom: () => Promise<string | null>;
  onJoinRoom: (roomId: string) => Promise<boolean>;
  isReady: boolean;
}

const RoomSelector: React.FC<RoomSelectorProps> = ({ onCreateRoom, onJoinRoom, isReady }) => {
  const [roomId, setRoomId] = useState('');
  const [recentRooms, setRecentRooms] = useState<string[]>([]);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setRecentRooms(getRecentRooms());
  }, []);

  const handleCreate = async () => {
    setFormMessage(null);
    const newRoomId = await onCreateRoom();
    if (newRoomId) {
      addRecentRoom(newRoomId);
      navigate(`/${newRoomId}`);
    } else {
      setFormMessage('Could not create a room. Check your connection and try again.');
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const roomToJoin = roomId.trim().toUpperCase();
    if (!roomToJoin) return;
    setFormMessage(null);
    const success = await onJoinRoom(roomToJoin);
    if (success) {
      addRecentRoom(roomToJoin);
      navigate(`/${roomToJoin}`);
    } else {
      setFormMessage('That room is unavailable. Check the ID or create a new room.');
    }
  };

  const handleJoinRecent = (recentRoomId: string) => {
    addRecentRoom(recentRoomId);
    navigate(`/${recentRoomId}`);
  };

  return (
    <div className="room-page">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 13h6M12 10v6" />
          </svg>
        </div>
        <div className="hero-badge"><span aria-hidden="true" /> No login · Free · Open source</div>
        <h1 id="hero-title">Your clipboard1,<br /><span>anywhere.</span></h1>
        <p className="hero-subtitle">
          Copy on one device, paste on another. Real-time clipboard sync across any browser and OS.
        </p>
        <div className="hero-actions">
          <button onClick={handleCreate} className="btn btn-primary btn-lg" disabled={!isReady}>
            {isReady ? 'Create a Room' : 'Initializing…'}
          </button>
          <form onSubmit={handleJoin} className="join-form hero-join" aria-label="Join an existing room">
            <input
              type="text"
              placeholder="Enter/Create room ID"
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value.toUpperCase());
                setFormMessage(null);
              }}
              maxLength={6}
              className="room-input"
              aria-label="Enter or create room ID"
            />
            <button type="submit" className="btn btn-ghost" disabled={!roomId.trim() || !isReady}>
              Join
            </button>
          </form>
        </div>
        {formMessage && <p className="hero-message" role="alert">{formMessage}</p>}
        <div className="hero-footnotes">
          <span>Works on all modern browsers</span>
          <span>Text E2E encrypted (AES-GCM)</span>
          <span>HTTPS protected file transfers</span>
        </div>
      </section>

      {recentRooms.length > 0 && (
        <section className="card recent-rooms" aria-labelledby="recent-rooms-title">
          <div className="card-header">
            <div>
              <span className="eyebrow">Your rooms</span>
              <h2 id="recent-rooms-title">Jump back in</h2>
            </div>
            <span className="pill">Recent</span>
          </div>
          <div className="recent-rooms-list">
            {recentRooms.map((recentRoomId) => (
              <button
                key={recentRoomId}
                onClick={() => handleJoinRecent(recentRoomId)}
                className="btn btn-chip"
              >
                {recentRoomId}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card how-it-works" aria-labelledby="how-it-works-title">
        <div className="section-title">
          <span className="eyebrow">Simple by design</span>
          <h2 id="how-it-works-title">How it works</h2>
          <p>Three quick steps to share anything instantly.</p>
        </div>
        <div className="steps-grid">
          <div className="step">
            <div className="step-icon">1</div>
            <h4>Create or join a room</h4>
            <p>Spin up a room with one click or enter an existing 6-character ID.</p>
          </div>
          <div className="step">
            <div className="step-icon">2</div>
            <h4>Paste or drop</h4>
            <p>Send text, images, or files. Paste, drag & drop, or pick from your device.</p>
          </div>
          <div className="step">
            <div className="step-icon">3</div>
            <h4>Sync in real-time</h4>
            <p>Your clipboard is mirrored instantly to every connected device.</p>
          </div>
        </div>
      </section>

      <section className="card features" aria-labelledby="features-title">
        <div className="section-title">
          <span className="eyebrow">Built for the everyday handoff</span>
          <h2 id="features-title">Why people use Instant Paste</h2>
          <p>Fast, private, and frictionless across platforms.</p>
        </div>
        <div className="features-grid">
          <div className="feature-item">
            <div className="feature-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" /></svg>
            </div>
            <h4>Zero setup</h4>
            <p>Runs in the browser—no installs, no accounts, just a room ID.</p>
          </div>
          <div className="feature-item">
            <div className="feature-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>
            </div>
            <h4>Private by design</h4>
            <p>Data is end-to-end encrypted with AES-256-GCM and ECDH key exchange—only devices in the room can decrypt it.</p>
          </div>
          <div className="feature-item">
            <div className="feature-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
            </div>
            <h4>Cross-platform</h4>
            <p>iOS, Android, macOS, Windows, Linux—if it has a browser, it works.</p>
          </div>
          <div className="feature-item">
            <div className="feature-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m20.5 11.5-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.7 9.6a2 2 0 0 1-2.8-2.8l8.9-8.9" /></svg>
            </div>
            <h4>Handles rich content</h4>
            <p>Text, images, and videos; drag-and-drop or paste directly.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default RoomSelector;
