import React, { useRef, useState, useEffect, useCallback } from 'react';
import useStore, { generateId } from './store'; // Import generateId

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

function MonitorScreen() {
  const videoRef = useRef(null);
  const [peerConnection, setPeerConnection] = useState(null); // Connection to Controller
  const collectedIceCandidates = useRef([]);
  const [monitorId, setMonitorId] = useState(null);
  const [monitorName, setMonitorName] = useState('');

  const [status, setStatus] = useState('Initializing...');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [offerDataForController, setOfferDataForController] = useState(null); // To hold prepared offer for controller
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const newId = generateId('mon');
    setMonitorId(newId);
    setMonitorName(`Monitor ${newId.substring(0,8)}`);
    setStatus('Ready. Prepare offer for Controller to request a stream.');
    
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement || !!document.webkitFullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []); 

  useEffect(() => {
    const pcToClean = peerConnection;
    return () => { 
      if (pcToClean) {
        console.log("MonitorScreen: Cleaning up old PeerConnection instance in useEffect: ", pcToClean);
        pcToClean.close(); 
      }
    };
  }, [peerConnection]);

  const connectToController = useCallback(async () => {
    if (peerConnection) { 
        console.log("MonitorScreen: Closing existing PC before creating new offer for controller.");
        peerConnection.close(); 
    }
    setError(null);
    setOfferDataForController(null);
    setIsLoading(true);
    setStatus('Preparing offer for Controller...');

    const pc = new RTCPeerConnection(configuration);
    console.log("MonitorScreen: New PC created for connecting to Controller", pc);
    setPeerConnection(pc); // This will trigger the cleanup for the *previous* instance via useEffect
    
    collectedIceCandidates.current = [];

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (event) => {
      console.log("MonitorScreen: ontrack event triggered", event);
      if (videoRef.current && event.streams && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setStatus('Streaming video from Controller.'); setError(null);
      } else {
        setStatus('Error: Failed to attach stream from Controller.'); setError('Video stream attachment error.');
        console.error("MonitorScreen: ontrack - videoRef or stream missing.", videoRef.current, event.streams);
      }
    };
    pc.onicecandidate = event => {
      if (event.candidate) {
        console.log("MonitorScreen: Collected ICE candidate for Controller offer:", event.candidate);
        collectedIceCandidates.current.push(event.candidate);
      }
    };
    pc.onicegatheringstatechange = () => {
      console.log("MonitorScreen: onicegatheringstatechange - state:", pc.iceGatheringState);
      if (pc.iceGatheringState === 'complete') {
        if (pc.localDescription && pc.localDescription.type === 'offer') {
          setOfferDataForController({
            sdp: pc.localDescription,
            iceCandidates: collectedIceCandidates.current
          });
          setStatus('Offer for Controller prepared. Ready to download.'); setError(null);
          console.log("MonitorScreen: Offer for Controller fully prepared with ICE.");
        } else {
          setError("Failed to generate offer for Controller (LocalDescription not type offer or missing).");
          setStatus('Error: Offer generation for Controller failed.');
          console.error("MonitorScreen: Offer generation failed - LocalDescription:", pc.localDescription);
        }
        setIsLoading(false);
      }
    };
    pc.onconnectionstatechange = () => {
      console.log("MonitorScreen: pc.onconnectionstatechange - New state:", pc.connectionState);
      setStatus(`To Controller: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        setError('Connection to Controller failed. Check network, firewall, and console for ICE errors.');
      } else if (pc.connectionState === 'connected') {
        setError(null); 
        setStatus('Connected to Controller. Waiting for stream assignment...');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        setError('Connection to Controller has been closed or disconnected.');
        // Consider if peerConnection state should be reset here, e.g., setPeerConnection(null)
      }
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log("MonitorScreen: Offer created and set as localDescription for Controller connection.");
    } catch (err) {
      console.error("Mon:createOfferForController err:", err);
      setError(`Offer for Controller failed: ${err.message}`);
      setStatus('Error: Offer creation failed.');
      setIsLoading(false);
      setPeerConnection(null); // Clean up PC if offer creation fails
    }
  }, [peerConnection]); // Added peerConnection because it's checked at the start

  const handleDownloadOfferForController = useCallback(() => {
    if (!offerDataForController || !monitorId || !monitorName) {
      alert("Offer data for Controller, ID, or Name not ready."); return;
    }
    const fullOfferPayload = {
        id: monitorId,
        name: monitorName,
        type: 'monitor-offer-to-controller', 
        ...offerDataForController
    };
    downloadJson(fullOfferPayload, `monitor-offer-for-controller-${monitorName.replace(/\s/g, '_')}-${Date.now()}.json`);
    setStatus('Offer for Controller downloaded.');
  }, [offerDataForController, monitorId, monitorName]);

  const handleAnswerUploadFromController = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const currentPc = peerConnection; // Capture current peerConnection instance
    if (!currentPc || !currentPc.localDescription || currentPc.localDescription.type !== 'offer') {
      setError("PC not ready or not in offer state for Controller's answer.");
      setStatus('Error: Not ready for Controller answer.'); 
      console.error("MonitorScreen: handleAnswerUploadFromController - PC state invalid", currentPc?.localDescription);
      return;
    }
    setIsLoading(true); setStatus('Processing answer from Controller...'); setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const answerInfo = JSON.parse(e.target.result);
        console.log("MonitorScreen: Received answer from controller:", answerInfo);
        if (!answerInfo.sdp || answerInfo.sdp.type !== 'answer') {
          throw new Error('Invalid Answer SDP from Controller.');
        }
        if (!answerInfo.iceCandidates || !Array.isArray(answerInfo.iceCandidates)) {
          console.warn("MonitorScreen: Missing or invalid ICE candidates array in Controller answer, proceeding with SDP only.");
          // Allow proceeding even if ICE candidates array is missing/empty, they might be bundled or arrive later.
          // throw new Error('Invalid or missing ICE candidates in Controller answer.');
        }
        await currentPc.setRemoteDescription(new RTCSessionDescription(answerInfo.sdp));
        setStatus('Controller answer SDP set. Adding ICE candidates...');
        console.log("MonitorScreen: Remote description (answer from Controller) set.");
        
        for (const candidate of (answerInfo.iceCandidates || [])) { // Ensure it's an array
          if (candidate) {
            try {
              await currentPc.addIceCandidate(new RTCIceCandidate(candidate));
              console.log("Mon: Added ICE candidate from Controller's answer:", candidate);
            } catch (iceErr) {
              console.warn("Mon: Error adding ICE from Controller answer:", iceErr, candidate);
            }
          }
        }
        console.log("Mon: All ICE candidates from Controller's answer submitted. Current connection state:", currentPc.connectionState);
        // Status will be updated by onconnectionstatechange
      } catch (err) {
        console.error("Mon:handleAnswerFromCtrl err:", err);
        setError(`Failed to process answer from Controller: ${err.message}`);
        setStatus('Error: Processing Controller answer failed.');
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
        setError("File reading failed for Controller answer."); setStatus('Error reading Controller answer.'); setIsLoading(false);
    };
    reader.readAsText(file);
    event.target.value = null;
  }, [peerConnection]); // Depends on peerConnection to get the current PC

  const toggleFullScreen = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (videoElement.requestFullscreen) videoElement.requestFullscreen().catch(err => console.error('FS err:', err));
      else if (videoElement.webkitRequestFullscreen) videoElement.webkitRequestFullscreen().catch(err => console.error('WebKit FS err:', err));
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(err => console.error('Exit FS err:', err));
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(err => console.error('Exit WebKit FS err:', err));
    }
  }, []);

  return (
    <div>
      <h1 className="screen-title">Monitor (ID: {monitorId?.substring(0,8) || '...'})</h1>
      <div className="container">
        <label htmlFor="monitorNameInput">Monitor Name: </label>
        <input id="monitorNameInput" type="text" value={monitorName} onChange={e => setMonitorName(e.target.value)} placeholder="Enter monitor name"/>
      </div>
      <div className="container video-container" style={{ position: 'relative' }}> 
        <h2>Video Stream & Status</h2>
        <video ref={videoRef} style={{ width: '100%', maxWidth:'640px', marginBottom:'10px', display: 'block', margin: '0 auto'}} playsInline autoPlay muted={false}/>
        <div className="button-group" style={{ justifyContent: 'flex-end', marginTop:'-5px', marginBottom: '10px'}}>
            <button onClick={toggleFullScreen} className="button" title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"} style={{padding: '8px 12px', fontSize: '0.9rem'}}>
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
        </div>
        <p className="info-text">Status: <strong>{status}</strong> {isLoading && <span className="spinner-border spinner-border-sm" role="status"></span>}</p>
        {error && <p style={{ color: 'red', fontWeight:'bold' }}>Error: {error}</p>}
      </div>

      <div className="container">
        <h2>Connect to Controller</h2>
        <p className="info-text">1. Prepare and download your offer file to request a stream from the Controller. 2. Upload the answer file received from the Controller.</p>
        <div className="button-group">
            <button onClick={connectToController} disabled={isLoading}>1. Prepare Offer for Controller</button>
            <button onClick={handleDownloadOfferForController} disabled={isLoading || !offerDataForController}>2. Download Offer for Controller</button>
        </div>
        <div style={{marginTop: '15px'}}>
            <label htmlFor="controllerAnswerUploadMon" className="button" style={{opacity: (isLoading || !peerConnection || peerConnection?.localDescription?.type !== 'offer') ? 0.7 : 1}}>
                3. Upload Answer from Controller
            </label>
            <input 
                type="file" 
                id="controllerAnswerUploadMon" 
                accept=".json,application/json" 
                onChange={handleAnswerUploadFromController} 
                style={{ display: 'none' }} 
                disabled={isLoading || !peerConnection || peerConnection?.localDescription?.type !== 'offer'}
            />
        </div>
      </div>
    </div>
  );
}

export default MonitorScreen; 