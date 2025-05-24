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
  const [peerConnection, setPeerConnection] = useState(null);
  const collectedIceCandidates = useRef([]);
  const [monitorId, setMonitorId] = useState(null);
  const [monitorName, setMonitorName] = useState('My Monitor');

  // For exporting its own offer to the controller
  const [offerForControllerReady, setOfferForControllerReady] = useState(false);
  const [answerForCameraReady, setAnswerForCameraReady] = useState(false);
  const localSdpRef = useRef(null);

  const [status, setStatus] = useState('Initializing...');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const newId = generateId('mon');
    setMonitorId(newId);
    setMonitorName(`Monitor ${newId.substring(0,8)}`);
    setStatus('Ready. Prepare offer or await incoming offer.');
    return () => {
      if (peerConnection) peerConnection.close();
    };
  }, []); // Removed peerConnection from dependencies to avoid loop with setPeerConnection

  const initializePc = useCallback(() => {
    if (peerConnection) peerConnection.close();
    setError(null);
    const pc = new RTCPeerConnection(configuration);
    setPeerConnection(pc);
    collectedIceCandidates.current = [];
    localSdpRef.current = null;
    setOfferForControllerReady(false);
    setAnswerForCameraReady(false);

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setStatus('Streaming video from Camera.');
        setError(null);
      } else {
          setStatus('Track received, but failed to attach to video element.');
          setError('Video stream attachment error.');
      }
    };
    pc.onicecandidate = event => event.candidate && collectedIceCandidates.current.push(event.candidate);
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        if (pc.localDescription) {
            localSdpRef.current = pc.localDescription;
            if (pc.localDescription.type === 'offer') {
                setOfferForControllerReady(true);
                setStatus('Offer prepared. Ready to download for Controller.');
            } else if (pc.localDescription.type === 'answer') {
                setAnswerForCameraReady(true);
                setStatus('Answer prepared. Ready to download for Camera.');
            }
            console.log(`Mon: ${pc.localDescription.type} and ICE ready.`);
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
  }, [peerConnection]); // peerConnection for re-init possibility

  const handlePrepareOffer = useCallback(async () => {
    setIsLoading(true);
    setStatus('Preparing offer for Controller...');
    const pc = initializePc();
    if (!pc) { setIsLoading(false); return; }
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
    } catch (err) { 
        console.error("Mon:createOffer err:", err); 
        setError(`Offer creation failed: ${err.message}`);
        setStatus('Error: Offer creation failed.');
        setIsLoading(false);
    }
  }, [initializePc]);

  const handleDownloadOffer = useCallback(() => {
    if (!localSdpRef.current || localSdpRef.current.type !== 'offer' || !offerForControllerReady || !monitorId) {
      alert("Offer/ID not ready for download. Prepare offer first."); return;
    }
    downloadJson({
      id: monitorId, name: monitorName, type: 'monitor-offer',
      sdp: localSdpRef.current, iceCandidates: collectedIceCandidates.current
    }, `monitor-offer-${monitorName.replace(/\s/g, '_')}-${Date.now()}.json`);
    setStatus('Offer downloaded.');
  }, [monitorId, monitorName, offerForControllerReady]);

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

        if (type === 'answer') { // Received an answer to own offer (from Camera via Controller)
          if (!pc || !pc.localDescription || pc.localDescription.type !== 'offer') {
            setError("Cannot accept answer: Offer not made or PC not ready.");
            setStatus('Error: Not ready for answer.'); setIsLoading(false); return;
          }
          if (fileData.sdp?.type !== 'answer') { 
            setError("Invalid Answer SDP from Camera."); 
            setStatus('Error: Invalid Answer file.'); setIsLoading(false); return; 
          }
          await pc.setRemoteDescription(new RTCSessionDescription(fileData.sdp));
          fileData.iceCandidates?.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(iceErr => console.warn("Error adding ICE from Cam answer:", iceErr)));
          setStatus('Answer from Camera processed. Connection should be active.');
          setError(null);

        } else if (type === 'offer') { // Received an offer (from Camera via Controller)
          pc = initializePc(); // Re-init PC for answering role
          if (!pc) { setIsLoading(false); return; }
          if (fileData.sdp?.type !== 'offer') { 
            setError("Invalid Offer SDP from Camera."); 
            setStatus('Error: Invalid Offer file.'); setIsLoading(false); return; 
          }
          await pc.setRemoteDescription(new RTCSessionDescription(fileData.sdp));
          fileData.iceCandidates?.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(iceErr => console.warn("Error adding ICE from Cam offer:", iceErr)));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          setStatus('Offer from Camera processed. Answer prepared, ready for download.');
        }
      } catch (err) {
        console.error(`Mon:${type}Upload err:`, err);
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
    };
    reader.readAsText(file);
    event.target.value = null; // Reset file input
  }, [peerConnection, initializePc]);

  const handleDownloadAnswer = useCallback(() => {
    if (!localSdpRef.current || localSdpRef.current.type !== 'answer' || !answerForCameraReady || !monitorId) {
      alert("Answer/ID not ready for download. Process Camera's offer first."); return;
    }
    downloadJson({
      id: monitorId, name: monitorName, type: 'monitor-answer',
      sdp: localSdpRef.current, iceCandidates: collectedIceCandidates.current
    }, `monitor-answer-for-camera-${Date.now()}.json`);
    setStatus('Answer for Camera downloaded.');
  }, [monitorId, monitorName, answerForCameraReady]);

  return (
    <div>
      <h1 className="screen-title">Monitor Screen (ID: {monitorId ? monitorId.substring(0,8) : 'N/A'})</h1>
      <div className="container">
        Name: <input type="text" value={monitorName} onChange={(e) => setMonitorName(e.target.value)} style={{marginBottom: '10px'}} />
      </div>
      <div className="container">
        <h2>Remote Video Stream</h2>
        <video ref={videoRef} style={{ width: '100%', maxWidth:'640px', height: 'auto', display: 'block', margin: '0 auto' }} playsInline autoPlay muted={false}></video>
        <p className="info-text">Video stream from a Camera (via Controller) will appear here.</p>
      </div>

      <div className="container">
        <h3>Scenario 1: Monitor Initiates (for Controller Registration)</h3>
        <p className="info-text">Use this to request a stream by sending your offer to the Controller.</p>
        <div className="button-group">
            <button onClick={handlePrepareOffer} disabled={isLoading}>1a. Prepare Own Offer</button>
            <button onClick={handleDownloadOffer} disabled={isLoading || !offerForControllerReady}>1b. Download Own Offer (.json)</button>
        </div>
        <div style={{marginTop: '15px'}}>
            <label htmlFor="monAnswerUpload" className="button">Upload Answer File (from Camera/Controller)</label>
            <input type="file" id="monAnswerUpload" onChange={(e) => handleFileUpload(e, 'answer')} accept=".json,application/json" style={{display:'none'}} disabled={isLoading}/>
        </div>
      </div>

      <div className="container">
        <h3>Scenario 2: Monitor Responds (to Camera's Offer via Controller)</h3>
        <p className="info-text">Use this if Controller provides you with an offer file from a Camera.</p>
        <div className="button-group" style={{alignItems: 'flex-start'}}>
            <div>
                <label htmlFor="monOfferUpload" className="button">2a. Upload Offer File (from Camera/Controller)</label>
                <input type="file" id="monOfferUpload" onChange={(e) => handleFileUpload(e, 'offer')} accept=".json,application/json" style={{display:'none'}} disabled={isLoading}/>
            </div>
            <button onClick={handleDownloadAnswer} disabled={isLoading || !answerForCameraReady}>2b. Download Own Answer (.json)</button>
        </div>
      </div>
    </div>
  );
}

export default MonitorScreen; 