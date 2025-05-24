import React from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from './store';

function RoleSelectionScreen() {
  const navigate = useNavigate();
  const setRole = useStore((state) => state.setRole);

  const handleRoleSelection = React.useCallback((selectedRole) => {
    setRole(selectedRole);
    navigate(`/${selectedRole.toLowerCase()}`);
  }, [navigate, setRole]);

  return (
    <div style={{ textAlign: 'center', paddingTop: '20px' }}>
      <h1 className="screen-title">Welcome! Select Your Role</h1>
      <p className="info-text" style={{fontSize: '1.1rem', marginBottom: '30px'}}>
        How would you like to use this PWA Video Switching System?
      </p>
      <div className="button-group" style={{ justifyContent: 'center', gap: '20px' }}>
        <button onClick={() => handleRoleSelection('Controller')} className="button">
          {/* Add Icon here e.g. <Icon type="controller" /> */}
          Controller
        </button>
        <button onClick={() => handleRoleSelection('Monitor')} className="button">
          {/* <Icon type="monitor" /> */}
          Monitor
        </button>
        <button onClick={() => handleRoleSelection('Camera')} className="button">
          {/* <Icon type="camera" /> */}
          Camera
        </button>
      </div>
    </div>
  );
}

export default RoleSelectionScreen; 