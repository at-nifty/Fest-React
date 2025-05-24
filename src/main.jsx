import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // Main App layout component
import './index.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RoleSelectionScreen from './RoleSelectionScreen.jsx';
import ControllerScreen from './ControllerScreen.jsx';
import MonitorScreen from './MonitorScreen.jsx';
import CameraScreen from './CameraScreen.jsx';

// Service worker registration logic can remain here or be moved to App.jsx useEffect
// For simplicity with vite-plugin-pwa, often it's handled by the plugin's import.
// The plugin will inject the necessary registration script.
// If you have `registerType: 'autoUpdate'` in vite.config.js, it handles this.
// You can remove the manual registration block if using vite-plugin-pwa effectively.

// Example: Removing manual SW registration if vite-plugin-pwa handles it
/*
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}
*/

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<RoleSelectionScreen />} />
          <Route path="controller" element={<ControllerScreen />} />
          <Route path="monitor" element={<MonitorScreen />} />
          <Route path="camera" element={<CameraScreen />} />
          {/* Add other nested routes here if App.jsx is a layout for them */}
        </Route>
      </Routes>
    </Router>
  </React.StrictMode>,
);
