import React, { useState, useRef, useEffect } from 'react';

const CAM_LOG_PREFIX = "[CamScreen]";

function CameraScreen() {
  console.log(`${CAM_LOG_PREFIX} Component RENDERED`);
  const [localStream, setLocalStream] = useState(null);
  const [offerSignal, setOfferSignal] = useState('');
  const [answerSignalInput, setAnswerSignalInput] = useState('');
  const [status, setStatus] = useState('Not connected');
  const [error, setError] = useState('');

  const pcRef = useRef(null);
  const collectedIceCandidatesRef = useRef([]);
  const offerSignalTextareaRef = useRef(null); // Ref for offer textarea

  // Cleanup on unmount
  useEffect(() => {
    console.log(`${CAM_LOG_PREFIX} useEffect for cleanup, localStream changed:`, localStream);
    return () => {
      console.log(`${CAM_LOG_PREFIX} Cleanup effect triggered.`);
      if (localStream) {
        console.log(`${CAM_LOG_PREFIX} Stopping local stream tracks.`);
        localStream.getTracks().forEach(track => track.stop());
      }
      if (pcRef.current) {
        console.log(`${CAM_LOG_PREFIX} Closing PeerConnection.`);
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [localStream]);

  const startLocalMedia = async () => {
    console.log(`${CAM_LOG_PREFIX} startLocalMedia called`);
    try {
      setStatus('Starting local media...');
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log(`${CAM_LOG_PREFIX} Local media stream obtained:`, stream);
      setLocalStream(stream);
      setStatus('Local media started.');
    } catch (err) {
      console.error(`${CAM_LOG_PREFIX} Error starting local media:`, err);
      setError(`Failed to start local media: ${err.message}`);
      setStatus('Error starting media.');
    }
  };

  const initializePcAndCreateOffer = async () => {
    console.log(`${CAM_LOG_PREFIX} initializePcAndCreateOffer called`);
    if (!localStream) {
      console.error(`${CAM_LOG_PREFIX} Local media not started.`);
      setError("Local media not started. Please start camera first.");
      return;
    }
    try {
      setStatus("Cam: Initializing PeerConnection...");
      setError('');
      collectedIceCandidatesRef.current = []; 
      console.log(`${CAM_LOG_PREFIX} Initializing RTCPeerConnection. Current pcRef:`, pcRef.current);
      if(pcRef.current) {
        console.warn(`${CAM_LOG_PREFIX} Existing PeerConnection found. Closing it before creating a new one.`);
        pcRef.current.close();
      }

      const pc = new RTCPeerConnection({
        iceTransportPolicy: 'all'
      });
      console.log(`${CAM_LOG_PREFIX} New RTCPeerConnection created:`, pc);
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        console.log(`${CAM_LOG_PREFIX} onicecandidate event:`, event);
        if (event.candidate) {
          console.log(`${CAM_LOG_PREFIX} Collected ICE candidate for Controller offer:`, event.candidate.toJSON());
          collectedIceCandidatesRef.current.push(event.candidate.toJSON());
        } else {
          console.log(`${CAM_LOG_PREFIX} All ICE candidates collected (onicecandidate event.candidate is null).`);
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log(`${CAM_LOG_PREFIX} onicegatheringstatechange - state:`, pc.iceGatheringState, "PeerConnection:", pc);
        setStatus(`Cam ICE Gathering: ${pc.iceGatheringState}`);
        if (pc.iceGatheringState === 'complete') {
          console.log(`${CAM_LOG_PREFIX} ICE gathering complete.`);
          if (!pc.localDescription) {
            console.error(`${CAM_LOG_PREFIX} Local description is null at ICE complete.`);
            setError("Cam: Error: Local description missing during offer creation.");
            return;
          }
          const offerSignalPayload = {
            type: 'camera_offer',
            sdp: pc.localDescription.toJSON(),
            iceCandidates: collectedIceCandidatesRef.current
          };
          console.log(`${CAM_LOG_PREFIX} Offer for Controller fully prepared. Signal object:`, offerSignalPayload);
          setOfferSignal(JSON.stringify(offerSignalPayload, null, 2));
          setStatus('Cam: Offer created. Copy it to Controller.');
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`${CAM_LOG_PREFIX} oniceconnectionstatechange - state:`, pc.iceConnectionState, "PeerConnection:", pc);
        setStatus(`Cam-Ctrl ICE: ${pc.iceConnectionState}`);
      };

      pc.onconnectionstatechange = () => {
        console.log(`${CAM_LOG_PREFIX} onconnectionstatechange - state:`, pc.connectionState, "PeerConnection:", pc);
        setStatus(`Cam-Ctrl Connection: ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
          setError("Cam: Connection to Controller FAILED.");
          console.error(
            `${CAM_LOG_PREFIX} Connection to Controller FAILED. Offer SDP:`, pc.localDescription?.sdp, 
            "Answer SDP from Controller:", pc.remoteDescription?.sdp,
            "Collected local ICE:", collectedIceCandidatesRef.current
          );
        } else if (pc.connectionState === "connected") {
          setStatus("Cam: Successfully connected to Controller!");
          setError('');
        }
      };

      pc.onsignalingstatechange = () => {
        console.log(`${CAM_LOG_PREFIX} onsignalingstatechange - state:`, pc.signalingState, "PeerConnection:", pc);
      };

      console.log(`${CAM_LOG_PREFIX} Adding tracks to PeerConnection.`);
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
        console.log(`${CAM_LOG_PREFIX} Added ${track.kind} track to PC for Controller:`, track);
      });

      console.log(`${CAM_LOG_PREFIX} Creating offer...`);
      const offer = await pc.createOffer({
        offerToReceiveAudio: false, 
        offerToReceiveVideo: false 
      });
      console.log(`${CAM_LOG_PREFIX} Offer created:`, offer);
      await pc.setLocalDescription(offer);
      console.log(`${CAM_LOG_PREFIX} Local description (offer) set. Current localDescription:`, pc.localDescription);

    } catch (err) {
      console.error(`${CAM_LOG_PREFIX} Error in initializePcAndCreateOffer:`, err);
      setError(`Cam: Offer Error: ${err.toString()}`);
      setStatus('Cam: Failed to create offer.');
    }
  };

  const processAnswerFromController = async () => {
    console.log(`${CAM_LOG_PREFIX} processAnswerFromController called with input:`, answerSignalInput);
    const pc = pcRef.current;
    if (!pc) {
      console.error(`${CAM_LOG_PREFIX} PeerConnection not initialized.`);
      setError("Cam: PeerConnection not initialized. Create offer first.");
      return;
    }
    console.log(`${CAM_LOG_PREFIX} Current signalingState before processing answer:`, pc.signalingState);
    if (pc.signalingState !== 'have-local-offer' && pc.signalingState !== 'stable') { // 'stable' might be if offer was rejected and retried
        console.warn(`${CAM_LOG_PREFIX} Signaling state is ${pc.signalingState}, usually expect have-local-offer. Proceeding with caution.`);
    }
    if (!answerSignalInput) {
      console.error(`${CAM_LOG_PREFIX} Answer signal input is empty.`);
      setError("Cam: Answer signal from Controller is empty.");
      return;
    }

    let answerSignalPayload;
    try {
      answerSignalPayload = JSON.parse(answerSignalInput);
      console.log(`${CAM_LOG_PREFIX} Parsed answer signal payload:`, answerSignalPayload);
    } catch (e) {
      console.error(`${CAM_LOG_PREFIX} Invalid JSON in answer:`, e);
      setError(`Cam: Invalid JSON in answer: ${e.message}`);
      return;
    }

    if (!answerSignalPayload || typeof answerSignalPayload.sdp !== 'object' || !answerSignalPayload.sdp.type || !answerSignalPayload.sdp.sdp) {
      console.error(`${CAM_LOG_PREFIX} Invalid answer signal structure or missing sdp fields:`, answerSignalPayload);
      setError("Cam: Invalid answer signal received from Controller (missing sdp or sdp fields).");
      return;
    }
    if (answerSignalPayload.sdp.type !== 'answer') {
        console.warn(`${CAM_LOG_PREFIX} Expected SDP type 'answer' but got '${answerSignalPayload.sdp.type}'.`);
    }

    setStatus("Cam: Processing answer from Controller...");
    let iceCandidateErrorOccurred = false;

    try {
      console.log(`${CAM_LOG_PREFIX} Setting remote description (answer) with sdp:`, answerSignalPayload.sdp);
      await pc.setRemoteDescription(new RTCSessionDescription(answerSignalPayload.sdp));
      console.log(`${CAM_LOG_PREFIX} Remote description (answer from Controller) set. Current remoteDescription:`, pc.remoteDescription);
      setStatus("Cam: Controller answer SDP set. Adding ICE candidates...");

      if (answerSignalPayload.iceCandidates && Array.isArray(answerSignalPayload.iceCandidates)) {
        console.log(`${CAM_LOG_PREFIX} Adding ${answerSignalPayload.iceCandidates.length} ICE candidates from Controller.`);
        for (const candidate of answerSignalPayload.iceCandidates) {
          if (candidate) {
            console.log(`${CAM_LOG_PREFIX} Attempting to add ICE candidate:`, candidate);
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
              console.log(`${CAM_LOG_PREFIX} Successfully added ICE candidate from Controller:`, candidate);
            } catch (addIceError) {
              console.error(`${CAM_LOG_PREFIX} Error adding one ICE candidate from Controller:`, candidate, addIceError);
              setError(prev => `${prev} AddICE Fail: ${addIceError.message}. Candidate: ${JSON.stringify(candidate)}. `);
              iceCandidateErrorOccurred = true;
            }
          } else {
            console.warn(`${CAM_LOG_PREFIX} Received a null/undefined ICE candidate from Controller. Skipping.`);
          }
        }
        if (!iceCandidateErrorOccurred) {
            console.log(`${CAM_LOG_PREFIX} All ICE candidates from Controller's answer processed successfully.`);
            setStatus("Cam: Answer processed. Connecting...");
        } else {
            console.warn(`${CAM_LOG_PREFIX} Some ICE candidates from Controller failed to add. Connection might be unstable or fail.");
            setStatus("Cam: Answer processed with some ICE errors. Connecting...");
        }
      } else {
        console.log(`${CAM_LOG_PREFIX} No ICE candidates in Controller's answer or not an array.`);
        setStatus("Cam: Answer SDP set (no ICE candidates provided in answer). Connecting...");
      }
    } catch (err) {
      console.error(`${CAM_LOG_PREFIX} Error handling answer from Controller (e.g., setRemoteDescription):`, err);
      setError(`Cam: Answer Handling Error: ${err.toString()}`);
      setStatus('Cam: Failed to process answer.');
    }
  };

  const copyToClipboard = (text) => {
    console.log(`${CAM_LOG_PREFIX} copyToClipboard called for text:`, text.substring(0, 100) + "...");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          console.log(`${CAM_LOG_PREFIX} Copied to clipboard successfully.`);
          setStatus('Copied to clipboard!');
          setTimeout(() => setStatus(prev => prev === 'Copied to clipboard!' ? 'Cam: Offer created. Copy it to Controller.' : prev), 2000);
        })
        .catch(err => {
          console.error(`${CAM_LOG_PREFIX} Failed to copy text using navigator.clipboard:`, err);
          setError('Failed to copy to clipboard. Please copy manually.');
        });
    } else {
      console.warn(`${CAM_LOG_PREFIX} navigator.clipboard not available. Using fallback copy method.`);
      try {
        offerSignalTextareaRef.current?.select();
        document.execCommand('copy');
        console.log(`${CAM_LOG_PREFIX} Copied to clipboard using fallback.`);
        setStatus('Copied to clipboard (fallback)! Please verify.');
        setTimeout(() => setStatus(prev => prev === 'Copied to clipboard (fallback)! Please verify.' ? 'Cam: Offer created. Copy it to Controller.' : prev), 2000);
      } catch (fallbackErr) {
        console.error(`${CAM_LOG_PREFIX} Fallback copy method failed:`, fallbackErr);
        setError('Failed to copy to clipboard even with fallback. Please copy manually.');
      }
    }
  };

  return (
    <div>
      <h2>Camera Screen</h2>
      <div>
        <strong>Status:</strong> {status}
      </div>
      {error && <div style={{ color: 'red' }}><strong>Error:</strong> {error}</div>}

      <div>
        <h3>1. Start Local Media</h3>
        {!localStream ? (
          <button onClick={startLocalMedia}>Start Camera & Mic</button>
        ) : (
          <p>Local media active. Stream ID: {localStream?.id}</p>
        )}
        {localStream && <video ref={el => { if (el) el.srcObject = localStream; }} autoPlay playsInline muted style={{ width: '320px', height: '240px', border: '1px solid black' }} />}
      </div>

      <div>
        <h3>2. Create Offer for Controller</h3>
        <button onClick={initializePcAndCreateOffer} disabled={!localStream || (pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed') }>
          Create Offer
        </button>
        {offerSignal && (
          <div>
            <h4>Copy this Offer to Controller:</h4>
            <textarea 
              ref={offerSignalTextareaRef} 
              readOnly 
              value={offerSignal} 
              rows={15} 
              cols={80} 
              style={{ fontFamily: 'monospace', fontSize: '10px', verticalAlign: 'top' }}
            />
            <button onClick={() => copyToClipboard(offerSignal)} style={{ verticalAlign: 'top', marginLeft: '5px' }}>Copy Offer</button>
          </div>
        )}
      </div>

      <div>
        <h3>3. Paste Answer from Controller</h3>
        <textarea 
          placeholder="Paste Controller's Answer JSON here" 
          value={answerSignalInput} 
          onChange={e => setAnswerSignalInput(e.target.value)} 
          rows={15} 
          cols={80}
          style={{ fontFamily: 'monospace', fontSize: '10px' }}
          disabled={!pcRef.current || (pcRef.current.signalingState !== 'have-local-offer' && pcRef.current.signalingState !== 'stable')}
        />
        <br />
        <button onClick={processAnswerFromController} disabled={!answerSignalInput || !pcRef.current || (pcRef.current.signalingState !== 'have-local-offer' && pcRef.current.signalingState !== 'stable')}>
          Submit Answer
        </button>
      </div>
    </div>
  );
}

export default CameraScreen; 