import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';

const CTRL_LOG_PREFIX = "[CtrlScreen]";

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
    borderRadius: '0',
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
    minHeight: '100px',
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '0.9em',
    boxSizing: 'border-box'
  },
  button: {
    padding: '10px 15px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: '#007bff',
    color: 'white',
    fontSize: '0.95em',
    transition: 'background-color 0.2s ease'
  },
  buttonDisabled: {
    backgroundColor: '#6c757d',
    cursor: 'not-allowed'
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 'bold',
    color: '#555'
  },
  deviceListContainer: {
    display: 'flex',
    flexDirection: 'row',
    gap: '20px',
    width: '100%'
  },
  deviceColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  deviceListItem: {
    padding: '15px',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    backgroundColor: '#f9f9f9',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  selectedDevice: { backgroundColor: '#e6f7ff' },
  selectedMonitorDevice: { backgroundColor: '#e0f7fa' },
  statusBadge: {
    padding: '3px 8px',
    borderRadius: '12px',
    fontSize: '0.8em',
    color: 'white',
    display: 'inline-block',
    marginLeft: '10px'
  },
  smallId: { fontSize: '0.8em', color: '#777', marginTop: '5px' }
};

const getStatusColor = (status) => {
  if (!status) return '#6c757d';
  if (status.includes('connected') || status.includes('streaming')) return '#28a745'; 
  if (status.includes('ready')) return '#17a2b8';    
  if (status.includes('error')) return '#dc3545';
  if (status.includes('processing') || status.includes('preparing')) return '#ffc107'; 
  if (status.startsWith('pc_state_')) return '#6c757d'; 
  return '#007bff'; 
};

function ControllerScreen() {
  const {
    cameras, monitors,
    addCamera, setCameraAnswer, updateCameraStatus, getCameraById,
    addMonitorPlaceholder, 
    selectCamera, selectedCameraId, // Only used for preview now
    setOfferForMonitor, setMonitorAnswer, updateMonitorStatus, getMonitorById
  } = useAppStore();

  const [newCamOfferInput, setNewCamOfferInput] = useState('');
  const [expandedCameraJson, setExpandedCameraJson] = useState(null);
  const [expandedMonitorJson, setExpandedMonitorJson] = useState(null);
  const [monitorSourceMap, setMonitorSourceMap] = useState({});
  
  const [currentMonitorIdForOffer, setCurrentMonitorIdForOffer] = useState(null);
  const [currentMonitorIdForAnswer, setCurrentMonitorIdForAnswer] = useState(null);
  const [answerFromMonitorInput, setAnswerFromMonitorInput] = useState('');

  const cameraPcRefs = useRef({});
  const cameraStreamRefs = useRef({});
  const monitorPcRefs = useRef({});

  const [status, setStatus] = useState('Controller Idle');
  const [error, setError] = useState('');

  const createEmptyMediaStream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No Signal', canvas.width/2, canvas.height/2);
    }
    const videoStream = canvas.captureStream(1);
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const dest = oscillator.connect(audioContext.createMediaStreamDestination());
    oscillator.start();
    const [videoTrack] = videoStream.getVideoTracks();
    const [audioTrack] = dest.stream.getAudioTracks();
    return new MediaStream([videoTrack, audioTrack]);
  };

  const switchMonitorCamera = useCallback(async (monitorId, cameraId) => {
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    const pc = monitorPcRefs.current[monitorId];
    if (!pc || !monitor.status.includes('connected')) return;

    const newStream = cameraId ? cameraStreamRefs.current[cameraId] : createEmptyMediaStream();
    if (!newStream) return;

    const senders = pc.getSenders();
    const tracks = newStream.getTracks();
    
    // Replace tracks for each sender
    for (let i = 0; i < senders.length; i++) {
      if (tracks[i]) {
        try {
          await senders[i].replaceTrack(tracks[i]);
        } catch (err) {
          console.error(CTRL_LOG_PREFIX + " Error replacing track for monitor " + monitorId, err);
          return;
        }
      }
    }

    setMonitorSourceMap(prev => ({ ...prev, [monitorId]: cameraId }));
    setStatus(`Switched ${monitor.name} to ${cameraId ? getCameraById(cameraId)?.name || 'unknown camera' : 'No Signal'}`);
  }, [getCameraById, getMonitorById]);

  useEffect(() => {
    return () => {
      Object.values(cameraPcRefs.current).forEach(pc => pc?.close());
      Object.values(monitorPcRefs.current).forEach(pc => pc?.close());
      cameraPcRefs.current = {};
      monitorPcRefs.current = {};
      cameraStreamRefs.current = {};
    };
  }, []);

  // Existing handlers with updated monitor offer handling
  const handleProcessNewCameraOffer = async () => {
    if (!newCamOfferInput) {
      setError("New Camera Offer input is empty.");
      return;
    }
    
    setStatus("Processing new camera offer...");
    setError('');
    let parsedRawOffer;
    try {
      parsedRawOffer = JSON.parse(newCamOfferInput);
    } catch (e) {
      setError("Invalid JSON in Camera Offer: " + e.message);
      setStatus("Failed to parse camera offer.");
      return;
    }

    if (!parsedRawOffer || !parsedRawOffer.sdp || parsedRawOffer.sdp.type !== 'offer') {
      setError("Invalid offer structure in Camera Offer JSON.");
      setStatus("Invalid camera offer structure.");
      return;
    }

    const newCamId = addCamera(newCamOfferInput, parsedRawOffer.iceCandidates || [], parsedRawOffer);
    updateCameraStatus(newCamId, 'processing_offer');
    setExpandedCameraJson(newCamId);

    try {
      const pc = new RTCPeerConnection({});
      cameraPcRefs.current[newCamId] = pc;
      const collectedIceCandidates = [];
      
      pc.onicecandidate = event => {
        if (event.candidate) collectedIceCandidates.push(event.candidate.toJSON());
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          if (!pc.localDescription) {
            setError("Failed to generate answer for Camera " + newCamId + ": No local description.");
            updateCameraStatus(newCamId, 'error_answering');
            return;
          }
          const answer = {
            type: 'controller_answer_to_cam',
            sdp: pc.localDescription.toJSON(),
            iceCandidates: collectedIceCandidates,
          };
          setCameraAnswer(newCamId, JSON.stringify(answer, null, 2), collectedIceCandidates);
          updateCameraStatus(newCamId, 'answer_ready');
          setStatus("Answer generated for camera " + (getCameraById(newCamId)?.name || newCamId));
        }
      };

      pc.ontrack = event => {
        const stream = event.streams && event.streams[0] ? event.streams[0] : 
                      (event.track ? new MediaStream([event.track]) : null);
        if (stream) {
          cameraStreamRefs.current[newCamId] = stream;
          updateCameraStatus(newCamId, 'connected_streaming');
          setStatus("Camera " + (getCameraById(newCamId)?.name || newCamId) + " connected and streaming.");
        }
      };

      pc.onconnectionstatechange = () => {
        const camState = pc.connectionState;
        updateCameraStatus(newCamId, "pc_state_" + camState);
        if (camState === 'failed') {
          setError("Camera "+ (getCameraById(newCamId)?.name || newCamId) + " connection failed.");
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(parsedRawOffer.sdp));
      for (const candidate of (parsedRawOffer.iceCandidates || [])) {
        if (candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(e => console.warn("Ctrl: Error adding cam ICE: "+e));
        }
      }
      const localAnswer = await pc.createAnswer();
      await pc.setLocalDescription(localAnswer);
    } catch (err) {
      setError("Error processing camera " + (getCameraById(newCamId)?.name || newCamId) + " offer: " + err.toString());
      updateCameraStatus(newCamId, 'error_offer_processing');
    }
    setNewCamOfferInput('');
  };

  const handlePrepareOfferForMonitor = useCallback(async (monitorId) => {
    const monitor = getMonitorById(monitorId);
    if (!monitor) {
      setError("Monitor not found: " + monitorId);
      updateMonitorStatus(monitorId, 'error_not_found');
      return;
    }

    console.log(CTRL_LOG_PREFIX + "Preparing offer for monitor " + monitorId);
    setStatus("Preparing offer for " + monitor.name);
    setError('');
    setCurrentMonitorIdForOffer(monitorId);
    setExpandedMonitorJson(monitorId);
    updateMonitorStatus(monitorId, 'controller_preparing_offer');

    try {
      if (monitorPcRefs.current[monitorId]) monitorPcRefs.current[monitorId].close();
      const pc = new RTCPeerConnection({});
      monitorPcRefs.current[monitorId] = pc;
      const collectedIceCandidates = [];

      // Start with empty stream - camera can be selected later
      const emptyStream = createEmptyMediaStream();
      emptyStream.getTracks().forEach(track => pc.addTrack(track, emptyStream));

      pc.onicecandidate = event => {
        if (event.candidate) collectedIceCandidates.push(event.candidate.toJSON());
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          if (!pc.localDescription) {
            setError("Failed to generate offer for Monitor "+monitor.name+": No local desc.");
            updateMonitorStatus(monitorId, 'error_generating_offer');
            return;
          }
          const offerSdp = pc.localDescription.toJSON();
          const offerForMonitorJson = JSON.stringify({
            type: 'controller_offer_to_monitor',
            sdp: offerSdp,
            iceCandidates: collectedIceCandidates,
          }, null, 2);
          setOfferForMonitor(monitorId, offerForMonitorJson, collectedIceCandidates, offerSdp);
          updateMonitorStatus(monitorId, 'offer_ready_for_monitor');
          setStatus("Offer for " + monitor.name + " ready.");
        }
      };

      pc.onconnectionstatechange = () => {
        const monState = pc.connectionState;
        updateMonitorStatus(monitorId, "pc_state_"+monState);
        if (monState === 'failed') {
          setError("Monitor "+monitor.name+" connection failed.");
        } else if (monState === 'connected') {
          setStatus("Monitor " + monitor.name + " connected. Use camera selector to choose source.");
        }
      };

      const localOffer = await pc.createOffer();
      await pc.setLocalDescription(localOffer);

    } catch (err) {
      setError("Error preparing offer for " + monitor.name + ": " + err.toString());
      updateMonitorStatus(monitorId, 'error_offer_preparation');
    }
  }, [getMonitorById, setOfferForMonitor, updateMonitorStatus]);

  const handleAcceptAnswerFromMonitor = useCallback(async (monitorId) => {
    const monitor = getMonitorById(monitorId);
    if (!monitor || !answerFromMonitorInput) {
      setError("Monitor not found or answer input missing for " + monitorId);
      return;
    }

    const pc = monitorPcRefs.current[monitorId];
    if (!pc) {
      setError("No active PeerConnection for monitor " + monitor.name);
      return;
    }

    setStatus("Processing answer from " + monitor.name + "...");
    setError('');
    updateMonitorStatus(monitorId, 'controller_processing_answer');

    try {
      const answerPayload = JSON.parse(answerFromMonitorInput);
      if (!answerPayload || !answerPayload.sdp || answerPayload.sdp.type !== 'answer') {
        setError("Invalid answer structure from " + monitor.name);
        updateMonitorStatus(monitorId, 'error_invalid_answer');
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(answerPayload.sdp));
      for (const candidate of (answerPayload.iceCandidates || [])) {
        if (candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(e => console.warn("Ctrl: Error adding mon ICE: "+e));
        }
      }

      setMonitorAnswer(monitorId, answerFromMonitorInput, answerPayload.iceCandidates || [], answerPayload.sdp);
      updateMonitorStatus(monitorId, 'connected_to_controller');
      setStatus("Monitor " + monitor.name + " connected.");
      
    } catch (err) {
      setError("Error processing answer for " + monitor.name + ": " + err.toString());
      updateMonitorStatus(monitorId, 'error_processing_answer');
    }

    setAnswerFromMonitorInput('');
    setCurrentMonitorIdForAnswer(null);
  }, [answerFromMonitorInput, getMonitorById, setMonitorAnswer, updateMonitorStatus]);

  const handleAddNewMonitor = useCallback(() => {
    const newMonitorId = addMonitorPlaceholder();
    setStatus("New monitor placeholder added: " + (getMonitorById(newMonitorId)?.name || newMonitorId));
  }, [addMonitorPlaceholder, getMonitorById]);

  const selectedCameraStream = selectedCameraId ? cameraStreamRefs.current[selectedCameraId] : null;

  const copyToClipboard = (text, type) => {
    if (!text) {
      setError("No " + type + " text to copy.");
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => {
        setStatus(type + " copied to clipboard.");
        setTimeout(() => setStatus('Controller Idle'), 2000);
      })
      .catch(err => {
        setError("Failed to copy " + type + ": " + err.message);
      });
  };

  const renderCameraItem = (cam) => (
    <div key={cam.id} style={{
      ...commonStyles.deviceListItem,
      ...(selectedCameraId === cam.id && commonStyles.selectedDevice)
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold' }}>{cam.name}</span>
        <span style={{...commonStyles.statusBadge, backgroundColor: getStatusColor(cam.status) }}>{cam.status}</span>
      </div>
      <div style={commonStyles.smallId}>ID: {cam.id}</div>
      <div style={commonStyles.buttonGroup}>
        <button 
          onClick={() => selectCamera(cam.id)} 
          disabled={selectedCameraId === cam.id}
          style={{...commonStyles.button, ...( selectedCameraId === cam.id && commonStyles.buttonDisabled )}}
        >
          {selectedCameraId === cam.id ? 'Current Source' :
           (cam.status === 'connected_streaming' || cam.status === 'pc_state_connected' ? 'Select as Source' :
            (cam.status === 'track_received_no_stream' ? 'Stream Issue' : 'Not Streaming')
           )}
        </button>
        <button
          onClick={() => setExpandedCameraJson(expandedCameraJson === cam.id ? null : cam.id)}
          style={commonStyles.button}
        >
          {expandedCameraJson === cam.id ? 'Hide' : 'Show'} Answer
        </button>
      </div>
      {expandedCameraJson === cam.id && cam.answerJson && (
        <div style={{ marginTop: '10px'}}>
          <label htmlFor={`camAnswer-${cam.id}`} style={commonStyles.label}>Answer for {cam.name}:</label>
          <textarea
            id={`camAnswer-${cam.id}`}
            readOnly
            value={cam.answerJson}
            style={commonStyles.textarea}
          />
          <button
            onClick={() => copyToClipboard(cam.answerJson, "Camera Answer")}
            style={{...commonStyles.button, marginTop: '5px'}}
          >
            Copy Answer
          </button>
        </div>
      )}
    </div>
  );

  const renderMonitorItem = (mon) => {
    const currentCameraId = monitorSourceMap[mon.id];
    const isConnected = mon.status === 'connected_to_controller' || mon.status.startsWith('pc_state_connected');

    return (
      <div key={mon.id} style={{
        ...commonStyles.deviceListItem
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold' }}>{mon.name}</span>
          <span style={{...commonStyles.statusBadge, backgroundColor: getStatusColor(mon.status) }}>{mon.status}</span>
        </div>
        <div style={commonStyles.smallId}>ID: {mon.id}</div>

        {isConnected && (
          <div style={{ marginTop: '10px' }}>
            <label htmlFor={`camera-select-${mon.id}`} style={commonStyles.label}>Select Camera Source:</label>
            <select
              id={`camera-select-${mon.id}`}
              value={currentCameraId || ''}
              onChange={(e) => switchMonitorCamera(mon.id, e.target.value || null)}
              style={{
                ...commonStyles.button,
                backgroundColor: 'white',
                color: '#333',
                width: '100%',
                padding: '8px'
              }}
            >
              <option value="">No Signal</option>
              {cameras
                .filter(cam => cam.status === 'connected_streaming' || cam.status === 'pc_state_connected')
                .map(cam => (
                  <option key={cam.id} value={cam.id}>
                    {cam.name} {cam.status === 'connected_streaming' ? '(Streaming)' : '(Connected)'}
                  </option>
                ))
              }
            </select>
          </div>
        )}

        <div style={commonStyles.buttonGroup}>
          <button
            onClick={() => handlePrepareOfferForMonitor(mon.id)}
            disabled={mon.status === 'connected_to_controller' || mon.status?.includes('error')}
            style={{...commonStyles.button, ...(mon.status === 'connected_to_controller' || mon.status?.includes('error') && commonStyles.buttonDisabled)}}
          >
            {mon.status === 'connected_to_controller' ? 'Connected' : 'Prepare Offer'}
          </button>
          <button
            onClick={() => setExpandedMonitorJson(expandedMonitorJson === mon.id ? null : mon.id)}
            style={commonStyles.button}
          >
            {expandedMonitorJson === mon.id ? 'Hide' : 'Show'} Details
          </button>
        </div>
        
        {expandedMonitorJson === mon.id && (
          <div style={{marginTop: '10px', display: 'flex', flexDirection:'column', gap: '15px'}}>
            {mon.offerJsonFromController && (
              <div>
                <label htmlFor={`monOffer-${mon.id}`} style={commonStyles.label}>
                  Offer for {mon.name}: {currentCameraId ? `(from ${getCameraById(currentCameraId)?.name || 'selected camera'})` : '(No Signal)'}
                </label>
                <textarea
                  id={`monOffer-${mon.id}`}
                  readOnly
                  value={mon.offerJsonFromController}
                  style={commonStyles.textarea}
                />
                <button
                  onClick={() => copyToClipboard(mon.offerJsonFromController, "Offer for Monitor")}
                  style={{...commonStyles.button, marginTop: '5px'}}
                >
                  Copy Offer
                </button>
              </div>
            )}
            {mon.status !== 'connected_to_controller' && mon.offerJsonFromController && (
              <div>
                <label htmlFor={`monAnswer-${mon.id}`} style={commonStyles.label}>Paste Answer from {mon.name}:</label>
                <textarea
                  id={`monAnswer-${mon.id}`}
                  placeholder={`Paste Answer for ${mon.name}`}
                  value={currentMonitorIdForAnswer === mon.id ? answerFromMonitorInput : ''}
                  onChange={e => { setCurrentMonitorIdForAnswer(mon.id); setAnswerFromMonitorInput(e.target.value); }}
                  style={commonStyles.textarea}
                  disabled={currentMonitorIdForOffer !== mon.id && !mon.offerJsonFromController}
                />
                <button
                  onClick={() => handleAcceptAnswerFromMonitor(mon.id)}
                  disabled={currentMonitorIdForAnswer !== mon.id || !answerFromMonitorInput}
                  style={{...commonStyles.button, marginTop: '5px', ...((currentMonitorIdForAnswer !== mon.id || !answerFromMonitorInput) && commonStyles.buttonDisabled)}}
                >
                  Process Answer
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={commonStyles.pageContainer}>
      <header style={commonStyles.header}>
        <h1 style={commonStyles.title}>Controller Dashboard</h1>
        <p style={commonStyles.status}>Controller Status: {status}</p>
        {error && <p style={commonStyles.error}>Error: {error}</p>}
      </header>

      <div style={commonStyles.mainContentArea}>
        {selectedCameraId && selectedCameraStream && (
          <section style={commonStyles.card}>
            <h2 style={{...commonStyles.title, fontSize: '1.4em'}}>
              Live Preview: {cameras.find(c => c.id === selectedCameraId)?.name || 'Selected Camera'}
            </h2>
            <video
              id="selected-camera-video-preview"
              ref={el => { if (el && el.srcObject !== selectedCameraStream) el.srcObject = selectedCameraStream; }}
              autoPlay
              playsInline
              muted
              style={commonStyles.video}
            />
          </section>
        )}
        {!selectedCameraId && (
          <section style={commonStyles.card}>
            <p style={{textAlign: 'center', margin: '20px'}}>No camera selected for preview.</p>
          </section>
        )}

        <div style={commonStyles.deviceListContainer}>
          <div style={commonStyles.deviceColumn}>
            <section style={commonStyles.card}>
              <h2 style={{...commonStyles.title, fontSize: '1.4em'}}>Camera Management</h2>
              <label htmlFor="newCamOffer" style={commonStyles.label}>Register New Camera (Paste Offer):</label>
              <textarea
                id="newCamOffer"
                placeholder="Paste Camera's Offer JSON here"
                value={newCamOfferInput}
                onChange={e => setNewCamOfferInput(e.target.value)}
                style={commonStyles.textarea}
              />
              <button
                onClick={handleProcessNewCameraOffer}
                style={{...commonStyles.button, ...(!newCamOfferInput && commonStyles.buttonDisabled)}}
                disabled={!newCamOfferInput}
              >
                Process Camera Offer
              </button>
            </section>
            <section style={commonStyles.card}>
              <h3 style={{...commonStyles.title, fontSize: '1.2em'}}>Registered Cameras ({cameras.length})</h3>
              {cameras.length === 0 ? <p>No cameras registered.</p> : cameras.map(renderCameraItem)}
            </section>
          </div>

          <div style={commonStyles.deviceColumn}>
            <section style={commonStyles.card}>
              <h2 style={{...commonStyles.title, fontSize: '1.4em'}}>Monitor Management</h2>
              <button onClick={handleAddNewMonitor} style={commonStyles.button}>
                Add New Monitor
              </button>
            </section>
            <section style={commonStyles.card}>
              <h3 style={{...commonStyles.title, fontSize: '1.2em'}}>Registered Monitors ({monitors.length})</h3>
              {monitors.length === 0 ? <p>No monitors registered.</p> : monitors.map(renderMonitorItem)}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ControllerScreen;
