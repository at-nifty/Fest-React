import React, { useState, useEffect, useRef, useCallback } from 'react';
import useStore, { generateId } from './store'; // generateId might not be needed if IDs come from devices

const configuration = {}; // ENSURE NO STUN SERVER IS USED

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

function ControllerScreen() {
  // Structure: { [id]: { id, name, pc, stream (for camera), offerSdp, offerIce, answerSdp, answerIce, status, assignedCameraId (for monitor) } }
  const [cameras, setCameras] = useState({}); 
  const [monitors, setMonitors] = useState({});

  const [isLoading, setIsLoading] = useState(false);
  const [controllerError, setControllerError] = useState(null);

  const cameraPreviewVideoRefs = useRef({});
  // For monitor PCs, to store senders for replaceTrack
  const monitorSendersRef = useRef({}); // { [monitorId]: { video: RTCRtpSender, audio: RTCRtpSender } }

  useEffect(() => {
    const camPcsToClose = Object.values(cameras).map(cam => cam.pc).filter(pc => pc);
    const monPcsToClose = Object.values(monitors).map(mon => mon.pc).filter(pc => pc);
    return () => {
      camPcsToClose.forEach(pc => pc.close());
      monPcsToClose.forEach(pc => pc.close());
    };
  }, [cameras, monitors]);

  const updateCameraStatus = (cameraId, status, error = null) => {
    setCameras(prev => ({
        ...prev,
        [cameraId]: { ...(prev[cameraId] || {id: cameraId, name: `Cam-${cameraId.substring(0,4)}`}), status, error }
    }));
  };
  const updateMonitorStatus = (monitorId, status, error = null, assignedCameraId = undefined) => {
    setMonitors(prev => ({
        ...prev,
        [monitorId]: {
            ...(prev[monitorId] || {id: monitorId, name: `Mon-${monitorId.substring(0,4)}`}), 
            status, 
            error,
            assignedCameraId: assignedCameraId !== undefined ? assignedCameraId : prev[monitorId]?.assignedCameraId
        }
    }));
  };

  // CAMERA REGISTRATION (Controller receives Offer, sends Answer)
  const handleCameraOfferUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsLoading(true); setControllerError(null);
    let newCameraId = null;
    try {
      const offerInfo = JSON.parse(await file.text());
      if (offerInfo.type !== 'camera-offer-to-controller' || !offerInfo.id || !offerInfo.sdp) {
        throw new Error('Invalid camera offer file format.');
      }
      newCameraId = offerInfo.id;
      if (cameras[newCameraId]?.pc) cameras[newCameraId].pc.close();

      updateCameraStatus(newCameraId, `Processing offer from ${offerInfo.name || newCameraId}...`);
      const pc = new RTCPeerConnection(configuration);
      const localIceCandidates = [];
      pc.onicecandidate = e => e.candidate && localIceCandidates.push(e.candidate);
      pc.ontrack = (e) => {
        if (e.streams && e.streams[0]) {
          setCameras(prev => ({
            ...prev, [newCameraId]: { ...prev[newCameraId], stream: e.streams[0], status: 'Streaming to Controller' }
          }));
          if (cameraPreviewVideoRefs.current[newCameraId]) cameraPreviewVideoRefs.current[newCameraId].srcObject = e.streams[0];
        }
      };
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          if (pc.localDescription?.type === 'answer') {
            setCameras(prev => ({
              ...prev, [newCameraId]: { 
                ...prev[newCameraId], id: newCameraId, name: offerInfo.name || `Cam-${newCameraId.substring(0,4)}`,
                pc, offerSdp: offerInfo.sdp, offerIce: offerInfo.iceCandidates || [],
                answerSdp: pc.localDescription, answerIce: localIceCandidates,
                status: 'Answer prepared for camera. Download & send.'
              }
            }));
          } else throw new Error('Failed to generate answer for camera.');
          setIsLoading(false);
        }
      };
      pc.onconnectionstatechange = () => updateCameraStatus(newCameraId, `Connection: ${pc.connectionState}`);

      await pc.setRemoteDescription(new RTCSessionDescription(offerInfo.sdp));
      (offerInfo.iceCandidates || []).forEach(c => {if(c) pc.addIceCandidate(new RTCIceCandidate(c)).catch(err => console.warn("Ctrl: Error adding ICE from cam offer:", err))});
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
    } catch (error) {
      console.error("Ctrl: CamOfferUpload err:", error);
      setControllerError(`Cam offer err: ${error.message}`);
      if(newCameraId) updateCameraStatus(newCameraId, `Error: ${error.message}`, true);
      setIsLoading(false);
    }
    event.target.value = null;
  }, [cameras]);

  const handleDownloadAnswerForCamera = useCallback((cameraId) => {
    const cam = cameras[cameraId];
    if (!cam?.answerSdp) { alert("Answer for camera not ready."); return; }
    downloadJson({
      type: 'controller-answer-to-camera', sdp: cam.answerSdp, iceCandidates: cam.answerIce || []
    }, `CTRL_Answer_For_CAM_${cam.name.replace(/\s/g, '_')}.json`);
    updateCameraStatus(cameraId, "Controller answer downloaded.");
  }, [cameras]);

  // MONITOR REGISTRATION & STREAM ROUTING
  const handleMonitorOfferUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsLoading(true); setControllerError(null);
    let newMonitorId = null;
    try {
      const offerInfo = JSON.parse(await file.text());
      if (offerInfo.type !== 'monitor-offer-to-controller' || !offerInfo.id || !offerInfo.sdp) {
        throw new Error('Invalid monitor offer file format.');
      }
      newMonitorId = offerInfo.id;
      if (monitors[newMonitorId]?.pc) monitors[newMonitorId].pc.close();

      updateMonitorStatus(newMonitorId, `Processing offer from ${offerInfo.name || newMonitorId}...`);
      const pc = new RTCPeerConnection(configuration);
      const localIceCandidates = [];
      pc.onicecandidate = e => e.candidate && localIceCandidates.push(e.candidate);
      
      // Setup senders for video and audio tracks that will be added/replaced later
      // Add transceivers if you expect to send. The direction will be updated by SDP.
      // For sending to monitor, controller originates tracks.
      const videoSender = pc.addTrack(createEmptyVideoTrack(), new MediaStream()); 
      const audioSender = pc.addTrack(createEmptyAudioTrack(), new MediaStream());
      monitorSendersRef.current[newMonitorId] = { video: videoSender, audio: audioSender };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          if (pc.localDescription?.type === 'answer') {
            setMonitors(prev => ({
              ...prev, [newMonitorId]: {
                ...prev[newMonitorId], id: newMonitorId, name: offerInfo.name || `Mon-${newMonitorId.substring(0,4)}`,
                pc, offerSdp: offerInfo.sdp, offerIce: offerInfo.iceCandidates || [],
                answerSdp: pc.localDescription, answerIce: localIceCandidates,
                status: 'Answer prepared for monitor. Waiting for camera assignment.', assignedCameraId: null
              }
            }));
          } else throw new Error('Failed to generate answer for monitor.');
          setIsLoading(false);
        }
      };
      pc.onconnectionstatechange = () => updateMonitorStatus(newMonitorId, `Connection: ${pc.connectionState}`);

      await pc.setRemoteDescription(new RTCSessionDescription(offerInfo.sdp));
      (offerInfo.iceCandidates || []).forEach(c => {if(c) pc.addIceCandidate(new RTCIceCandidate(c)).catch(err => console.warn("Ctrl: Error adding ICE from mon offer:", err))});
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
    } catch (error) {
      console.error("Ctrl: MonOfferUpload err:", error);
      setControllerError(`Mon offer err: ${error.message}`);
      if(newMonitorId) updateMonitorStatus(newMonitorId, `Error: ${error.message}`, true);
      setIsLoading(false);
    }
    event.target.value = null;
  }, [monitors]);

  const handleDownloadAnswerForMonitor = useCallback((monitorId) => {
    const mon = monitors[monitorId];
    if (!mon?.answerSdp) { alert("Answer for monitor not ready."); return; }
    downloadJson({
      type: 'controller-answer-to-monitor', sdp: mon.answerSdp, iceCandidates: mon.answerIce || []
    }, `CTRL_Answer_For_MON_${mon.name.replace(/\s/g, '_')}.json`);
    updateMonitorStatus(monitorId, "Controller answer downloaded.");
  }, [monitors]);

  const handleAssignCameraToMonitor = useCallback(async (monitorId, targetCameraId) => {
    const monitor = monitors[monitorId];
    const camera = cameras[targetCameraId];

    if (!monitor?.pc) {
      setControllerError(`Monitor ${monitor?.name || monitorId} has no active PeerConnection object.`);
      updateMonitorStatus(monitorId, "Error: Monitor PC not initialized", true, monitor?.assignedCameraId);
      return;
    }
    if (monitor.pc.connectionState !== 'connected') {
      setControllerError(`Cannot assign stream: Connection to Monitor ${monitor.name || monitorId} is not 'connected' (state: ${monitor.pc.connectionState}). Please ensure monitor is fully connected to controller.`);
      updateMonitorStatus(monitorId, `Error: Not connected (state: ${monitor.pc.connectionState})`, true, monitor.assignedCameraId);
      return;
    }
    if (!camera?.stream) {
      setControllerError(`Camera ${camera?.name || targetCameraId} is not ready or its stream is unavailable.`);
      updateMonitorStatus(monitorId, "Error: Camera/stream for assignment missing", true, monitor.assignedCameraId);
      return;
    }

    setControllerError(null);
    updateMonitorStatus(monitorId, `Assigning ${camera.name} to ${monitor.name}...`, false, targetCameraId);

    try {
      const videoTrack = camera.stream.getVideoTracks()[0];
      const audioTrack = camera.stream.getAudioTracks()[0];
      const senders = monitorSendersRef.current[monitorId];

      if (!senders || !senders.video || !senders.audio) {
          throw new Error("RTCRtpSenders for the monitor are not properly initialized.");
      }

      if (videoTrack) {
        await senders.video.replaceTrack(videoTrack);
        console.log(`Ctrl: Replaced video track for monitor ${monitorId} with track from camera ${targetCameraId}`);
      } else {
        console.warn(`Ctrl: No video track on camera ${targetCameraId}. Sending empty/previous to monitor ${monitorId}.`);
        await senders.video.replaceTrack(null); // Send null to stop video or send an empty track if preferred
      }
      
      if (audioTrack) {
        await senders.audio.replaceTrack(audioTrack);
        console.log(`Ctrl: Replaced audio track for monitor ${monitorId} with track from camera ${targetCameraId}`);
      } else {
        console.warn(`Ctrl: No audio track on camera ${targetCameraId}. Sending empty/previous to monitor ${monitorId}.`);
        await senders.audio.replaceTrack(null); // Send null to stop audio or send an empty track
      }

      updateMonitorStatus(monitorId, `Streaming ${camera.name} to ${monitor.name}`, false, targetCameraId);
      // alert(`${camera.name} assigned to ${monitor.name}. Stream should update.`); // Alert can be too intrusive
    } catch (err) {
      console.error("Ctrl: replaceTrack err:", err);
      setControllerError(`Failed to assign stream: ${err.message}`);
      updateMonitorStatus(monitorId, `Error assigning stream: ${err.message}`, true, monitors[monitorId]?.assignedCameraId || null);
    }
  }, [cameras, monitors]);

  // Helper for empty tracks, useful for initializing senders
  const createEmptyAudioTrack = () => {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const dst = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    const [track] = dst.stream.getAudioTracks();
    // track.enabled = false; // It's better to let the receiver handle this or ensure it's what you want
    return track;
  };
  const createEmptyVideoTrack = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = "black"; ctx.fillRect(0, 0, 1, 1);}
    const stream = canvas.captureStream(1);
    const [track] = stream.getVideoTracks();
    // track.enabled = false;
    return track;
  };

  const getStatusClass = (statusText) => {
    if (!statusText) return 'status-disconnected';
    const s = statusText.toLowerCase();
    if (s.includes('error')) return 'status-error';
    if (s.includes('processing') || s.includes('connect') || s.includes('preparing') || s.includes('awaiting')) return 'status-connecting';
    if (s.includes('streaming') || s.includes('ready') || s.includes('active') || s.includes('registered') || s.includes('answer prepared') || s.includes('downloaded')) return 'status-connected';
    return 'status-disconnected';
  };

  return (
    <div>
      <h1 className="screen-title">Controller Dashboard</h1>
      {controllerError && <div className="container error-box" style={{borderColor:'red', color:'red', backgroundColor:'#ffebee'}}><p><strong>Controller Error:</strong> {controllerError}</p></div>}
      {isLoading && <div className="container loading-box"><span className="spinner-border" role="status"></span> Processing...</div>}

      <div className="container">
        <h2>Camera Connections</h2>
        <p className="info-text">Upload 'Offer for Controller' JSON from a Camera.</p>
        <label htmlFor="cameraOfferUploadCtrl" className="button">Register Camera (Upload Offer)</label>
        <input type="file" id="cameraOfferUploadCtrl" accept=".json,application/json" onChange={handleCameraOfferUpload} style={{ display: 'none' }} disabled={isLoading} />
        
        <h3 style={{marginTop: '20px'}}>Connected Cameras ({Object.keys(cameras).length})</h3>
        {Object.keys(cameras).length === 0 && <p className="info-text">No cameras connected.</p>}
        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '15px'}}>
          {Object.values(cameras).map(cam => (
            <li key={cam.id} className="device-item" style={{flexBasis: 'calc(50% - 8px)', flexDirection: 'column', alignItems: 'stretch'}}>
              <div>
                <span className={`status-dot ${getStatusClass(cam.status)}`}></span>
                <strong>{cam.name || cam.id}</strong>
              </div>
              <p className="device-status-text" style={{margin: '5px 0'}}>Status: {cam.status || 'N/A'}</p>
              {cam.stream && (
                <video ref={el => cameraPreviewVideoRefs.current[cam.id] = el} style={{ width: '100%', maxHeight: '180px', backgroundColor:'#000'}} autoPlay playsInline muted />
              )}
              {cam.answerSdp && cam.status?.includes('Answer prepared') && (
                <button onClick={() => handleDownloadAnswerForCamera(cam.id)} className="button" style={{marginTop:'10px', fontSize:'0.9em'}} disabled={isLoading}>
                  Download Answer for Camera
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="container">
        <h2>Monitor Connections</h2>
        <p className="info-text">Upload 'Offer for Controller' JSON from a Monitor.</p>
        <label htmlFor="monitorOfferUploadCtrl" className="button">Register Monitor (Upload Offer)</label>
        <input type="file" id="monitorOfferUploadCtrl" accept=".json,application/json" onChange={handleMonitorOfferUpload} style={{ display: 'none' }} disabled={isLoading} />

        <h3 style={{marginTop: '20px'}}>Connected Monitors ({Object.keys(monitors).length})</h3>
        {Object.keys(monitors).length === 0 && <p className="info-text">No monitors connected.</p>}
        <ul>
          {Object.values(monitors).map(mon => (
            <li key={mon.id} className="device-item">
              <div>
                <span className={`status-dot ${getStatusClass(mon.status)}`}></span>
                <strong>{mon.name || mon.id}</strong>
                <p className="device-status-text" style={{margin: '5px 0'}}>Status: {mon.status || 'N/A'}</p>
                {mon.assignedCameraId && cameras[mon.assignedCameraId] && 
                    <p className="device-target-text" style={{margin: '5px 0'}}>Streaming: <strong>{cameras[mon.assignedCameraId].name}</strong></p>}
              </div>
              <div style={{marginTop: '10px'}}>
                <label htmlFor={`camSelect-${mon.id}`} style={{fontSize: '0.9em', marginRight:'5px'}}>Assign Camera:</label>
                <select 
                    id={`camSelect-${mon.id}`} 
                    onChange={(e) => e.target.value && handleAssignCameraToMonitor(mon.id, e.target.value)} 
                    value={mon.assignedCameraId || ''}
                    disabled={isLoading || Object.values(cameras).filter(c => c.stream).length === 0}
                    style={{padding: '5px', fontSize: '0.9em'}}
                >
                  <option value="">-- Select Camera --</option>
                  {Object.values(cameras).filter(c => c.stream).map(cam => (
                    <option key={cam.id} value={cam.id}>{cam.name || cam.id}</option>
                  ))}
                </select>
              </div>
              {mon.answerSdp && mon.status?.includes('Answer prepared') && (
                <button onClick={() => handleDownloadAnswerForMonitor(mon.id)} className="button" style={{marginTop:'10px', fontSize:'0.9em'}} disabled={isLoading}>
                  Download Answer for Monitor
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default ControllerScreen; 