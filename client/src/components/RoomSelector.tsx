import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRecentRooms, addRecentRoom } from '../utils/recentRooms';

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
    if (roomToJoin) {
      const success = await onJoinRoom(roomToJoin);
      if (success) {
        addRecentRoom(roomToJoin);
        navigate(`/${roomToJoin}`);
      }
    }
  };

  const handleJoinRecent = (recentRoomId: string) => {
    addRecentRoom(recentRoomId);
    navigate(`/${recentRoomId}`);
    window.location.reload();
  };

  return (
    <div className="room-selector">
      <h1>Ivaka Instant Paste</h1>
      <p className="subtitle">Real-time clipboard sync between devices</p>
      
      <div className="room-options">
        <button onClick={handleCreate} className="btn btn-primary" disabled={!isReady}>
          {isReady ? 'Create New Room' : 'Initializing...'}
        </button>
        
        <div className="divider">
          <span>OR</span>
        </div>
        
        <form onSubmit={handleJoin} className="join-form">
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            maxLength={6}
            className="room-input"
          />
          <button type="submit" className="btn btn-secondary" disabled={!roomId.trim() || !isReady}>
            Join Room
          </button>
        </form>
      </div>

      {recentRooms.length > 0 && (
        <div className="recent-rooms-section">
          <h3 className="recent-rooms-title">Recently Visited</h3>
          <div className="recent-rooms-list">
            {recentRooms.map((recentRoomId) => (
              <button
                key={recentRoomId}
                onClick={() => handleJoinRecent(recentRoomId)}
                className="btn btn-recent"
              >
                {recentRoomId}
              </button>
            ))}
          </div>
        </div>
      )}
      
      <div className="features-section">
        <h3 className="features-title">How It Works</h3>
        <div className="features-grid">
          <div className="feature-item">
            <div className="feature-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <h4>Create or Join Rooms</h4>
            <p>Start a new temporary room with one click or join an existing one with a simple ID.</p>
          </div>
          <div className="feature-item">
            <div className="feature-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
            </div>
            <h4>Paste Anything</h4>
            <p>Sync text, images, and video files. Just paste, drag & drop, or select a file.</p>
          </div>
          <div className="feature-item">
            <div className="feature-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.81m5.84-2.57a14.98 14.98 0 00-5.84-2.57m-2.57-5.84A14.98 14.98 0 005.63 11.91m12.42 2.46a14.98 14.98 0 00-2.46-12.42" />
              </svg>
            </div>
            <h4>Instant Sync</h4>
            <p>Your clipboard is shared in real-time with all connected devices in the room.</p>
          </div>
          <div className="feature-item">
            <div className="feature-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h4>E2E Encrypted</h4>
            <p>All data is end-to-end encrypted. Only encrypted content is sent over the internet. Your content is never stored on our server.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomSelector;
