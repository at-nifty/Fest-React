import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import useStore from './store';

function App() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const role = useStore((state) => state.role);
  const navigate = useNavigate();

  useEffect(() => {
    if (!role && window.location.pathname !== '/' && !window.location.pathname.startsWith('/public')) {
      // Basic redirect if role not set, avoiding issues with public assets or initial load. Consider if needed.
      // console.log('App.jsx: No role, current path:', window.location.pathname, 'redirecting');
      // navigate('/');
    }

    const beforeInstallPromptHandler = (e) => {
      e.preventDefault();
      console.log('`beforeinstallprompt` event fired');
      setInstallPrompt(e);
    };

    const appInstalledHandler = () => {
      console.log('PWA was installed');
      setIsAppInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', beforeInstallPromptHandler);
    window.addEventListener('appinstalled', appInstalledHandler);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('App is running in standalone mode');
      setIsAppInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstallPromptHandler);
      window.removeEventListener('appinstalled', appInstalledHandler);
    };
  }, [role, navigate]);

  const handleInstallClick = React.useCallback(async () => {
    if (!installPrompt) return;
    try {
      const result = await installPrompt.prompt();
      console.log(`Install prompt outcome: ${result.outcome}`);
      if (result.outcome !== 'accepted') {
        setInstallPrompt(null);
      }
      // 'appinstalled' event will setInstallPrompt(null) if accepted
    } catch (error) {
      console.error('Error during PWA installation prompt:', error);
      setInstallPrompt(null);
    }
  }, [installPrompt]);

  // Manual Service Worker registration is removed here.
  // vite-plugin-pwa with registerType: 'autoUpdate' handles SW registration.

  return (
    <>
      <Outlet /> {/* Child routes from main.jsx will render here */}

      {installPrompt && !isAppInstalled && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1050, // Ensure it's above other elements
          padding: '0', // Button itself will have padding
          backgroundColor: 'transparent' // Let button define its background
        }}>
          <button 
            onClick={handleInstallClick}
            className="button" // Use global button style, can add specific class too
            style={{ 
                backgroundColor: '#28a745', /* Keep green for install */
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            {/* Consider adding an icon here */}
            Install App to Home Screen
          </button>
        </div>
      )}
    </>
  );
}

export default App;
