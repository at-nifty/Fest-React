import React, { useState, useRef, useEffect } from 'react';

const CAM_LOG_PREFIX = "[CamScreen]";

// Consolidate styles for better reusability and cleaner component structure
const commonStyles = {
  pageContainer: {
    width: '100vw',
    minHeight: '100vh',
    padding: '0',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f0f2f5', // Light grey background for the page
    gap: '0'
  },
  header: {
    padding: '15px 20px',
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    width: '100vw',
    boxSizing: 'border-box',
  },
  mainContentArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '20px',
    flex: 1
  },
  title: {
    margin: '0 0 10px 0',
    color: '#333',
    fontSize: '1.8em'
  },
  status: {
    marginBottom: '5px',
    fontWeight: 'bold',
    fontSize: '1.1em'
  },
  error: {
    color: '#d9534f',
    fontWeight: 'bold',
    marginBottom: '10px'
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  video: {
    width: '100%',
    maxWidth: '720px', // Max width for very large screens
    height: 'auto',
    borderRadius: '6px',
    border: '1px solid #ddd',
    backgroundColor: '#000',
    display: 'block', // To remove extra space below video
    margin: '0 auto 20px auto' // Center video
  },
  textarea: {
    width: '100%',
    minHeight: '120px',
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '0.9em',
    boxSizing: 'border-box'
  },
  button: {
    padding: '12px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: '#007bff',
    color: 'white',
    fontSize: '1em',
    transition: 'background-color 0.2s ease'
  },
  buttonDisabled: {
    backgroundColor: '#6c757d',
    cursor: 'not-allowed'
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap'
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 'bold',
    color: '#555'
  }
};

function CameraScreen() {
  console.log(CAM_LOG_PREFIX + " Component RENDERED");
  const [localStream, setLocalStream] = useState(null);
  const [offerSignal, setOfferSignal] = useState('');
  const [answerSignalInput, setAnswerSignalInput] = useState('');
  const [status, setStatus] = useState('Not connected');
  const [error, setError] = useState('');

  const [availableVideoDevices, setAvailableVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  const pcRef = useRef(null);
  const collectedIceCandidatesRef = useRef([]);
  const offerSignalTextareaRef = useRef(null);

  useEffect(() => {
    const getDevices = async () => {
      try {
        // Ensure permissions are granted first, often by an initial getUserMedia call
        // For simplicity, we'll assume permissions might be granted or enumerate will work.
        // A more robust approach might tie this to after a successful startLocalMedia.
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); // Request permission
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setAvailableVideoDevices(videoDevices);
        if (videoDevices.length > 0 && !selectedDeviceId) {
          // setSelectedDeviceId(videoDevices[0].deviceId); // Optionally auto-select first device
        }
      } catch (err) {
        console.warn(CAM_LOG_PREFIX + " Error enumerating devices: " + err.message);
        // setError("Could not list camera devices: " + err.message); // Avoid immediate error, let user try to start
      }
    };
    getDevices();
  }, []); // Run once on mount

  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [localStream]);

  const startLocalMedia = async (deviceId) => {
    setStatus('Starting local media...');
    setError('');

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
      // If PC exists and we are changing cameras, we might need to renegotiate or re-add tracks.
      // For now, we assume connection will be re-established if it was active.
      if (pcRef.current) {
        // This is a simplification. In a real scenario, removing and re-adding tracks
        // might require renegotiation (new offer/answer).
        // Closing the PC and forcing a new offer might be more robust if changing mid-call.
        // For now, we just clear the stream and expect the user to create a new offer.
        setOfferSignal(''); 
        setAnswerSignalInput('');
        if (pcRef.current.signalingState !== 'closed') {
            // pcRef.current.close(); // Option: close PC to force clean start
            // pcRef.current = null;
        }
        setStatus('Camera changed. Please prepare a new offer.');
      }
    }

    const videoConstraints = deviceId ? { deviceId: { exact: deviceId } } : true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true });
      setLocalStream(stream);
      setSelectedDeviceId(deviceId || (stream.getVideoTracks()[0]?.getSettings().deviceId || ''));
      setStatus('Local media started.');
      // After successfully getting media, re-enumerate to get labels if they were missing
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setAvailableVideoDevices(videoDevices);

    } catch (err) {
      setError("Failed to start local media: " + err.message);
      setStatus('Error starting media.');
      // If starting with a specific deviceId fails, try to list devices again
      // and clear selectedDeviceId if it's invalid.
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setAvailableVideoDevices(videoDevices);
      if (deviceId && !videoDevices.find(d => d.deviceId === deviceId)) {
        setSelectedDeviceId(''); // Clear invalid deviceId
      }
    }
  };

  const initializePcAndCreateOffer = async () => {
    if (!localStream) {
      setError("Local media not started. Please start camera first.");
      return;
    }
    setStatus("Cam: Initializing PeerConnection...");
    setError('');
    collectedIceCandidatesRef.current = [];
    if(pcRef.current) pcRef.current.close();

    const pc = new RTCPeerConnection({ iceTransportPolicy: 'all' });
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) collectedIceCandidatesRef.current.push(event.candidate.toJSON());
    };

    pc.onicegatheringstatechange = () => {
      setStatus("Cam ICE Gathering: " + pc.iceGatheringState);
      if (pc.iceGatheringState === 'complete') {
        if (!pc.localDescription) {
          setError("Cam: Error: Local description missing during offer creation.");
          return;
        }
        const offerSignalPayload = {
          type: 'camera_offer',
          sdp: pc.localDescription.toJSON(),
          iceCandidates: collectedIceCandidatesRef.current
        };
        setOfferSignal(JSON.stringify(offerSignalPayload, null, 2));
        setStatus('Cam: Offer created. Copy it to Controller.');
      }
    };

    pc.onconnectionstatechange = () => {
      setStatus("Cam-Ctrl Connection: " + pc.connectionState);
      if (pc.connectionState === 'failed') setError("Cam: Connection to Controller FAILED.");
      else if (pc.connectionState === "connected") {
        setStatus("Cam: Successfully connected to Controller!");
        setError('');
      }
    };
    
    pc.oniceconnectionstatechange = () => setStatus("Cam-Ctrl ICE: " + pc.iceConnectionState);
    pc.onsignalingstatechange = () => console.log(CAM_LOG_PREFIX + "Signaling state: " + pc.signalingState);

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
    } catch (err) {
      setError("Cam: Offer Error: " + err.toString());
      setStatus('Cam: Failed to create offer.');
    }
  };

  const processAnswerFromController = async () => {
    const pc = pcRef.current;
    if (!pc) {
      setError("Cam: PeerConnection not initialized. Create offer first.");
      return;
    }
    if (!answerSignalInput) {
      setError("Cam: Answer signal from Controller is empty.");
      return;
    }
    setStatus("Cam: Processing answer from Controller...");
    setError('');
    try {
      const answerPayload = JSON.parse(answerSignalInput);
      if (!answerPayload || typeof answerPayload.sdp !== 'object' || answerPayload.sdp.type !== 'answer') {
        setError("Cam: Invalid answer signal received.");
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(answerPayload.sdp));
      if (answerPayload.iceCandidates && Array.isArray(answerPayload.iceCandidates)) {
        for (const candidate of answerPayload.iceCandidates) {
          if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.warn("Error adding ICE candidate: "+e));
        }
      }
      setStatus("Cam: Answer processed. Connecting...");
    } catch (err) {
      setError("Cam: Answer Handling Error: " + err.toString());
      setStatus('Cam: Failed to process answer.');
    }
  };

  const fallbackCopyToClipboard = (text, type) => {
    if (offerSignalTextareaRef.current) {
      offerSignalTextareaRef.current.select();
      document.execCommand('copy');
      setStatus("Copied " + type + " (fallback)! Please verify.");
      setTimeout(() => setStatus(prev => prev === ("Copied " + type + " (fallback)! Please verify.") ? ('Cam: ' + type + ' ready.') : prev), 2000);
    } else {
      setError("Textarea ref not available for fallback copy.");
    }
  };

  const copyToClipboard = (textToCopy, type) => {
    if (!textToCopy) {
      setError("No " + type + " to copy.");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          setStatus('Copied ' + type + ' to clipboard!');
          setTimeout(() => setStatus(prev => prev === ('Copied ' + type + ' to clipboard!') ? ('Cam: ' + type + ' ready.') : prev), 2000);
        })
        .catch(err => {
          setError('Failed to copy ' + type + '. Please copy manually.');
          fallbackCopyToClipboard(textToCopy, type);
        });
    } else {
      fallbackCopyToClipboard(textToCopy, type);
    }
  };

  return (
    <div style={commonStyles.pageContainer}>
      <header style={commonStyles.header}>
        <h1 style={commonStyles.title}>Camera Feed Setup</h1>
        <p style={commonStyles.status}>Status: {status}</p>
        {error && <p style={commonStyles.error}>Error: {error}</p>}
      </header>

      <div style={commonStyles.mainContentArea}>
        <section style={commonStyles.card}>
          <h2 style={{...commonStyles.title, fontSize: '1.4em'}}>Local Camera Preview</h2>
          {localStream ? (
            <video 
              ref={videoEl => { if (videoEl) videoEl.srcObject = localStream; }} 
              autoPlay 
              playsInline 
              muted 
              style={commonStyles.video}
            />
          ) : (
            <div style={{...commonStyles.video, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#333', color: 'white', minHeight: '200px'}}>
              <p>Camera not started or no stream available.</p>
            </div>
          )}
          <div style={commonStyles.buttonGroup}>
            <button 
              onClick={() => startLocalMedia(selectedDeviceId)} 
              disabled={!!localStream && availableVideoDevices.length === 0}
              style={{...commonStyles.button, ...((!!localStream && availableVideoDevices.length === 0) && commonStyles.buttonDisabled)}}
            >
              {localStream ? 'Change Camera / Restart' : 'Start Camera'}
            </button>
            {availableVideoDevices.length > 0 && (
              <select 
                value={selectedDeviceId} 
                onChange={e => {
                  const newDeviceId = e.target.value;
                  setSelectedDeviceId(newDeviceId);
                  if (localStream) {
                    startLocalMedia(newDeviceId);
                  }
                }}
                style={{...commonStyles.button, paddingRight: '30px', WebkitAppearance: 'menulist-button'}}
                disabled={!localStream && availableVideoDevices.length === 0}
              >
                <option value="">-- Select Camera --</option>
                {availableVideoDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${availableVideoDevices.indexOf(device) + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        <section style={commonStyles.card}>
          <h2 style={{...commonStyles.title, fontSize: '1.4em'}}>Connection Details</h2>
          
          <div style={commonStyles.buttonGroup}>
            <button 
              onClick={initializePcAndCreateOffer} 
              disabled={!localStream || !!offerSignal}
              style={{...commonStyles.button, ...((!localStream || !!offerSignal) && commonStyles.buttonDisabled)}}
            >
              {offerSignal ? 'Offer Prepared' : '1. Prepare Offer for Controller'}
            </button>
          </div>

          {offerSignal && (
            <div style={{marginTop: '15px'}}>
              <label htmlFor="offerSignal" style={commonStyles.label}>Offer to send to Controller:</label>
              <textarea 
                id="offerSignal"
                ref={offerSignalTextareaRef}
                value={offerSignal} 
                readOnly 
                style={commonStyles.textarea}
              />
              <div style={{...commonStyles.buttonGroup, marginTop: '10px'}}>
                <button onClick={() => copyToClipboard(offerSignal, "Offer")} style={commonStyles.button}>Copy Offer</button>
                <button onClick={() => downloadJson(offerSignal, `camera-offer-${Date.now()}.json`, "Offer JSON")} style={commonStyles.button}>Download Offer JSON</button>
              </div>
            </div>
          )}

          <div style={{marginTop: '20px'}}>
            <label htmlFor="answerSignalInput" style={commonStyles.label}>Paste Answer from Controller:</label>
            <textarea 
              id="answerSignalInput"
              value={answerSignalInput} 
              onChange={e => setAnswerSignalInput(e.target.value)} 
              placeholder="Paste Controller's Answer JSON here" 
              style={commonStyles.textarea}
              disabled={!offerSignal}
            />
          </div>
          <div style={commonStyles.buttonGroup}>
            <button 
              onClick={processAnswerFromController} 
              disabled={!answerSignalInput || !offerSignal || (pcRef.current && pcRef.current.connectionState === 'connected')}
              style={{...commonStyles.button, ...((!answerSignalInput || !offerSignal || (pcRef.current && pcRef.current.connectionState === 'connected')) && commonStyles.buttonDisabled)}}
            >
              {pcRef.current && pcRef.current.connectionState === 'connected' ? 'Connected' : '2. Process Answer'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default CameraScreen; 