import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';

const CTRL_LOG_PREFIX = "[CtrlScreen]";

// Keep existing commonStyles but add new styles for tabs and operation view
const commonStyles = {
  // ... (keep existing styles)
  
  // Add new styles
  tabContainer: {
    display: 'flex',
    gap: '2px',
    backgroundColor: '#e0e0e0',
    padding: '2px',
    borderRadius: '8px',
    marginBottom: '20px'
  },
  tab: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#f0f0f0',
    color: '#666',
    flex: 1,
    textAlign: 'center',
    transition: 'all 0.2s ease'
  },
  activeTab: {
    backgroundColor: '#fff',
    color: '#007bff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  previewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '15px',
    padding: '15px'
  },
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    cursor: 'pointer',
    transition: 'transform 0.2s ease',
    position: 'relative'
  },
  previewVideo: {
    width: '100%',
    aspectRatio: '16/9',
    backgroundColor: '#000',
    objectFit: 'cover'
  },
  previewLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '8px',
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#fff',
    fontSize: '0.9em'
  },
  previewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,128,255,0.3)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 'bold'
  },
  monitorPanel: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '15px'
  },
  monitorTitle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  },
  currentSource: {
    fontSize: '0.9em',
    color: '#666',
    fontStyle: 'italic'
  }
};

function ControllerScreen() {
  // Keep existing state and refs
  const [activeTab, setActiveTab] = useState('connection'); // 'connection' or 'operation'
  
  // ... (keep other existing state declarations)

  // Tabs component
  const renderTabs = () => (
    <div style={commonStyles.tabContainer}>
      <button 
        style={{
          ...commonStyles.tab,
          ...(activeTab === 'connection' && commonStyles.activeTab)
        }}
        onClick={() => setActiveTab('connection')}
      >
        Connection Setup
      </button>
      <button 
        style={{
          ...commonStyles.tab,
          ...(activeTab === 'operation' && commonStyles.activeTab)
        }}
        onClick={() => setActiveTab('operation')}
        disabled={!monitors.some(m => m.status === 'connected_to_controller')}
      >
        Operation Mode
      </button>
    </div>
  );

  // Operation view - OBS-like interface
  const renderOperationView = () => {
    const connectedMonitors = monitors.filter(m => 
      m.status === 'connected_to_controller' || m.status.startsWith('pc_state_connected')
    );

    return (
      <>
        {connectedMonitors.map(monitor => (
          <div key={monitor.id} style={commonStyles.monitorPanel}>
            <div style={commonStyles.monitorTitle}>
              <h3>{monitor.name}</h3>
              <span style={commonStyles.currentSource}>
                Source: {monitorSourceMap[monitor.id] ? 
                  getCameraById(monitorSourceMap[monitor.id])?.name || 'Unknown' : 
                  'No Signal'}
              </span>
            </div>
            <div style={commonStyles.previewGrid}>
              {/* No Signal preview */}
              <div 
                style={commonStyles.previewCard}
                onClick={() => switchMonitorCamera(monitor.id, null)}
              >
                <canvas 
                  width="320" 
                  height="180" 
                  style={commonStyles.previewVideo}
                  ref={el => {
                    if (el) {
                      const ctx = el.getContext('2d');
                      if (ctx) {
                        ctx.fillStyle = 'black';
                        ctx.fillRect(0, 0, el.width, el.height);
                        ctx.fillStyle = 'white';
                        ctx.font = '16px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText('No Signal', el.width/2, el.height/2);
                      }
                    }
                  }}
                />
                <div style={commonStyles.previewLabel}>
                  No Signal
                </div>
                {!monitorSourceMap[monitor.id] && (
                  <div style={{...commonStyles.previewOverlay, display: 'flex'}}>
                    ✓ ACTIVE
                  </div>
                )}
              </div>

              {/* Camera previews */}
              {cameras
                .filter(cam => cam.status === 'connected_streaming' || cam.status === 'pc_state_connected')
                .map(camera => {
                  const stream = cameraStreamRefs.current[camera.id];
                  const isActive = monitorSourceMap[monitor.id] === camera.id;

                  return (
                    <div 
                      key={camera.id}
                      style={commonStyles.previewCard}
                      onClick={() => switchMonitorCamera(monitor.id, camera.id)}
                    >
                      <video
                        ref={el => {
                          if (el && el.srcObject !== stream) {
                            el.srcObject = stream;
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        style={commonStyles.previewVideo}
                      />
                      <div style={commonStyles.previewLabel}>
                        {camera.name}
                      </div>
                      {isActive && (
                        <div style={{...commonStyles.previewOverlay, display: 'flex'}}>
                          ✓ ACTIVE
                        </div>
                      )}
                    </div>
                  );
                })
              }
            </div>
          </div>
        ))}
      </>
    );
  };

  // Keep existing utility functions and handlers...

  return (
    <div style={commonStyles.pageContainer}>
      <header style={commonStyles.header}>
        <h1 style={commonStyles.title}>Controller Dashboard</h1>
        <p style={commonStyles.status}>Controller Status: {status}</p>
        {error && <p style={commonStyles.error}>Error: {error}</p>}
      </header>

      <div style={commonStyles.mainContentArea}>
        {renderTabs()}

        {activeTab === 'operation' ? (
          renderOperationView()
        ) : (
          <>
            {/* Existing connection view */}
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
