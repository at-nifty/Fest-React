import React from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from './store';

function RoleSelectionScreen() {
  const navigate = useNavigate();
  const setRole = useStore((state) => state.setRole);

  const handleRoleSelection = (selectedRole) => {
    setRole(selectedRole);
    navigate(`/${selectedRole.toLowerCase()}`);
  };

  return (
    <div>
      <h1>Select Your Role</h1>
      <button onClick={() => handleRoleSelection('Controller')}>Controller</button>
      <button onClick={() => handleRoleSelection('Monitor')}>Monitor</button>
      <button onClick={() => handleRoleSelection('Camera')}>Camera</button>
    </div>
  );
}

export default RoleSelectionScreen; 