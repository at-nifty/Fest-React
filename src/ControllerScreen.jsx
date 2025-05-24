import React, { useState, useEffect, useRef, useCallback } from 'react';
import useStore from './store';

// Helper function to download JSON (can be moved to a utils.js file if not already)
const downloadJson = (data, filename) => {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const configuration = {}; // ENSURE NO STUN SERVER IS USED

function ControllerScreen() {
  const {
    monitors, addMonitor, updateMonitor,
    cameras, addCamera, updateCamera,
    // controllerGeneratedOfferForCamera, setControllerGeneratedOfferForCamera, // To be used later for direct controller-to-camera signaling
    // controllerGeneratedAnswerForMonitor, setControllerGeneratedAnswerForMonitor // To be used later for direct controller-to-monitor signaling
  } = useStore();

  const [selectedMonitorId, setSelectedMonitorId] = useState('');
  const [selectedCameraIdForMonitor, setSelectedCameraIdForMonitor] = useState('');
  
  // State to hold generated JSON for manual transfer
  const [jsonForMonitor, setJsonForMonitor] = useState(null);
  const [jsonForCamera, setJsonForCamera] = useState(null);
  const [isLoading, setIsLoading] = useState(false); // Generic loading state
  const [controllerError, setControllerError] = useState(null); // Errors specific to controller operations

  // peerConnectionsRef is not used in the simplified file-based flow
  // const peerConnectionsRef = useRef({}); 

  // useEffect for cleanup (if any complex state were managed by controller itself)
  // useEffect(() => {
  //   return () => {
  //   };
  // }, []);

  const handleFileUpload = useCallback(async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsLoading(true); setControllerError(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const fileContent = JSON.parse(e.target.result);
        if (type === 'monitor') {
          if (fileContent.type !== 'monitor-offer' || !fileContent.id || !fileContent.sdp || !fileContent.iceCandidates) {
            setControllerError('Invalid monitor file. Check type, id, sdp, iceCandidates.'); throw new Error('Invalid monitor file');
          }
          if (monitors.find(m => m.id === fileContent.id)) {
            setControllerError(`Monitor ID ${fileContent.id} already registered.`); throw new Error('Monitor already registered');
          }
          addMonitor({ 
            id: fileContent.id, name: fileContent.name || `Monitor ${fileContent.id.substring(0,8)}`,
            offerSdp: fileContent.sdp, offerIce: fileContent.iceCandidates,
            status: 'Registered'
          });
          alert(`Monitor ${fileContent.name || fileContent.id} registered.`);
        } else if (type === 'camera') {
          if (fileContent.type !== 'camera-offer' || !fileContent.id || !fileContent.sdp || !fileContent.iceCandidates) {
            setControllerError('Invalid camera file. Check type, id, sdp, iceCandidates.'); throw new Error('Invalid camera file');
          }
           if (cameras.find(c => c.id === fileContent.id)) {
            setControllerError(`Camera ID ${fileContent.id} already registered.`); throw new Error('Camera already registered');
          }
          addCamera({ 
            id: fileContent.id, name: fileContent.name || `Camera ${fileContent.id.substring(0,8)}`,
            offerSdp: fileContent.sdp, offerIce: fileContent.iceCandidates, status: 'Registered'
          });
          alert(`Camera ${fileContent.name || fileContent.id} registered.`);
        }
      } catch (error) {
        console.error(`Ctrl:Error processing ${type} file:`, error);
        if (!controllerError) setControllerError(`Failed to process ${type} file: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
        setControllerError("File reading failed.");
        setIsLoading(false);
    }
    reader.readAsText(file); event.target.value = null;
  }, [monitors, addMonitor, cameras, addCamera, controllerError]);

  // Step 1: Controller receives Camera's Offer (from camera registration) and Monitor's Offer (from monitor registration)
  // Step 2: User selects a camera for a monitor via UI
  // Step 3: Controller generates an ANSWER for the MONITOR (using Camera's offer as remote description)
  // Step 4: Controller generates an ANSWER for the CAMERA (using Monitor's offer as remote description)
  // This is a simplified P2P connection where Controller acts as a matchmaker, it doesn't stream media itself.
  // For this part, we create an Answer for the Monitor (to Camera's Offer) and an Answer for the Camera (to Monitor's Offer).
  // More accurately: Controller takes Monitor's Offer and Camera's Offer.
  // To connect Monitor M to Camera C:
  // 1. Controller tells Camera C to accept Monitor M's Offer and generate an Answer (for M).
  // 2. Controller tells Monitor M to accept Camera C's Offer and generate an Answer (for C).
  // This is still slightly off. The goal is one peer connection between a specific camera and a specific monitor.
  // The controller needs to take one's offer and the other's answer.

  // Let's use the flow: Monitor offers to connect. Camera answers.
  // 1. Monitor uploads its offer (monitor-offer.json). Controller stores it.
  // 2. Camera uploads its offer (camera-offer.json). Controller stores it.
  // 3. User assigns Camera X to Monitor Y.
  // 4. Controller takes Monitor Y's Offer.
  // 5. Controller creates a *new* PC for Camera X, sets Monitor Y's Offer as remote, creates an Answer.
  //    This answer is "For Monitor Y" to consume. (JSON 1 to give to Monitor Y)
  // 6. Controller takes Camera X's Offer.
  // 7. Controller creates a *new* PC for Monitor Y, sets Camera X's Offer as remote, creates an Answer.
  //    This answer is "For Camera X" to consume. (JSON 2 to give to Camera X)
  // This is making two separate connections. This isn't right for a single stream.

  // Corrected flow for Controller as Matchmaker (manual JSON transfer):
  // Monitor wants to see a camera. Monitor generates an OFFER (monitor-offer.json).
  // Camera has its video. Camera generates an OFFER (camera-offer.json).
  // To connect Monitor (M) to Camera (C):
  // Controller takes M's Offer and C's Offer.
  // It then needs to generate an ANSWER from C for M's Offer, and an ANSWER from M for C's Offer.
  // This means the controller itself acts as a temporary peer for both to generate these answers.

  const handleAssignCameraToMonitor = useCallback(async () => {
    if (!selectedMonitorId || !selectedCameraIdForMonitor) {
      alert('Please select both a monitor and a camera.'); return;
    }
    const monitor = monitors.find(m => m.id === selectedMonitorId);
    const camera = cameras.find(c => c.id === selectedCameraIdForMonitor);
    if (!monitor || !camera || !monitor.offerSdp || !camera.offerSdp) {
      setControllerError('Selected devices/offers not found or incomplete. Please ensure both selected devices are properly registered with their offer files.'); return;
    }
    setControllerError(null);
    setJsonForMonitor(null); setJsonForCamera(null); 
    updateMonitor(monitor.id, { status: `Preparing info for ${camera.name}...`, connectedCameraId: camera.id });
    updateCamera(camera.id, { status: `Preparing info for ${monitor.name}...` });

    const monitorDataPayload = { 
        id: camera.id, name: camera.name, sdp: camera.offerSdp, 
        iceCandidates: camera.offerIce, type: 'camera-offer' 
    };
    setJsonForMonitor({ 
        fileName: `FOR_MONITOR_${monitor.name.replace(/\s/g, '_')}_USE_CAM_OFFER.json`,
        data: monitorDataPayload
    });

    const cameraDataPayload = { 
        id: monitor.id, name: monitor.name, sdp: monitor.offerSdp, 
        iceCandidates: monitor.offerIce, type: 'monitor-offer'
    };
    setJsonForCamera({ 
        fileName: `FOR_CAMERA_${camera.name.replace(/\s/g, '_')}_USE_MON_OFFER.json`,
        data: cameraDataPayload
    });

    alert("Connection info prepared for manual download (for USB transfer).");
    updateMonitor(monitor.id, { status: `Info ready for ${camera.name}`, connectedCameraId: camera.id });
    updateCamera(camera.id, { status: `Info ready for ${monitor.name}` });
  }, [selectedMonitorId, selectedCameraIdForMonitor, monitors, cameras, updateMonitor, updateCamera]);

  // Helper to get status class
  const getStatusClass = (statusText) => {
    if (!statusText) return 'status-disconnected';
    const s = statusText.toLowerCase();
    if (s.includes('error')) return 'status-error';
    if (s.includes('connect') || s.includes('preparing') || s.includes('awaiting') || s.includes('info ready')) return 'status-connecting';
    if (s.includes('ready') || s.includes('active') || s.includes('registered')) return 'status-connected';
    return 'status-disconnected';
  };

  return (
    <div>
      <h1 className="screen-title">Controller Dashboard</h1>
      {controllerError && <div className="container error-box" style={{borderColor:'red', color:'red', backgroundColor:'#ffebee'}}><p><strong>Controller Error:</strong> {controllerError}</p></div>}
      {isLoading && <div className="container loading-box"><span className="spinner-border" role="status"></span> Processing...</div>}

      <div className="container">
        <h2>Register Devices</h2>
        <p className="info-text">Upload the 'offer' JSON file exported from a Camera or Monitor screen.</p>
        <div className="button-group">
            <label htmlFor="monitorFileController" className="button" style={{opacity: isLoading? 0.7:1}}>Register Monitor</label>
            <input type="file" id="monitorFileController" accept=".json,application/json" onChange={(e) => handleFileUpload(e, 'monitor')} style={{ display: 'none' }} disabled={isLoading} />
            <label htmlFor="cameraFileController" className="button" style={{opacity: isLoading? 0.7:1}}>Register Camera</label>
            <input type="file" id="cameraFileController" accept=".json,application/json" onChange={(e) => handleFileUpload(e, 'camera')} style={{ display: 'none' }} disabled={isLoading} />
        </div>
      </div>

      <div className="container">
        <h2>Registered Monitors ({monitors.length})</h2>
        {monitors.length === 0 && <p className="info-text">No monitors registered yet.</p>}
        <ul>
          {monitors.map(m => (
            <li key={m.id} className={`device-item ${selectedMonitorId === m.id ? 'selected-device' : ''}`} 
                onClick={() => !isLoading && setSelectedMonitorId(m.id)} 
                style={{cursor: isLoading? 'not-allowed' : 'pointer'}} >
              <div>
                <span className={`status-dot ${getStatusClass(m.status)}`}></span>
                <strong>{m.name || m.id}</strong> <span className="device-status-text">(Status: {m.status || 'N/A'})</span>
                {m.connectedCameraId && cameras.find(c=>c.id === m.connectedCameraId) && 
                  <span className="device-target-text"> - Target: {cameras.find(c=>c.id === m.connectedCameraId)?.name}</span>
                }
              </div>
              {selectedMonitorId === m.id && <span className="selected-indicator">✓ Selected</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="container">
        <h2>Registered Cameras ({cameras.length})</h2>
        {cameras.length === 0 && <p className="info-text">No cameras registered yet.</p>}
        <ul>
          {cameras.map(c => (
            <li key={c.id} className={`device-item ${selectedCameraIdForMonitor === c.id ? 'selected-device' : ''}`} 
                onClick={() => !isLoading && selectedMonitorId && setSelectedCameraIdForMonitor(c.id)} 
                style={{cursor: (isLoading || !selectedMonitorId) ? 'not-allowed' : 'pointer'}} >
                <div>
                    <span className={`status-dot ${getStatusClass(c.status)}`}></span>
                    <strong>{c.name || c.id}</strong> <span className="device-status-text">(Status: {c.status || 'N/A'})</span>
                </div>
                 {selectedMonitorId && selectedCameraIdForMonitor === c.id && <span className="selected-indicator">✓ To Assign</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="container">
        <h2>Assign Camera to Selected Monitor: {selectedMonitorId ? monitors.find(m=>m.id===selectedMonitorId)?.name : "(None Selected)"}</h2>
        {selectedMonitorId ? 
            (<div>
              <p className="info-text">Select a camera from the list above to assign to the selected monitor.</p>
              {/* Camera selection is now done by clicking on the camera list item */}
            </div>) : <p className="info-text">Select a monitor from the list above to enable camera assignment.</p> }
        <div className="button-group">
            <button onClick={handleAssignCameraToMonitor} disabled={isLoading || !selectedMonitorId || !selectedCameraIdForMonitor}>
                Prepare Connection Info Files
            </button>
        </div>
      </div>
       
      {(jsonForMonitor || jsonForCamera) && (
         <div className="container">
            <h3>Download Connection Info Files (for USB Transfer)</h3>
            {jsonForMonitor && selectedMonitorId && (
                <div className="download-section">
                    <p><strong>For Monitor: {monitors.find(m=>m.id === selectedMonitorId)?.name}</strong> (This is Camera's Offer)</p>
                    <div className="button-group">
                        <button onClick={() => downloadJson(jsonForMonitor.data, jsonForMonitor.fileName)} disabled={isLoading} className="button">Download File for Monitor</button>
                    </div>
                    <details><summary>View JSON</summary>
                        <pre>{JSON.stringify(jsonForMonitor.data, null, 2)}</pre>
                    </details>
                </div>
            )}
            {jsonForCamera && selectedCameraIdForMonitor && (
                 <div className="download-section">
                    <p><strong>For Camera: {cameras.find(c=>c.id === selectedCameraIdForMonitor)?.name}</strong> (This is Monitor's Offer)</p>
                     <div className="button-group">
                        <button onClick={() => downloadJson(jsonForCamera.data, jsonForCamera.fileName)} disabled={isLoading} className="button">Download File for Camera</button>
                    </div>
                     <details><summary>View JSON</summary>
                        <pre>{JSON.stringify(jsonForCamera.data, null, 2)}</pre>
                    </details>
                </div>
            )}
        </div>
      )}
    </div>
  );
}

export default ControllerScreen; 