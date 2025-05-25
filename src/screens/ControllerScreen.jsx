import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { saveConnectionState, loadConnectionState } from '../utils/connectionStorage';
import './ControllerScreen.css';

const CTRL_LOG_PREFIX = "[CtrlScreen]";

function ControllerScreen() {
  const {
    cameras, monitors,
    addCamera, setCameraAnswer, updateCameraStatus, getCameraById,
    removeCamera, removeMonitor,
    addMonitorPlaceholder,
    selectCamera, selectedCameraId, // Only used for preview now
    setOfferForMonitor, setMonitorAnswer, updateMonitorStatus, getMonitorById,
    initializeCameras, initializeMonitors // ストアに初期化関数があることを想定
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

  const [previewTab, setPreviewTab] = useState('cameras'); // 'cameras' or 'monitors'

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
      ctx.fillText('Connected, But No Signal', canvas.width / 2, canvas.height / 2);
    }
    const videoStream = canvas.captureStream(1);
    const [videoTrack] = videoStream.getVideoTracks();
    return new MediaStream([videoTrack]);
  };

  const switchMonitorCamera = useCallback(async (monitorId, cameraId) => {
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    const pc = monitorPcRefs.current[monitorId];
    if (!pc || !monitor.status.includes('connected')) {
      console.error(CTRL_LOG_PREFIX + " Cannot switch camera: Monitor not connected", monitorId);
      return;
    }

    try {
      const newStream = cameraId ? cameraStreamRefs.current[cameraId] : createEmptyMediaStream();
      if (!newStream) {
        console.error(CTRL_LOG_PREFIX + " Cannot switch camera: Stream not available", cameraId);
        return;
      }

      // Get only video tracks
      const videoTracks = newStream.getVideoTracks();
      if (videoTracks.length === 0) {
        console.error(CTRL_LOG_PREFIX + " No video tracks available in the stream");
        return;
      }

      // Find video sender
      const videoSender = pc.getSenders().find(sender => sender.track?.kind === 'video');
      if (!videoSender) {
        console.error(CTRL_LOG_PREFIX + " No video sender found in the peer connection");
        return;
      }

      // Replace only video track
      await videoSender.replaceTrack(videoTracks[0]);

      setMonitorSourceMap(prev => ({ ...prev, [monitorId]: cameraId }));
      setStatus(`Switched ${monitor.name} to ${cameraId ? getCameraById(cameraId)?.name || 'unknown camera' : 'No Signal'}`);
      console.log(CTRL_LOG_PREFIX + ` Successfully switched ${monitor.name} to ${cameraId ? 'camera ' + cameraId : 'No Signal'}`);
    } catch (err) {
      console.error(CTRL_LOG_PREFIX + " Error switching camera for monitor " + monitorId, err);
      setError(`Failed to switch camera for ${monitor.name}: ${err.message}`);
    }
  }, [getCameraById, getMonitorById, createEmptyMediaStream]);

  useEffect(() => {
    return () => {
      Object.values(cameraPcRefs.current).forEach(pc => pc?.close());
      Object.values(monitorPcRefs.current).forEach(pc => pc?.close());
      cameraPcRefs.current = {};
      monitorPcRefs.current = {};
      cameraStreamRefs.current = {};
    };
  }, []);

  // 接続状態を保存
  useEffect(() => {
    saveConnectionState({
      cameras,
      monitors,
      monitorSourceMap,
    });
  }, [cameras, monitors, monitorSourceMap]);

  // 初期化時に接続状態を復元
  useEffect(() => {
    const state = loadConnectionState();
    
    // カメラとモニターの状態を復元
    if (state.cameras.length > 0) {
      initializeCameras(state.cameras);
    }
    if (state.monitors.length > 0) {
      initializeMonitors(state.monitors);
    }
    
    // モニターとカメラの接続マップを復元
    setMonitorSourceMap(state.monitorSourceMap);

    // 各デバイスの接続を再確立
    state.cameras.forEach(async (cam) => {
      if (cam.status === 'connected_streaming' || cam.status === 'pc_state_connected') {
        try {
          const pc = new RTCPeerConnection({});
          cameraPcRefs.current[cam.id] = pc;
          
          // 接続の再確立処理
          if (cam.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(cam.sdp));
            for (const candidate of (cam.iceCandidates || [])) {
              if (candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate))
                  .catch(e => console.warn("Ctrl: Error adding restored cam ICE: " + e));
              }
            }
          }
        } catch (err) {
          console.error(CTRL_LOG_PREFIX + " Error restoring camera connection:", err);
          updateCameraStatus(cam.id, 'error_connection_restore');
        }
      }
    });

    state.monitors.forEach(async (mon) => {
      if (mon.status === 'connected_to_controller' || mon.status.includes('pc_state_connected')) {
        try {
          const pc = new RTCPeerConnection({});
          monitorPcRefs.current[mon.id] = pc;
          
          // 接続の再確立処理
          if (mon.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(mon.sdp));
            for (const candidate of (mon.iceCandidates || [])) {
              if (candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate))
                  .catch(e => console.warn("Ctrl: Error adding restored mon ICE: " + e));
              }
            }
          }

          // まずNo Signal画面を設定
          await switchMonitorCamera(mon.id, null);
          setStatus(`Monitor ${mon.name} restored. No Signal screen is set.`);

          // 保存されていたカメラソースがあれば、それを後から接続
          const sourceId = state.monitorSourceMap[mon.id];
          if (sourceId && state.cameras.find(cam => cam.id === sourceId)) {
            setTimeout(async () => {
              await switchMonitorCamera(mon.id, sourceId);
              setStatus(`Monitor ${mon.name} restored with camera source.`);
            }, 1000); // 1秒後にカメラソースを接続
          }
        } catch (err) {
          console.error(CTRL_LOG_PREFIX + " Error restoring monitor connection:", err);
          updateMonitorStatus(mon.id, 'error_connection_restore');
        }
      }
    });
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
      const pc = new RTCPeerConnection({
        offerToReceiveAudio: false,
        offerToReceiveVideo: true
      });
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
        if (event.track.kind !== 'video') return; // Only handle video tracks
        const stream = new MediaStream([event.track]);
        cameraStreamRefs.current[newCamId] = stream;
        updateCameraStatus(newCamId, 'connected_streaming');
        setStatus("Camera " + (getCameraById(newCamId)?.name || newCamId) + " connected and streaming.");
      };

      pc.onconnectionstatechange = () => {
        const camState = pc.connectionState;
        updateCameraStatus(newCamId, "pc_state_" + camState);
        if (camState === 'failed') {
          setError("Camera " + (getCameraById(newCamId)?.name || newCamId) + " connection failed.");
        }
      };

      // Modify the SDP to only accept video tracks and remove BUNDLE audio
      const modifiedOffer = {
        ...parsedRawOffer.sdp,
        sdp: parsedRawOffer.sdp.sdp
          .replace(/m=audio.*\r\n(?:.*\r\n)*?(?=m=|$)/g, '')
          .replace(/a=group:BUNDLE audio video/g, 'a=group:BUNDLE video')
      };

      await pc.setRemoteDescription(new RTCSessionDescription(modifiedOffer));
      for (const candidate of (parsedRawOffer.iceCandidates || [])) {
        if (candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(e => console.warn("Ctrl: Error adding cam ICE: " + e));
        }
      }
      const localAnswer = await pc.createAnswer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: true
      });
      
      // Modify the answer to only include video and remove BUNDLE audio
      localAnswer.sdp = localAnswer.sdp
        .replace(/m=audio.*\r\n(?:.*\r\n)*?(?=m=|$)/g, '')
        .replace(/a=group:BUNDLE audio video/g, 'a=group:BUNDLE video');
      
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
      const pc = new RTCPeerConnection({
        offerToReceiveAudio: false,
        offerToReceiveVideo: true
      });
      monitorPcRefs.current[monitorId] = pc;
      const collectedIceCandidates = [];

      // Start with empty stream - camera can be selected later
      const emptyStream = createEmptyMediaStream();
      const videoTrack = emptyStream.getVideoTracks()[0];
      if (videoTrack) {
        pc.addTrack(videoTrack, emptyStream);
      }

      pc.onicecandidate = event => {
        if (event.candidate) collectedIceCandidates.push(event.candidate.toJSON());
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          if (!pc.localDescription) {
            setError("Failed to generate offer for Monitor " + monitor.name + ": No local desc.");
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
        updateMonitorStatus(monitorId, "pc_state_" + monState);
        if (monState === 'failed') {
          setError("Monitor " + monitor.name + " connection failed.");
        } else if (monState === 'connected') {
          setStatus("Monitor " + monitor.name + " connected. Use camera selector to choose source.");
        }
      };

      const localOffer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: true
      });
      
      // Modify the offer to only include video and remove BUNDLE audio
      localOffer.sdp = localOffer.sdp
        .replace(/m=audio.*\r\n(?:.*\r\n)*?(?=m=|$)/g, '')
        .replace(/a=group:BUNDLE audio video/g, 'a=group:BUNDLE video');
      
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

      // Modify the answer to only include video
      const modifiedAnswer = {
        ...answerPayload.sdp,
        sdp: answerPayload.sdp.sdp.replace(/m=audio.*\r\n(?:.*\r\n)*?(?=m=|$)/g, '')
      };

      await pc.setRemoteDescription(new RTCSessionDescription(modifiedAnswer));
      for (const candidate of (answerPayload.iceCandidates || [])) {
        if (candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(e => console.warn("Ctrl: Error adding mon ICE: " + e));
        }
      }

      setMonitorAnswer(monitorId, answerFromMonitorInput, answerPayload.iceCandidates || [], answerPayload.sdp);
      updateMonitorStatus(monitorId, 'connected_to_controller');
      
      // 接続が成功したら、自動的にNo Signal画面を設定
      await switchMonitorCamera(monitorId, null);
      setStatus("Monitor " + monitor.name + " connected. No Signal screen is set.");

    } catch (err) {
      console.error(CTRL_LOG_PREFIX + " Error processing answer for monitor " + monitorId, err);
      setError(`Failed to process answer for ${monitor.name}: ${err.message}`);
    }

    setAnswerFromMonitorInput('');
    setCurrentMonitorIdForAnswer(null);
  }, [answerFromMonitorInput, getMonitorById, setMonitorAnswer, updateMonitorStatus, switchMonitorCamera]);

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

  const handleRemoveCamera = useCallback(async (cameraId) => {
    const camera = getCameraById(cameraId);
    if (!camera) return;

    // WebRTC接続を閉じる
    if (cameraPcRefs.current[cameraId]) {
      cameraPcRefs.current[cameraId].close();
      delete cameraPcRefs.current[cameraId];
    }

    // ストリームを停止
    if (cameraStreamRefs.current[cameraId]) {
      cameraStreamRefs.current[cameraId].getTracks().forEach(track => track.stop());
      delete cameraStreamRefs.current[cameraId];
    }

    // ストアから削除
    removeCamera(cameraId);
    setStatus(`Camera ${camera.name} has been removed.`);
  }, [getCameraById, removeCamera]);

  const handleRemoveMonitor = useCallback(async (monitorId) => {
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    // WebRTC接続を閉じる
    if (monitorPcRefs.current[monitorId]) {
      monitorPcRefs.current[monitorId].close();
      delete monitorPcRefs.current[monitorId];
    }

    // モニターソースマップから削除
    setMonitorSourceMap(prev => {
      const newMap = { ...prev };
      delete newMap[monitorId];
      return newMap;
    });

    // ストアから削除
    removeMonitor(monitorId);
    setStatus(`Monitor ${monitor.name} has been removed.`);
  }, [getMonitorById, removeMonitor]);

  const renderCameraItem = (cam) => (
    <div key={cam.id} className={`device-list-item ${selectedCameraId === cam.id ? 'selected-device' : ''}`}>
      <div className="device-header">
        <span className="device-name">{cam.name}</span>
        <span className="status-badge" data-status={cam.status}>{cam.status}</span>
      </div>
      <div className="small-id">ID: {cam.id}</div>
      <div className="button-group">
        <button
          onClick={() => selectCamera(cam.id)}
          disabled={selectedCameraId === cam.id}
          className={`button ${selectedCameraId === cam.id ? 'button-disabled' : ''}`}
        >
          {selectedCameraId === cam.id ? 'Current Source' :
            (cam.status === 'connected_streaming' || cam.status === 'pc_state_connected' ? 'Select as Source' :
              (cam.status === 'track_received_no_stream' ? 'Stream Issue' : 'Not Streaming')
            )}
        </button>
        <button
          onClick={() => setExpandedCameraJson(expandedCameraJson === cam.id ? null : cam.id)}
          className="button"
        >
          {expandedCameraJson === cam.id ? 'Hide' : 'Show'} Answer
        </button>
        <button
          onClick={() => handleRemoveCamera(cam.id)}
          className="button button-danger"
        >
          Remove Camera
        </button>
      </div>
      {expandedCameraJson === cam.id && cam.answerJson && (
        <div className="expanded-content">
          <label htmlFor={`camAnswer-${cam.id}`} className="label">Answer for {cam.name}:</label>
          <textarea
            id={`camAnswer-${cam.id}`}
            readOnly
            value={cam.answerJson}
            className="textarea"
          />
          <button
            onClick={() => copyToClipboard(cam.answerJson, "Camera Answer")}
            className="button"
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
      <div key={mon.id} className="device-list-item">
        <div className="device-header">
          <span className="device-name">{mon.name}</span>
          <span className="status-badge" data-status={mon.status}>{mon.status}</span>
        </div>
        <div className="small-id">ID: {mon.id}</div>

        {isConnected && (
          <div className="expanded-content">
            <label htmlFor={`camera-select-${mon.id}`} className="label">Select Camera Source:</label>
            <select
              id={`camera-select-${mon.id}`}
              value={currentCameraId || ''}
              onChange={(e) => switchMonitorCamera(mon.id, e.target.value || null)}
              className="camera-source-select button"
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

        <div className="button-group">
          <button
            onClick={() => handlePrepareOfferForMonitor(mon.id)}
            disabled={mon.status === 'connected_to_controller' || mon.status?.includes('error')}
            className={`button ${mon.status === 'connected_to_controller' || mon.status?.includes('error') ? 'button-disabled' : ''}`}
          >
            {mon.status === 'connected_to_controller' ? 'Connected' : 'Prepare Offer'}
          </button>
          <button
            onClick={() => setExpandedMonitorJson(expandedMonitorJson === mon.id ? null : mon.id)}
            className="button"
          >
            {expandedMonitorJson === mon.id ? 'Hide' : 'Show'} Details
          </button>
          <button
            onClick={() => handleRemoveMonitor(mon.id)}
            className="button button-danger"
          >
            Remove Monitor
          </button>
        </div>
        
        {expandedMonitorJson === mon.id && (
          <div className="expanded-content">
            {mon.offerJsonFromController && (
              <div>
                <label htmlFor={`monOffer-${mon.id}`} className="label">
                  Offer for {mon.name}: {currentCameraId ? `(from ${getCameraById(currentCameraId)?.name || 'selected camera'})` : '(No Signal)'}
                </label>
                <textarea
                  id={`monOffer-${mon.id}`}
                  readOnly
                  value={mon.offerJsonFromController}
                  className="textarea"
                />
                <button
                  onClick={() => copyToClipboard(mon.offerJsonFromController, "Offer for Monitor")}
                  className="button"
                >
                  Copy Offer
                </button>
              </div>
            )}
            {mon.status !== 'connected_to_controller' && mon.offerJsonFromController && (
              <div>
                <label htmlFor={`monAnswer-${mon.id}`} className="label">Paste Answer from {mon.name}:</label>
                <textarea
                  id={`monAnswer-${mon.id}`}
                  placeholder={`Paste Answer for ${mon.name}`}
                  value={currentMonitorIdForAnswer === mon.id ? answerFromMonitorInput : ''}
                  onChange={e => { setCurrentMonitorIdForAnswer(mon.id); setAnswerFromMonitorInput(e.target.value); }}
                  className="textarea"
                  disabled={currentMonitorIdForOffer !== mon.id && !mon.offerJsonFromController}
                />
                <button
                  onClick={() => handleAcceptAnswerFromMonitor(mon.id)}
                  disabled={currentMonitorIdForAnswer !== mon.id || !answerFromMonitorInput}
                  className={`button ${(currentMonitorIdForAnswer !== mon.id || !answerFromMonitorInput) ? 'button-disabled' : ''}`}
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
    <div className="page-container">
      <header className="header">
        <h1 className="title">Controller Dashboard</h1>
        <p className="status">Controller Status: {status}</p>
        {error && <p className="error">Error: {error}</p>}
      </header>

      <div className="main-content-area">
        <section className="card">
          <div className="preview-tabs">
            <button 
              className={`tab-button ${previewTab === 'cameras' ? 'active' : ''}`}
              onClick={() => setPreviewTab('cameras')}
            >
              Camera Previews
            </button>
            <button 
              className={`tab-button ${previewTab === 'monitors' ? 'active' : ''}`}
              onClick={() => setPreviewTab('monitors')}
            >
              Monitor Previews
            </button>
          </div>

          {previewTab === 'cameras' && (
            <div className="video-grid">
              {cameras
                .filter(cam => cam.status === 'connected_streaming' || cam.status === 'pc_state_connected')
                .map(cam => (
                  <div key={cam.id} className="video-container">
                    <h3 className="video-title">{cam.name}</h3>
                    <video
                      id={`camera-preview-${cam.id}`}
                      ref={element => {
                        if (element && cameraStreamRefs.current[cam.id]) {
                          element.srcObject = cameraStreamRefs.current[cam.id];
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="video"
                    />
                    <span className="status-badge" data-status={cam.status}>{cam.status}</span>
                  </div>
                ))}
              {cameras.filter(cam => cam.status === 'connected_streaming' || cam.status === 'pc_state_connected').length === 0 && (
                <p className="preview-message">No cameras connected for preview.</p>
              )}
            </div>
          )}

          {previewTab === 'monitors' && (
            <div className="video-grid">
              {monitors
                .filter(mon => mon.status === 'connected_to_controller' || mon.status.startsWith('pc_state_connected'))
                .map(mon => {
                  const currentCameraId = monitorSourceMap[mon.id];
                  const currentCamera = currentCameraId ? getCameraById(currentCameraId) : null;
                  
                  return (
                    <div key={mon.id} className="video-container">
                      <h3 className="video-title">{mon.name}</h3>
                      <video
                        id={`monitor-preview-${mon.id}`}
                        ref={element => {
                          if (element && monitorPcRefs.current[mon.id]) {
                            const sender = monitorPcRefs.current[mon.id].getSenders().find(s => s.track?.kind === 'video');
                            if (sender && sender.track) {
                              const stream = new MediaStream([sender.track]);
                              element.srcObject = stream;
                            }
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="video"
                      />
                      <div className="video-info">
                        <span className="status-badge" data-status={mon.status}>{mon.status}</span>
                        <select
                          value={currentCameraId || ''}
                          onChange={(e) => switchMonitorCamera(mon.id, e.target.value || null)}
                          className="camera-source-select-compact"
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
                    </div>
                  );
                })}
              {monitors.filter(mon => mon.status === 'connected_to_controller' || mon.status.startsWith('pc_state_connected')).length === 0 && (
                <p className="preview-message">No monitors connected for preview.</p>
              )}
            </div>
          )}
        </section>

        <div className="device-list-container">
          <div className="device-column">
            <section className="card">
              <h2 className="title title-section">Camera Management</h2>
              <label htmlFor="newCamOffer" className="label">Register New Camera (Paste Offer):</label>
              <textarea
                id="newCamOffer"
                placeholder="Paste Camera's Offer JSON here"
                value={newCamOfferInput}
                onChange={e => setNewCamOfferInput(e.target.value)}
                className="textarea"
              />
              <button
                onClick={handleProcessNewCameraOffer}
                className={`button ${!newCamOfferInput ? 'button-disabled' : ''}`}
                disabled={!newCamOfferInput}
              >
                Process Camera Offer
              </button>
            </section>
            <section className="card">
              <h3 className="title title-subsection">Registered Cameras ({cameras.length})</h3>
              {cameras.length === 0 ? <p>No cameras registered.</p> : cameras.map(renderCameraItem)}
            </section>
          </div>

          <div className="device-column">
            <section className="card">
              <h2 className="title title-section">Monitor Management</h2>
              <button onClick={handleAddNewMonitor} className="button">
                Add New Monitor
              </button>
            </section>
            <section className="card">
              <h3 className="title title-subsection">Registered Monitors ({monitors.length})</h3>
              {monitors.length === 0 ? <p>No monitors registered.</p> : monitors.map(renderMonitorItem)}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ControllerScreen;
