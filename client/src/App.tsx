import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RoomSelector from './components/RoomSelector';
import Room from './pages/Room';
import { useWebSocket } from './utils/useWebSocket';
import './App.css';

const App: React.FC = () => {
  const { createRoom, joinRoom } = useWebSocket();

  return (
    <Router>
      <div className="app">
        <div className="container">
          <Routes>
            <Route path="/" element={<RoomSelector onCreateRoom={createRoom} onJoinRoom={joinRoom} />} />
            <Route path="/:roomId" element={<Room />} />
          </Routes>
        </div>
        <footer className="footer">
          <p>
            Instant Paste - Real-time clipboard sync made by master Ivaka |{' '}
            <a 
              href="https://github.com/ivakalol/instant-paste" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </p>
        </footer>
      </div>
    </Router>
  );
};

export default App;
