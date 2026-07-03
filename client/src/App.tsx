import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import RoomSelector from './components/room/RoomSelector';
import Room from './pages/Room';
import { useWebSocket } from './hooks/useWebSocket';
import NotFound from './pages/NotFound';
import './App.css';

const RoomSelectorRoute: React.FC = () => {
  const { createRoom, joinRoom, isReady } = useWebSocket();

  return (
    <RoomSelector
      onCreateRoom={createRoom}
      onJoinRoom={joinRoom}
      isReady={isReady}
    />
  );
};

const AppContent: React.FC = () => {
  return (
    <div className="app">
      <header className="site-header">
        <Link to="/" className="brand" aria-label="Instant Paste home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <path d="M9 13h6M12 10v6" />
            </svg>
          </span>
          <span>Instant Paste</span>
        </Link>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<RoomSelectorRoute />} />
          <Route path="/:roomId" element={<Room />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};

const Footer:  React.FC = () => (
  <footer className="footer">
    <p>
      Real-time clipboard sync by ivaka_lol
      <span className="footer-separator" aria-hidden="true">·</span>
      <a
        href="https://github.com/ivakalol/instant-paste"
        target="_blank"
        rel="noopener noreferrer"
      >
        View on GitHub
      </a>
    </p>
  </footer>
);

const App: React.FC = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;
