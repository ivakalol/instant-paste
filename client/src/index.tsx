import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(registration => {
        console.log('SW registered:', registration);
        // Periodically check for updates
        setInterval(() => {
          registration.update();
        }, 1000 * 60 * 10); // Check every 10 minutes
      })
      .catch(error => {
        console.log('SW registration failed:', error);
      });
  });

  // This event fires when the service worker controlling this page changes,
  // which happens when a new service worker has been activated.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    // Reload the page to use the new assets and logic from the new service worker.
    window.location.reload();
    refreshing = true;
  });
}
