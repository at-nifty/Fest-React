import React, { useState, useRef, useEffect } from 'react';

const MON_LOG_PREFIX = "[MonScreen]";

function MonitorScreen() {
  console.log(`${MON_LOG_PREFIX} Component RENDERED`);
  const [remoteStream, setRemoteStream] = useState(null);
  const [offerSignalInput, setOfferSignalInput] = useState('');
  const [answerSignal, setAnswerSignal] = useState('');
  const [status, setStatus] = useState('Waiting for Offer');
  const [error, setError] = useState('');

  const pcRef = useRef(null);
  const collectedIceCandidatesRef = useRef([]);
  const remoteVideoRef = useRef(null);
  const answerSignalTextareaRef = useRef(null);

  useEffect(() => {
    console.log(`${MON_LOG_PREFIX} useEffect for cleanup triggered.`);
    return () => {
      console.log(`${MON_LOG_PREFIX} Cleanup effect: Closing PeerConnection.`);
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (remoteStream) {
        console.log(`${MON_LOG_PREFIX} Cleanup effect: Stopping remote stream tracks.`);
        remoteStream.getTracks().forEach(track => track.stop());
        setRemoteStream(null);
      }
    };
  }, [remoteStream]); // remoteStream added to dependencies to ensure cleanup if it changes

  const processOfferAndCreateAnswer = async () => {
    console.log(`${MON_LOG_PREFIX} processOfferAndCreateAnswer called with input:`, offerSignalInput);
    if (!offerSignalInput) {
      console.error(`${MON_LOG_PREFIX} Offer signal input is empty.`);
      setError("Monitor: Offer signal from Controller is empty.");
      return;
    }

    let offerSignalPayload;
    try {
      offerSignalPayload = JSON.parse(offerSignalInput);
      console.log(`${MON_LOG_PREFIX} Parsed offer signal payload:`, offerSignalPayload);
    } catch (e) {
      console.error(`${MON_LOG_PREFIX} Invalid JSON in offer:`, e);
      setError(`Monitor: Invalid JSON in offer: ${e.message}`);
      return;
    }

    if (!offerSignalPayload || typeof offerSignalPayload.sdp !== 'object' || !offerSignalPayload.sdp.type || !offerSignalPayload.sdp.sdp) {
      console.error(`${MON_LOG_PREFIX} Invalid offer signal structure:`, offerSignalPayload);
      setError("Monitor: Invalid offer signal received (missing sdp or sdp fields).");
      return;
    }
    if (offerSignalPayload.sdp.type !== 'offer') {
        console.warn(`${MON_LOG_PREFIX} Expected SDP type 'offer' but got '${offerSignalPayload.sdp.type}'.`);
        // setError("Monitor: SDP type in offer is not 'offer'."); // Might be too strict
    }

    try {
      setStatus("Monitor: Initializing PeerConnection...");
      setError('');
      collectedIceCandidatesRef.current = [];
      console.log(`${MON_LOG_PREFIX} Initializing RTCPeerConnection. Current pcRef:`, pcRef.current);
      if(pcRef.current) {
        console.warn(`${MON_LOG_PREFIX} Existing PeerConnection found. Closing it before creating a new one.`);
        pcRef.current.close();
      }

      const pc = new RTCPeerConnection({
          iceTransportPolicy: 'all' 
      });
      console.log(`${MON_LOG_PREFIX} New RTCPeerConnection created:`, pc);
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        console.log(`${MON_LOG_PREFIX} onicecandidate event:`, event);
        if (event.candidate) {
          console.log(`${MON_LOG_PREFIX} Collected ICE candidate for Monitor answer:`, event.candidate.toJSON());
          collectedIceCandidatesRef.current.push(event.candidate.toJSON());
        } else {
          console.log(`${MON_LOG_PREFIX} All ICE candidates collected (event.candidate is null).`);
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log(`${MON_LOG_PREFIX} onicegatheringstatechange - state:`, pc.iceGatheringState, "PeerConnection:", pc);
        setStatus(`Monitor ICE Gathering: ${pc.iceGatheringState}`);
        if (pc.iceGatheringState === 'complete') {
          console.log(`${MON_LOG_PREFIX} ICE gathering complete.`);
          if (!pc.localDescription) {
            console.error(`${MON_LOG_PREFIX} Local description is null at ICE complete.`);
            setError("Monitor: Error: Local description missing during answer creation.");
            return;
          }
          const answerSignalPayload = {
            type: 'monitor_answer',
            sdp: pc.localDescription.toJSON(),
            iceCandidates: collectedIceCandidatesRef.current
          };
          console.log(`${MON_LOG_PREFIX} Answer for Controller fully prepared. Signal object:`, answerSignalPayload);
          setAnswerSignal(JSON.stringify(answerSignalPayload, null, 2));
          setStatus('Monitor: Answer created. Copy it to Controller.');
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`${MON_LOG_PREFIX} oniceconnectionstatechange - state:`, pc.iceConnectionState, "PeerConnection:", pc);
        setStatus(`Monitor-Ctrl ICE: ${pc.iceConnectionState}`);
      };

      pc.onconnectionstatechange = () => {
        console.log(`${MON_LOG_PREFIX} onconnectionstatechange - state:`, pc.connectionState, "PeerConnection:", pc);
        setStatus(`Monitor-Ctrl Connection: ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
          setError("Monitor: Connection to Controller FAILED.");
          console.error(
            `${MON_LOG_PREFIX} Connection to Controller FAILED. Offer SDP:`, pc.remoteDescription?.sdp, 
            "Answer SDP:", pc.localDescription?.sdp,
            "Collected local ICE:", collectedIceCandidatesRef.current
          );
        } else if (pc.connectionState === "connected") {
          setStatus("Monitor: Successfully connected to Controller!");
          setError('');
        }
      };

      pc.onsignalingstatechange = () => {
        console.log(`${MON_LOG_PREFIX} onsignalingstatechange - state:`, pc.signalingState, "PeerConnection:", pc);
      };

      pc.ontrack = (event) => {
        console.log(`${MON_LOG_PREFIX} ontrack event:`, event);
        if (event.streams && event.streams[0]) {
          console.log(`${MON_LOG_PREFIX} Remote stream received:`, event.streams[0]);
          setRemoteStream(event.streams[0]);
          setStatus("Monitor: Remote stream received!");
        } else {
          console.warn(`${MON_LOG_PREFIX} ontrack event received, but no stream or track data found in streams[0]. Using event.track.`, event.track);
          const newStream = new MediaStream();
          newStream.addTrack(event.track);
          setRemoteStream(newStream);
        }
      };

      console.log(`${MON_LOG_PREFIX} Setting remote description (offer from Controller) with sdp:`, offerSignalPayload.sdp);
      await pc.setRemoteDescription(new RTCSessionDescription(offerSignalPayload.sdp));
      console.log(`${MON_LOG_PREFIX} Remote description (offer from Controller) set. Current remoteDescription:`, pc.remoteDescription);
      
      if (offerSignalPayload.iceCandidates && Array.isArray(offerSignalPayload.iceCandidates)) {
        console.log(`${MON_LOG_PREFIX} Adding ${offerSignalPayload.iceCandidates.length} ICE candidates from Controller's offer.`);
        for (const candidate of offerSignalPayload.iceCandidates) {
          if (candidate) {
             console.log(`${MON_LOG_PREFIX} Attempting to add ICE candidate:`, candidate);
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
              console.log(`${MON_LOG_PREFIX} Successfully added ICE candidate from Controller's offer:`, candidate);
            } catch (addIceError) {
              console.error(`${MON_LOG_PREFIX} Error adding one ICE candidate from Controller's offer:`, candidate, addIceError);
              setError(prev => `${prev} AddICE Fail (Offer): ${addIceError.message}. Candidate: ${JSON.stringify(candidate)}. `);
            }
          } else {
            console.warn(`${MON_LOG_PREFIX} Received a null/undefined ICE candidate in Controller's offer. Skipping.`);
          }
        }
         console.log(`${MON_LOG_PREFIX} Finished processing ICE candidates from Controller's offer.`);
      } else {
        console.log(`${MON_LOG_PREFIX} No ICE candidates in Controller's offer or not an array.`);
      }

      console.log(`${MON_LOG_PREFIX} Creating answer...`);
      const answer = await pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
      });
      console.log(`${MON_LOG_PREFIX} Answer created:`, answer);
      await pc.setLocalDescription(answer);
      console.log(`${MON_LOG_PREFIX} Local description (answer) set. Current localDescription:`, pc.localDescription);
      // Answer signal generation moved to onicegatheringstatechange === 'complete'

    } catch (err) {
      console.error(`${MON_LOG_PREFIX} Error in processOfferAndCreateAnswer:`, err);
      setError(`Monitor: Answer Error: ${err.toString()}`);
      setStatus('Monitor: Failed to create answer.');
    }
  };

  const copyToClipboard = (text) => {
    console.log(`${MON_LOG_PREFIX} copyToClipboard called for text:`, text.substring(0, 100) + "...");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          console.log(`${MON_LOG_PREFIX} Copied to clipboard successfully.`);
          setStatus('Copied to clipboard!');
           setTimeout(() => setStatus(prev => prev === 'Copied to clipboard!' ? 'Monitor: Answer created. Copy it to Controller.' : prev), 2000);
        })
        .catch(err => {
          console.error(`${MON_LOG_PREFIX} Failed to copy text using navigator.clipboard:`, err);
          setError('Failed to copy to clipboard. Please copy manually.');
        });
    } else {
      console.warn(`${MON_LOG_PREFIX} navigator.clipboard not available. Using fallback copy method.`);
      try {
        answerSignalTextareaRef.current?.select();
        document.execCommand('copy');
        console.log(`${MON_LOG_PREFIX} Copied to clipboard using fallback.`);
        setStatus('Copied to clipboard (fallback)! Please verify.');
        setTimeout(() => setStatus(prev => prev === 'Copied to clipboard (fallback)! Please verify.' ? 'Monitor: Answer created. Copy it to Controller.' : prev), 2000);
      } catch (fallbackErr) {
        console.error(`${MON_LOG_PREFIX} Fallback copy method failed:`, fallbackErr);
        setError('Failed to copy to clipboard even with fallback. Please copy manually.');
      }
    }
  };

  return (
    <div>
      <h2>Monitor Screen</h2>
      <div>
        <strong>Status:</strong> {status}
      </div>
      {error && <div style={{ color: 'red' }}><strong>Error:</strong> {error}</div>}

      <div>
        <h3>1. Paste Offer from Controller</h3>
        <textarea 
          placeholder="Paste Controller's Offer JSON here" 
          value={offerSignalInput} 
          onChange={e => setOfferSignalInput(e.target.value)} 
          rows={15} 
          cols={80}
          style={{ fontFamily: 'monospace', fontSize: '10px' }}
          disabled={pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed'}
        />
        <br />
        <button onClick={processOfferAndCreateAnswer} disabled={!offerSignalInput || (pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed')}>
          Process Offer & Create Answer
        </button>
      </div>

      {answerSignal && (
        <div>
          <h3>2. Copy this Answer to Controller</h3>
          <textarea 
            ref={answerSignalTextareaRef} 
            readOnly 
            value={answerSignal} 
            rows={15} 
            cols={80} 
            style={{ fontFamily: 'monospace', fontSize: '10px', verticalAlign: 'top' }}
          />
          <button onClick={() => copyToClipboard(answerSignal)} style={{ verticalAlign: 'top', marginLeft: '5px' }}>Copy Answer</button>
        </div>
      )}

      <div>
        <h3>Remote Video from Controller</h3>
        {remoteStream ? (
          <video ref={el => { if (el) el.srcObject = remoteStream; }} autoPlay playsInline style={{ width: '640px', height: '480px', border: '1px solid black' }} />
        ) : (
          <p>Waiting for remote stream...</p>
        )}
      </div>
    </div>
  );
}

export default MonitorScreen; 