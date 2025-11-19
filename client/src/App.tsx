import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RoomSelector from './components/RoomSelector';
import Room from './pages/Room';
import { useWebSocket } from './utils/useWebSocket';
import './App.css';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

const App: React.FC = () => {
  const { createRoom, joinRoom, isReady } = useWebSocket();
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(prevMode => !prevMode);
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      <Router>
        <div className="app">
          <div className="container">
            <Routes>
              <Route path="/" element={<RoomSelector onCreateRoom={createRoom} onJoinRoom={joinRoom} isReady={isReady} />} />
              <Route path="/:roomId" element={<Room />} />
            </Routes>
          </div>
          <footer className="footer">
            <p>
              Ivaka Instant Paste - Real-time clipboard sync made by master Ivaka |{' '}
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
    </ThemeContext.Provider>
  );
};

export default App;
