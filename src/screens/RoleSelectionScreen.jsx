import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store'; // Corrected import

function RoleSelectionScreen() {
  const navigate = useNavigate();
  const setRole = useAppStore(state => state.setRole); // Corrected usage

  const selectRole = (role) => {
    setRole(role);
    navigate(`/${role.toLowerCase()}`);
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', // Center content vertically for this page
      justifyContent: 'center', // Center content horizontally for this page
      minHeight: '100vh',
      width: '100vw',
      padding: '0', // MODIFIED: Remove padding from the outermost container
      boxSizing: 'border-box',
      backgroundColor: '#f0f2f5', // Match other page backgrounds
    }}>
      <h1 style={{ textAlign: 'center', width: '100%', marginBottom: '40px', color: '#333', fontSize: '2em' }}>Select Your Role</h1>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'row',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '30px', // Increased gap for better spacing
        padding: '20px' // Add padding here if needed around the button group, or rely on margins/gaps
      }}>
        <button 
          onClick={() => selectRole('Controller')} 
          style={{ 
            fontSize: '1.3em', 
            padding: '20px 40px', 
            minWidth: '200px', 
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
          }}
        >
          Controller
        </button>
        <button 
          onClick={() => selectRole('Monitor')} 
          style={{ 
            fontSize: '1.3em', 
            padding: '20px 40px', 
            minWidth: '200px', 
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
          }}
        >
          Monitor
        </button>
        <button 
          onClick={() => selectRole('Camera')} 
          style={{ 
            fontSize: '1.3em', 
            padding: '20px 40px', 
            minWidth: '200px', 
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
          }}
        >
          Camera
        </button>
      </div>
    </div>
  );
}

export default RoleSelectionScreen; 