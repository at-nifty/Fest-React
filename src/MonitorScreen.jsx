import React from 'react';

function MonitorScreen() {
  return (
    <div>
      <h1>Monitor Screen</h1>
      <div>Video Display Area</div>
      <video style={{ width: '100%', backgroundColor: 'black' }} playsInline autoPlay muted loop></video>
    </div>
  );
}

export default MonitorScreen; 