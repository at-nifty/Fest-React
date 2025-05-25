import React, { useState, useRef, useEffect } from 'react';

const MON_LOG_PREFIX = "[MonitorScreen]";

// Using commonStyles similar to CameraScreen for consistency
const commonStyles = {
  pageContainer: {
    width: '100vw',
    minHeight: '100vh',
    padding: '0',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f0f2f5', 
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
    maxWidth: '720px',
    height: 'auto',
    borderRadius: '6px',
    border: '1px solid #ddd',
    backgroundColor: '#000',
    display: 'block',
    margin: '0 auto 20px auto'
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
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 'bold',
    color: '#555'
  }
};

function MonitorScreen() {
  console.log(MON_LOG_PREFIX + " Component RENDERED");
  const [controllerOfferJsonInput, setControllerOfferJsonInput] = useState('');
  const [monitorAnswerJson, setMonitorAnswerJson] = useState('');
  const [status, setStatus] = useState('Waiting for Offer from Controller');
  const [error, setError] = useState('');
  const pcRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const videoRef = useRef(null);
  const collectedIceCandidatesRef = useRef([]);
  const answerTextareaRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (remoteStreamRef.current) {
        remoteStreamRef.current.getTracks().forEach(track => track.stop());
        remoteStreamRef.current = null;
      }
    };
  }, []);

  const processOfferAndCreateAnswer = async () => {
    if (!controllerOfferJsonInput) {
      setError("Monitor: Controller Offer input is empty.");
      return;
    }
    setStatus("Monitor: Processing Offer...");
    setError('');
    collectedIceCandidatesRef.current = [];
    setMonitorAnswerJson(''); // Clear previous answer

    let offerPayload;
    try {
      offerPayload = JSON.parse(controllerOfferJsonInput);
    } catch (e) {
      setError("Monitor: Invalid JSON in Controller Offer: " + e.message);
      setStatus("Monitor: Failed to parse offer.");
      return;
    }

    if (!offerPayload || typeof offerPayload.sdp !== 'object' || offerPayload.sdp.type !== 'offer') {
      setError("Monitor: Invalid Controller Offer signal structure.");
      setStatus("Monitor: Invalid offer structure.");
      return;
    }

    try {
      if (pcRef.current) pcRef.current.close();
      const pc = new RTCPeerConnection({}); 
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) collectedIceCandidatesRef.current.push(event.candidate.toJSON());
      };

      pc.onicegatheringstatechange = () => {
        setStatus("Monitor ICE Gathering: " + pc.iceGatheringState);
        if (pc.iceGatheringState === 'complete') {
          if (!pc.localDescription) {
            setError("Monitor: Error: Local description missing during answer creation.");
            return;
          }
          const answerPayload = {
            type: 'monitor_answer_to_controller',
            sdp: pc.localDescription.toJSON(),
            iceCandidates: collectedIceCandidatesRef.current
          };
          setMonitorAnswerJson(JSON.stringify(answerPayload, null, 2));
          setStatus('Monitor: Answer created. Copy to Controller.');
        }
      };

      pc.onconnectionstatechange = () => {
        setStatus("Monitor Connection: " + pc.connectionState);
        if (pc.connectionState === 'failed') setError("Monitor: Connection FAILED.");
        else if (pc.connectionState === 'connected') {
          setStatus("Monitor: Connected! Stream should be playing.");
          setError('');
        }
      };
      
      pc.oniceconnectionstatechange = () => setStatus("Monitor ICE: " + pc.iceConnectionState);
      pc.onsignalingstatechange = () => console.log(MON_LOG_PREFIX + "Signaling state: " + pc.signalingState);

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
          if (videoRef.current) videoRef.current.srcObject = event.streams[0];
        } else {
          const newStream = new MediaStream([event.track]);
          remoteStreamRef.current = newStream;
          if (videoRef.current) videoRef.current.srcObject = newStream;
        }
        setStatus("Monitor: Stream received.");
      };

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      await pc.setRemoteDescription(new RTCSessionDescription(offerPayload.sdp));
      
      if (offerPayload.iceCandidates && Array.isArray(offerPayload.iceCandidates)) {
        for (const candidate of offerPayload.iceCandidates) {
          if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.warn("Error adding remote ICE: "+e));
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

    } catch (err) {
      setError("Monitor: Offer/Answer Error: " + err.toString());
      setStatus('Monitor: Failed to process Controller offer.');
    }
  };

  const fallbackCopyToClipboard = (text, type, textareaRefForFallback) => {
    if (textareaRefForFallback && textareaRefForFallback.current) {
      textareaRefForFallback.current.select();
      document.execCommand('copy');
      setStatus("Copied " + type + " (fallback)! Please verify.");
      setTimeout(() => setStatus(prev => prev === ("Copied " + type + " (fallback)! Please verify.") ? ("Monitor: " + type + " ready.") : prev), 2000);
    } else {
      setError("Textarea ref not available for fallback copy for " + type);
    }
  };

  const copyToClipboard = (textToCopy, type, textareaForFallbackRef) => {
    if (!textToCopy) {
      setError("Monitor: No " + type + " text to copy.");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          setStatus("Copied " + type + " to clipboard!");
          setTimeout(() => setStatus(prev => prev === ("Copied " + type + " to clipboard!") ? ("Monitor: " + type + " ready.") : prev), 2000);
        })
        .catch(err => {
          setError("Failed to copy " + type + ". Please copy manually or grant clipboard permission.");
          fallbackCopyToClipboard(textToCopy, type, textareaForFallbackRef);
        });
    } else {
      fallbackCopyToClipboard(textToCopy, type, textareaForFallbackRef);
    }
  };

  return (
    <div style={commonStyles.pageContainer}>
      <header style={commonStyles.header}>
        <h1 style={commonStyles.title}>Monitor Station</h1>
        <p style={commonStyles.status}>Status: {status}</p>
        {error && <p style={commonStyles.error}>Error: {error}</p>}
      </header>

      <div style={commonStyles.mainContentArea}>
        <section style={commonStyles.card}>
          <h2 style={{...commonStyles.title, fontSize: '1.4em'}}>Incoming Connection Setup</h2>
          <div>
            <label htmlFor="controllerOffer" style={commonStyles.label}>Paste Offer from Controller:</label>
            <textarea 
                id="controllerOffer"
                placeholder="Controller's Offer JSON goes here..." 
                value={controllerOfferJsonInput} 
                onChange={e => setControllerOfferJsonInput(e.target.value)} 
                style={commonStyles.textarea}
                disabled={pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed'}
            />
          </div>
          <button 
            onClick={processOfferAndCreateAnswer} 
            style={{...commonStyles.button, ...((!controllerOfferJsonInput || (pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed')) && commonStyles.buttonDisabled)} }
            disabled={!controllerOfferJsonInput || (pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed')}
          >
            Process Offer & Generate Answer
          </button>
          
          {monitorAnswerJson && (
            <div>
              <label htmlFor="monitorAnswer" style={commonStyles.label}>Copy Answer to Controller:</label>
              <textarea 
                id="monitorAnswer"
                ref={answerTextareaRef} 
                value={monitorAnswerJson} 
                readOnly 
                style={commonStyles.textarea}
              />
              <button 
                  onClick={() => copyToClipboard(monitorAnswerJson, 'Answer', answerTextareaRef)} 
                  style={{...commonStyles.button, marginTop: '10px'}}
              >
                Copy Answer
              </button>
            </div>
          )}
        </section>

        <section style={commonStyles.card}>
          <h2 style={{...commonStyles.title, fontSize: '1.4em'}}>Remote Video Feed</h2>
          <video ref={videoRef} autoPlay playsInline style={commonStyles.video} />
          {!remoteStreamRef.current && (
            <div style={{...commonStyles.video, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#333', color: 'white', minHeight: '200px'}}>
                <p>Waiting for video stream from Controller...</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default MonitorScreen; 