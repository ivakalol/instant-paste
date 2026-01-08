import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RoomSelector from './components/RoomSelector';
import Room from './pages/Room';
import { useWebSocket } from './utils/useWebSocket';
import { ThemeProvider } from './components/ThemeContext';
import './App.css';

const AppContent: React.FC = () => {
  const { createRoom, joinRoom, isReady } = useWebSocket();

  return (
    <div className="app">
      <div className="container">
        <Routes>
          <Route 
            path="/" 
            element={
              <RoomSelector 
                onCreateRoom={createRoom} 
                onJoinRoom={joinRoom} 
                isReady={isReady} 
              />
            } 
          />
          <Route path="/:roomId" element={<Room />} />
        </Routes>
      </div>
      <Footer />
    </div>
  );
};

const Footer:  React.FC = () => (
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
);

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Router>
        <AppContent />
      </Router>
    </ThemeProvider>
  );
};

export default App;