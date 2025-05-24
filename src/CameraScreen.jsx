import React, { useEffect, useRef, useState, useCallback } from 'react';
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

function CameraScreen() {
  const videoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null); // Connection to Controller
  const collectedIceCandidates = useRef([]);
  const [offerReadyForExport, setOfferReadyForExport] = useState(false); // When camera makes its own offer
  const [answerReadyForExport, setAnswerReadyForExport] = useState(false); // When camera makes an answer to an incoming offer
  const localSdpRef = useRef(null); // Stores own offer OR own answer
  const [cameraId, setCameraId] = useState(null); // State for Camera ID
  const [cameraName, setCameraName] = useState('My Camera'); // Default name, user can change
  const [status, setStatus] = useState('Initializing...');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [offerDataForController, setOfferDataForController] = useState(null);

  // Get controller-generated offer if any
  const controllerOffer = useStore((state) => state.controllerGeneratedOfferForCamera);
  const setControllerOffer = useStore((state) => state.setControllerGeneratedOfferForCamera);

  useEffect(() => {
    const newId = generateId('cam');
    setCameraId(newId);
    setCameraName(`Camera ${newId.substring(0, 8)}`);
    setStatus('Waiting for camera access...');
    let streamRef = null;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setLocalStream(stream);
        setStatus('Camera active. Ready to connect to Controller.');
        setError(null);
      } catch (err) {
        console.error("Cam:getUserMedia err:", err);
        setError(`Camera access failed: ${err.message}.`);
        setStatus('Error: Camera access denied.');
      }
    };
    startCamera();
    return () => {
      streamRef?.getTracks().forEach(track => track.stop());
      peerConnection?.close();
    };
  }, []); 

  useEffect(() => {
    const pcToClean = peerConnection;
    return () => { 
        if (pcToClean) {
            console.log("CameraScreen: Cleaning up old PeerConnection instance in useEffect: ", pcToClean);
            pcToClean.close(); 
        }
    };
  }, [peerConnection]);

  const connectToController = useCallback(async () => {
    if (!localStream) {
      setError("Local stream not available.");
      setStatus('Error: Local stream missing for Controller connection.');
      setIsLoading(false);
      return;
    }
    if (peerConnection) { 
        console.log("CameraScreen: Closing existing PC before creating new offer for controller.");
        peerConnection.close(); 
    }
    setError(null);
    setOfferDataForController(null);
    setIsLoading(true);
    setStatus('Preparing offer for Controller...');

    const pc = new RTCPeerConnection(configuration);
    console.log("Cam: New PC created for connecting to Controller", pc);
    setPeerConnection(pc); 
    
    collectedIceCandidates.current = [];

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = event => {
      if (event.candidate) {
        console.log("Cam: Collected ICE candidate for Controller offer:", JSON.stringify(event.candidate));
        collectedIceCandidates.current.push(event.candidate);
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log("Cam: onicegatheringstatechange - state:", pc.iceGatheringState);
      if (pc.iceGatheringState === 'complete') {
        if (pc.localDescription && pc.localDescription.type === 'offer') {
          setOfferDataForController({
            sdp: pc.localDescription,
            iceCandidates: collectedIceCandidates.current
          });
          setStatus('Offer for Controller prepared. Ready to download.');
          setError(null);
          console.log("Cam: Offer for Controller fully prepared with ICE.");
        } else {
          setError("Failed to generate offer for Controller (LocalDescription not type offer or missing).");
          setStatus('Error: Offer generation for Controller failed.');
          console.error("Cam: Offer generation failed - LocalDescription:", pc.localDescription);
        }
        setIsLoading(false);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("Cam: pc.onconnectionstatechange - New state:", pc.connectionState);
      setStatus(`To Controller: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        setError('Connection to Controller failed. Check network, firewall, and console for ICE errors.');
      } else if (pc.connectionState === 'connected') {
        setError(null); 
        setStatus('Connected to Controller!');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        setError('Connection to Controller has been closed or disconnected.');
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log("Cam: Offer created and set as localDescription for Controller connection.");
    } catch (err) {
      console.error("Cam:createOfferForController err:", err);
      setError(`Offer creation for Controller failed: ${err.message}`);
      setStatus('Error: Offer creation failed.');
      setIsLoading(false);
      setPeerConnection(null); 
    }
  }, [localStream, peerConnection]); 

  const handleDownloadOfferForController = useCallback(() => {
    if (!offerDataForController || !cameraId || !cameraName) {
      alert("Offer data for Controller, Camera ID, or Name is not ready."); return;
    }
    const fullOfferPayload = {
        id: cameraId,
        name: cameraName,
        type: 'camera-offer-to-controller', 
        ...offerDataForController
    };
    downloadJson(fullOfferPayload, `camera-offer-for-controller-${cameraName.replace(/\s/g, '_')}-${Date.now()}.json`);
    setStatus('Offer for Controller downloaded.');
  }, [offerDataForController, cameraId, cameraName]);

  const handleAnswerUploadFromController = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const currentPc = peerConnection; 
    if (!currentPc || !currentPc.localDescription || currentPc.localDescription.type !== 'offer') {
      setError("PC not ready or not in offer state to accept Controller's answer.");
      setStatus('Error: Not ready for Controller answer.'); 
      console.error("CameraScreen: handleAnswerUploadFromController - PC state invalid", currentPc?.localDescription);
      return;
    }

    setIsLoading(true); setStatus('Processing answer from Controller...'); setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const answerInfo = JSON.parse(e.target.result);
        console.log("Cam: Received answer from controller:", answerInfo);
        if (!answerInfo.sdp || answerInfo.sdp.type !== 'answer') {
          throw new Error('Invalid Answer SDP from Controller.');
        }
        // Allow empty iceCandidates array, but log a warning.
        if (!answerInfo.iceCandidates || !Array.isArray(answerInfo.iceCandidates)) {
          console.warn("Cam: Missing or invalid ICE candidates array in Controller answer. This might lead to connection issues.");
        }
        await currentPc.setRemoteDescription(new RTCSessionDescription(answerInfo.sdp));
        setStatus('Controller answer SDP set. Adding ICE candidates...');
        console.log("Cam: Remote description (answer from Controller) set.");
        
        for (const candidate of (answerInfo.iceCandidates || [])) { 
          if (candidate) {
            try {
              await currentPc.addIceCandidate(new RTCIceCandidate(candidate));
              console.log("Cam: Added ICE candidate from Controller's answer:", JSON.stringify(candidate));
            } catch (iceErr) {
              console.warn("Cam: Error adding ICE from Controller answer:", iceErr, candidate);
            }
          }
        }
        console.log("Cam: All ICE candidates from Controller's answer submitted. Current connection state:", currentPc.connectionState);
      } catch (err) {
        console.error("Cam:handleAnswerFromController err:", err);
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
  }, [peerConnection]);

  return (
    <div>
      <h1 className="screen-title">Camera (ID: {cameraId?.substring(0,8) || '...'})</h1>
      <div className="container">
        <label htmlFor="cameraNameInput">Camera Name: </label>
        <input id="cameraNameInput" type="text" value={cameraName} onChange={e => setCameraName(e.target.value)} placeholder="Enter camera name"/>
      </div>
      <div className="container">
        <h2>Local Preview & Status</h2>
        <video ref={videoRef} style={{ width: '100%', maxWidth:'480px', marginBottom:'10px'}} playsInline autoPlay muted />
        <p className="info-text">Status: <strong>{status}</strong> {isLoading && <span className="spinner-border spinner-border-sm" role="status"></span>}</p>
        {error && <p style={{ color: 'red', fontWeight:'bold' }}>Error: {error}</p>}
      </div>

      <div className="container">
        <h2>Connect to Controller</h2>
        <p className="info-text">1. Prepare and download your offer file for the Controller. 2. Upload the answer file received from the Controller.</p>
        <div className="button-group">
          <button onClick={connectToController} disabled={isLoading || !localStream}>1. Prepare Offer for Controller</button>
          <button onClick={handleDownloadOfferForController} disabled={isLoading || !offerDataForController}>2. Download Offer for Controller</button>
        </div>
        <div style={{marginTop: '15px'}}>
            <label htmlFor="controllerAnswerUpload" className="button" style={{opacity: (isLoading || !peerConnection || peerConnection?.localDescription?.type !== 'offer') ? 0.7 : 1}}>
                3. Upload Answer from Controller
            </label>
            <input 
                type="file" 
                id="controllerAnswerUpload" 
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

export default CameraScreen; 