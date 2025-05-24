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
  const [peerConnection, setPeerConnection] = useState(null);
  const collectedIceCandidates = useRef([]);
  const [offerReadyForExport, setOfferReadyForExport] = useState(false); // When camera makes its own offer
  const [answerReadyForExport, setAnswerReadyForExport] = useState(false); // When camera makes an answer to an incoming offer
  const localSdpRef = useRef(null); // Stores own offer OR own answer
  const [cameraId, setCameraId] = useState(null); // State for Camera ID
  const [cameraName, setCameraName] = useState('My Camera'); // Default name, user can change
  const [status, setStatus] = useState('Initializing...');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Get controller-generated offer if any
  const controllerOffer = useStore((state) => state.controllerGeneratedOfferForCamera);
  const setControllerOffer = useStore((state) => state.setControllerGeneratedOfferForCamera);

  useEffect(() => {
    const newId = generateId('cam');
    setCameraId(newId);
    setCameraName(`Camera ${newId.substring(0, 8)}`);
    setStatus('Waiting for camera access...');

    let streamRef = null; // Use a ref for the stream in cleanup

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef = stream; // Assign to ref for cleanup
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setLocalStream(stream); // Still set state for other parts of the component to use
        setStatus('Camera active. Ready to prepare offer.');
        setError(null);
      } catch (err) {
        console.error("Cam:getUserMedia error:", err);
        setError(`Camera access failed: ${err.message}. Please check permissions.`);
        setStatus('Error: Camera access denied.');
      }
    };
    startCamera();

    // Store peerConnection in a ref for cleanup to avoid it as a dependency
    const pcRef = { current: peerConnection };
    pcRef.current = peerConnection; // Keep it updated if peerConnection state changes elsewhere
                                  // (though it shouldn't be changed by this effect directly after init)

    return () => {
      console.log("CameraScreen cleanup effect running");
      if (streamRef) {
        console.log("Stopping local stream tracks");
        streamRef.getTracks().forEach(track => track.stop());
      }
      if (pcRef.current) {
        console.log("Closing peer connection");
        pcRef.current.close();
      }
      if (setControllerOffer) { // Check if setControllerOffer is defined
        setControllerOffer(null); 
      }
    };
  }, [setControllerOffer]); // setControllerOffer from Zustand should be stable. If it also causes issues, it needs investigation.
                           // Or, if truly only for unmount cleanup, it could be removed too, but generally store setters are stable.

  // Effect to process controller-generated offer
  useEffect(() => {
    if (controllerOffer && controllerOffer.cameraId === cameraId && localStream) {
      console.log('Camera: Received offer from controller', controllerOffer);
      // This camera is being requested to connect to a monitor
      // The controller has created an offer for *this camera* to send to the monitor (acting as answerer here)
      // This flow is a bit reversed: Camera usually offers. Let's adjust. Controller will tell Camera to *generate* an offer.
      // For now, let's assume controller sends an OFFER for the camera to use directly with a monitor.
      // This means camera will act as the "answerer" to an offer initiated by controller on its behalf.
      // This simplifies controller logic for now. It pre-negotiates the offer.

      // The CameraScreen's handleStartConnection logic is more suited for when Camera initiates the offer.
      // If controller sends an offer, Camera needs to set remote (controller's offer) and create an answer.
      // This current CameraScreen.jsx is designed for Camera to make an offer, and then get an answer.
      // Let's stick to the requested flow: Camera exports its OFFER, Controller imports it.
      // The `controllerGeneratedOfferForCamera` from store might be for a different interaction model.
      // We will IGNORE `controllerOffer` for now in CameraScreen for Part 4, as camera will generate its own offer for export.
    }
  }, [controllerOffer, cameraId, localStream]);

  const initializePc = useCallback(() => {
    if (peerConnection) peerConnection.close();
    setError(null);
    const pc = new RTCPeerConnection(configuration);
    setPeerConnection(pc);
    collectedIceCandidates.current = [];
    localSdpRef.current = null;
    setOfferReadyForExport(false);
    setAnswerReadyForExport(false);

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    } else {
        setError("Local stream not available. Cannot initialize connection.");
        setStatus('Error: Local stream missing.');
        return null; // Indicate failure
    }

    pc.onicecandidate = event => {
        if (event.candidate) collectedIceCandidates.current.push(event.candidate);
    };
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        if (pc.localDescription) {
            localSdpRef.current = pc.localDescription;
            if (pc.localDescription.type === 'offer') {
                setOfferReadyForExport(true);
                setStatus('Offer prepared. Ready to download or for Controller.');
            } else if (pc.localDescription.type === 'answer') {
                setAnswerReadyForExport(true);
                setStatus('Answer prepared. Ready to download.');
            }
            console.log(`Cam: ${pc.localDescription.type} and ICE ready.`);
        } else {
            setError("LocalDescription not found after ICE gathering.");
            setStatus('Error: SDP generation failed.');
        }
        setIsLoading(false);
      }
    };
    pc.onconnectionstatechange = () => {
        setStatus(`Connection: ${pc.connectionState}`);
        if (pc.connectionState === 'failed') setError('WebRTC connection failed.');
        else if (pc.connectionState === 'connected') setError(null);
    };
    return pc;
  }, [localStream, peerConnection]);

  const handlePrepareOffer = useCallback(async () => {
    setIsLoading(true);
    setStatus('Preparing offer...');
    const pc = initializePc();
    if (!pc) { setIsLoading(false); return; }
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
    } catch (err) { 
      console.error("Cam:createOffer err:", err);
      setError(`Offer creation failed: ${err.message}`); 
      setStatus('Error: Offer creation failed.');
      setIsLoading(false);
    }
  }, [initializePc]);

  const handleDownloadOffer = useCallback(() => {
    if (!localSdpRef.current || localSdpRef.current.type !== 'offer' || !offerReadyForExport || !cameraId) {
      alert("Offer/ID not ready for download. Please prepare offer first."); return;
    }
    downloadJson({
      id: cameraId, name: cameraName, type: 'camera-offer',
      sdp: localSdpRef.current, iceCandidates: collectedIceCandidates.current
    }, `camera-offer-${cameraName.replace(/\s/g, '_')}-${Date.now()}.json`);
    setStatus('Offer downloaded.');
  }, [cameraId, cameraName, offerReadyForExport]);
  
  const handleFileUpload = useCallback(async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsLoading(true);
    setError(null);
    setStatus(`Processing ${type} file...`);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const fileData = JSON.parse(e.target.result);
        let pc = peerConnection;

        if (type === 'answer') {
          if (!pc || !pc.localDescription || pc.localDescription.type !== 'offer') {
            setError("Cannot accept answer: Offer not made or PC not ready.");
            setStatus('Error: Not ready for answer.'); setIsLoading(false); return;
          }
          if (fileData.sdp?.type !== 'answer') { 
            setError("Invalid Answer SDP in file."); 
            setStatus('Error: Invalid Answer file.'); setIsLoading(false); return; 
          }
          await pc.setRemoteDescription(new RTCSessionDescription(fileData.sdp));
          fileData.iceCandidates?.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(iceErr => console.warn("Error adding ICE from answer:", iceErr)));
          setStatus('Answer processed. Connection should be active.');
          setError(null);

        } else if (type === 'offer') { // Received an offer (e.g. from Monitor via Controller)
          pc = initializePc(); // Re-init PC for answering role
          if (!pc) { setIsLoading(false); return; }
          if (fileData.sdp?.type !== 'offer') { 
            setError("Invalid Offer SDP in file."); 
            setStatus('Error: Invalid Offer file.'); setIsLoading(false); return; 
          }
          await pc.setRemoteDescription(new RTCSessionDescription(fileData.sdp));
          fileData.iceCandidates?.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(iceErr => console.warn("Error adding ICE from offer:", iceErr)));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          // onicegatheringstatechange will set answerReadyForExport and stop loading
          setStatus('Offer processed. Answer prepared, ready for download.');
        }
      } catch (err) {
        console.error(`Cam:${type}Upload err:`, err);
        setError(`File processing error (${type}): ${err.message}`);
        setStatus(`Error processing ${type} file.`);
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
        setError("File reading failed.");
        setStatus('Error: Could not read file.');
        setIsLoading(false);
    }
    reader.readAsText(file); 
    event.target.value = null; // Reset file input
  }, [peerConnection, initializePc]);

  const handleDownloadAnswer = useCallback(() => {
    if (!localSdpRef.current || localSdpRef.current.type !== 'answer' || !answerReadyForExport || !cameraId) {
      alert("Answer/ID not ready for download. Please process an offer first."); return;
    }
    downloadJson({
      id: cameraId, name: cameraName, type: 'camera-answer',
      sdp: localSdpRef.current, iceCandidates: collectedIceCandidates.current
    }, `camera-answer-for-monitor-${Date.now()}.json`);
    setStatus('Answer downloaded.');
  }, [cameraId, cameraName, answerReadyForExport]);

  return (
    <div>
      <h1 className="screen-title">Camera Screen (ID: {cameraId ? cameraId.substring(0,8) : 'N/A'})</h1>
      <div className="container">
        <label htmlFor="cameraNameInput">Camera Name: </label>
        <input id="cameraNameInput" type="text" value={cameraName} onChange={e => setCameraName(e.target.value)} placeholder="Enter a name for this camera"/>
      </div>
      <div className="container">
        <h2>Local Camera Preview & Status</h2>
        <video ref={videoRef} style={{ width: '100%', maxWidth:'480px', height: 'auto', display: 'block', margin: '0 auto' }} playsInline autoPlay muted></video>
        <p className="info-text">Status: <strong>{status}</strong> {isLoading && <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>}</p>
        {error && <p style={{ color: 'red', fontWeight:'bold' }}>Error: {error}</p>}
      </div>

      <div className="container">
        <h2>For Controller Registration / Direct Connection</h2>
        <p className="info-text">1. Prepare your offer information. 2. Download it for the Controller or a direct Monitor connection.</p>
        <div className="button-group">
          <button onClick={handlePrepareOffer} disabled={isLoading || !localStream}>1. Prepare Offer Info</button>
          <button onClick={handleDownloadOffer} disabled={isLoading || !offerReadyForExport}>2. Download Offer for Controller/Monitor</button>
        </div>
      </div>

      <div className="container">
        <h2>Connect using Answer File (from Monitor/Controller)</h2>
        <p className="info-text">If a Monitor (or Controller) has provided an answer to your offer, upload it here.</p>
        <div style={{marginTop: '15px'}}>
            <label htmlFor="camAnswerUpload" className="button">Upload Answer File (from Monitor/Controller)</label>
            <input type="file" id="camAnswerUpload" onChange={(e) => handleFileUpload(e, 'answer')} accept=".json,application/json" style={{display:'none'}} disabled={isLoading}/>
        </div>
      </div>

      <div className="container">
        <h2>Connect using Offer File (from Monitor/Controller)</h2>
        <p className="info-text">If a Monitor (or Controller) has provided an offer to you, upload it here.</p>
        <div style={{marginTop: '15px'}}>
            <label htmlFor="camOfferUpload" className="button">Upload Offer File (from Monitor/Controller)</label>
            <input type="file" id="camOfferUpload" onChange={(e) => handleFileUpload(e, 'offer')} accept=".json,application/json" style={{display:'none'}} disabled={isLoading}/>
        </div>
        <button onClick={handleDownloadAnswer} disabled={isLoading || !answerReadyForExport}>2. Download Own Answer (.json)</button>
      </div>
    </div>
  );
}

export default CameraScreen; 