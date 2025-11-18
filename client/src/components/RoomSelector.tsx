import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface RoomSelectorProps {
  onCreateRoom: () => Promise<string | null>;
  onJoinRoom: (roomId: string) => Promise<boolean>;
  isReady: boolean;
}

const RoomSelector: React.FC<RoomSelectorProps> = ({ onCreateRoom, onJoinRoom, isReady }) => {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleCreate = async () => {
    const newRoomId = await onCreateRoom();
    if (newRoomId) {
      navigate(`/${newRoomId}`);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      const success = await onJoinRoom(roomId.trim().toUpperCase());
      if (success) {
        navigate(`/${roomId.trim().toUpperCase()}`);
      }
    }
  };

  return (
    <div className="room-selector">
      <h1>Instant Paste</h1>
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
      
      <div className="info-box">
        <h3>How it works:</h3>
        <ul>
          <li>Create a room or join with a room ID</li>
          <li>Paste text, images, or videos (Ctrl+V or tap paste area)</li>
          <li>Content instantly syncs to all devices in the same room</li>
          <li>Copy or download received content</li>
        </ul>
      </div>
    </div>
  );
};

export default RoomSelector;
