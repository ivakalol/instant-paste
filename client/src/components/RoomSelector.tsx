import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRecentRooms, addRecentRoom } from '../utils/recentRooms';
import './RoomSelector.css';

interface RoomSelectorProps {
  onCreateRoom: () => Promise<string | null>;
  onJoinRoom: (roomId: string) => Promise<boolean>;
  isReady: boolean;
}

const RoomSelector: React.FC<RoomSelectorProps> = ({ onCreateRoom, onJoinRoom, isReady }) => {
  const [roomId, setRoomId] = useState('');
  const [recentRooms, setRecentRooms] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    setRecentRooms(getRecentRooms());
  }, []);

  const handleCreate = async () => {
    const newRoomId = await onCreateRoom();
    if (newRoomId) {
      addRecentRoom(newRoomId);
      navigate(`/${newRoomId}`);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const roomToJoin = roomId.trim().toUpperCase();
    if (!roomToJoin) return;
    const success = await onJoinRoom(roomToJoin);
    if (success) {
      addRecentRoom(roomToJoin);
      navigate(`/${roomToJoin}`);
      window.location.reload();
    }
  };

  const handleJoinRecent = (recentRoomId: string) => {
    addRecentRoom(recentRoomId);
    navigate(`/${recentRoomId}`);
    window.location.reload();
  };

  return (
    <div className="room-page">
      <div className="hero">
        <div className="hero-badge">No login · Free · Open Source</div>
        <h1>Instant Paste</h1>
        <p className="hero-subtitle">
          Copy on one device, paste on another. Real-time clipboard sync across any browser and OS.
        </p>
        <div className="hero-actions">
          <button onClick={handleCreate} className="btn btn-primary btn-lg" disabled={!isReady}>
            {isReady ? 'Create a Room' : 'Initializing…'}
          </button>
          <form onSubmit={handleJoin} className="join-form hero-join">
            <input
              type="text"
              placeholder="Enter room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              maxLength={6}
              className="room-input"
              aria-label="Enter room ID"
            />
            <button type="submit" className="btn btn-ghost" disabled={!roomId.trim() || !isReady}>
              Join
            </button>
          </form>
        </div>
        <div className="hero-footnotes">
          <span>Works on all modern browsers</span>
          <span>Text E2E encrypted (AES-GCM)</span>
          <span>HTTPS protected file transfers</span>
        </div>
      </div>

      {recentRooms.length > 0 && (
        <div className="card recent-rooms">
          <div className="card-header">
            <h3>Jump back in</h3>
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
        </div>
      )}

      <div className="card how-it-works">
        <div className="section-title">
          <h3>How it works</h3>
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
      </div>

      <div className="card features">
        <div className="section-title">
          <h3>Why people use Instant Paste</h3>
          <p>Fast, private, and frictionless across platforms.</p>
        </div>
        <div className="features-grid">
          <div className="feature-item">
            <div className="feature-icon">⚡</div>
            <h4>Zero setup</h4>
            <p>Runs in the browser—no installs, no accounts, just a room ID.</p>
          </div>
          <div className="feature-item">
            <div className="feature-icon">🔒</div>
            <h4>Private by design</h4>
            <p>Text is E2E encrypted; file transfers are secured via HTTPS. Full file E2EE coming soon.</p>
          </div>
          <div className="feature-item">
            <div className="feature-icon">🌐</div>
            <h4>Cross-platform</h4>
            <p>iOS, Android, macOS, Windows, Linux—if it has a browser, it works.</p>
          </div>
          <div className="feature-item">
            <div className="feature-icon">📎</div>
            <h4>Handles rich content</h4>
            <p>Text, images, and videos; drag-and-drop or paste directly.</p>
          </div>
        </div>
      </div>

      <div className="card about">
        <div className="section-title">
          <h3>The easiest way to sync your clipboard</h3>
          <p>No-login universal clipboard. Free, open source, and built for speed.</p>
        </div>
        <div className="seo-keywords">
          <span>✅ No app install</span>
          <span>✅ Works on all browsers</span>
          <span>✅ 100% free</span>
          <span>✅ Open source</span>
        </div>
      </div>
    </div>
  );
};

export default RoomSelector;