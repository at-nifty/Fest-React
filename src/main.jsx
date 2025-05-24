import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RoleSelectionScreen from './RoleSelectionScreen.jsx';
import ControllerScreen from './ControllerScreen.jsx';
import MonitorScreen from './MonitorScreen.jsx';
import CameraScreen from './CameraScreen.jsx';

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<RoleSelectionScreen />} />
        <Route path="/controller" element={<ControllerScreen />} />
        <Route path="/monitor" element={<MonitorScreen />} />
        <Route path="/camera" element={<CameraScreen />} />
      </Routes>
    </Router>
  </React.StrictMode>,
);
