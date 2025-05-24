import React, { useEffect, useRef } from 'react';

function CameraScreen() {
  const videoRef = useRef(null);

  useEffect(() => {
    // Access camera and stream to video element
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(err => console.error("Error accessing camera: ", err));
  }, []);

  return (
    <div>
      <h1>Camera Screen</h1>
      <div>Camera Preview Area</div>
      <video ref={videoRef} style={{ width: '100%', backgroundColor: 'black' }} playsInline autoPlay muted></video>
    </div>
  );
}

export default CameraScreen; 