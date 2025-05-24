import React, { useState, useRef, useEffect } from 'react';

const CTRL_LOG_PREFIX = "[CtrlScreen]";

function ControllerScreen() {
  console.log(`${CTRL_LOG_PREFIX} Component RENDERED`);
  const [camOfferSignalInput, setCamOfferSignalInput] = useState('');
  const [camAnswerSignal, setCamAnswerSignal] = useState('');
  const [monitorOfferSignal, setMonitorOfferSignal] = useState('');
  const [monitorAnswerSignalInput, setMonitorAnswerSignalInput] = useState('');

  const [status, setStatus] = useState('Waiting for Camera Offer');
  const [error, setError] = useState('');

  const pcCamRef = useRef(null); // PeerConnection for Camera
  const pcMonitorRef = useRef(null); // PeerConnection for Monitor
  const remoteCamStreamRef = useRef(null);

  const collectedCamIceCandidatesRef = useRef([]);
  const collectedMonitorIceCandidatesRef = useRef([]);

  const camAnswerTextareaRef = useRef(null);
  const monitorOfferTextareaRef = useRef(null);

  useEffect(() => {
    console.log(`${CTRL_LOG_PREFIX} useEffect for cleanup triggered.`);
    return () => {
      console.log(`${CTRL_LOG_PREFIX} Cleanup: Closing Cam PeerConnection.`);
      if (pcCamRef.current) {
        pcCamRef.current.close();
        pcCamRef.current = null;
      }
      console.log(`${CTRL_LOG_PREFIX} Cleanup: Closing Monitor PeerConnection.`);
      if (pcMonitorRef.current) {
        pcMonitorRef.current.close();
        pcMonitorRef.current = null;
      }
      if (remoteCamStreamRef.current) {
        console.log(`${CTRL_LOG_PREFIX} Cleanup: Stopping remote camera stream tracks.`);
        remoteCamStreamRef.current.getTracks().forEach(track => track.stop());
        remoteCamStreamRef.current = null;
      }
    };
  }, []);

  // ---- Camera Facing Logic ----
  const processCameraOfferAndCreateAnswer = async () => {
    console.log(`${CTRL_LOG_PREFIX} processCameraOfferAndCreateAnswer called with input:`, camOfferSignalInput);
    if (!camOfferSignalInput) {
      console.error(`${CTRL_LOG_PREFIX} Camera offer input is empty.`);
      setError("Controller: Camera offer input is empty.");
      return;
    }
    let camOfferPayload;
    try {
      camOfferPayload = JSON.parse(camOfferSignalInput);
      console.log(`${CTRL_LOG_PREFIX} Parsed Camera offer payload:`, camOfferPayload);
    } catch (e) {
      console.error(`${CTRL_LOG_PREFIX} Invalid JSON in Camera offer:`, e);
      setError(`Controller: Invalid JSON in Camera offer: ${e.message}`);
      return;
    }

    if (!camOfferPayload || typeof camOfferPayload.sdp !== 'object' || !camOfferPayload.sdp.type || !camOfferPayload.sdp.sdp) {
      console.error(`${CTRL_LOG_PREFIX} Invalid Camera offer signal structure:`, camOfferPayload);
      setError("Controller: Invalid Camera offer signal (missing sdp or sdp fields).");
      return;
    }
     if (camOfferPayload.sdp.type !== 'offer') {
        console.warn(`${CTRL_LOG_PREFIX} Cam SDP type is '${camOfferPayload.sdp.type}', expected 'offer'.`);
    }

    try {
      setStatus("Controller: Initializing PC for Camera...");
      setError('');
      collectedCamIceCandidatesRef.current = [];
      console.log(`${CTRL_LOG_PREFIX} Initializing RTCPeerConnection for Camera. Current pcCamRef:`, pcCamRef.current);
      if(pcCamRef.current) {
        console.warn(`${CTRL_LOG_PREFIX} Existing Cam PeerConnection found. Closing it before creating a new one.`);
        pcCamRef.current.close();
      }

      const pcCam = new RTCPeerConnection({ iceTransportPolicy: 'all' });
      console.log(`${CTRL_LOG_PREFIX} New RTCPeerConnection for Camera created:`, pcCam);
      pcCamRef.current = pcCam;

      pcCam.onicecandidate = (event) => {
        console.log(`${CTRL_LOG_PREFIX} CamPC: onicecandidate event:`, event);
        if (event.candidate) {
          console.log(`${CTRL_LOG_PREFIX} CamPC: Collected ICE candidate for Camera answer:`, event.candidate.toJSON());
          collectedCamIceCandidatesRef.current.push(event.candidate.toJSON());
        } else {
          console.log(`${CTRL_LOG_PREFIX} CamPC: All ICE candidates collected (event.candidate is null).`);
        }
      };

      pcCam.onicegatheringstatechange = () => {
        console.log(`${CTRL_LOG_PREFIX} CamPC: onicegatheringstatechange - state:`, pcCam.iceGatheringState);
        setStatus(`Ctrl-Cam ICE Gathering: ${pcCam.iceGatheringState}`);
        if (pcCam.iceGatheringState === 'complete') {
          console.log(`${CTRL_LOG_PREFIX} CamPC: ICE gathering complete.`);
          if (!pcCam.localDescription) {
            console.error(`${CTRL_LOG_PREFIX} CamPC: Local description is null at ICE complete.`);
            setError("Controller: Error: CamPC Local description missing during answer creation.");
            return;
          }
          const camAnswerPayload = {
            type: 'controller_answer_to_cam',
            sdp: pcCam.localDescription.toJSON(),
            iceCandidates: collectedCamIceCandidatesRef.current
          };
          console.log(`${CTRL_LOG_PREFIX} CamPC: Camera Answer fully prepared. Signal object:`, camAnswerPayload);
          setCamAnswerSignal(JSON.stringify(camAnswerPayload, null, 2));
          setStatus('Controller: Answer for Camera created. Copy to Camera & await Monitor Answer.');
        }
      };

      pcCam.oniceconnectionstatechange = () => {
        console.log(`${CTRL_LOG_PREFIX} CamPC: oniceconnectionstatechange - state:`, pcCam.iceConnectionState);
        setStatus(`Ctrl-Cam ICE: ${pcCam.iceConnectionState}`);
      };

      pcCam.onconnectionstatechange = () => {
        console.log(`${CTRL_LOG_PREFIX} CamPC: onconnectionstatechange - state:`, pcCam.connectionState);
        setStatus(`Ctrl-Cam Connection: ${pcCam.connectionState}`);
        if (pcCam.connectionState === 'failed') {
          setError("Controller: Connection with Camera FAILED.");
           console.error(`${CTRL_LOG_PREFIX} CamPC: Connection FAILED. Cam Offer SDP:`, pcCam.remoteDescription?.sdp, "Ctrl Answer SDP:", pcCam.localDescription?.sdp);
        } else if (pcCam.connectionState === 'connected') {
          setStatus("Controller: Connected with Camera!");
          setError('');
          // If Monitor is already connected, we might need to re-negotiate or handle tracks.
          // For now, assume Monitor connects after Camera stream is established.
        }
      };

       pcCam.onsignalingstatechange = () => {
        console.log(`${CTRL_LOG_PREFIX} CamPC: onsignalingstatechange - state:`, pcCam.signalingState);
      };

      pcCam.ontrack = (event) => {
        console.log(`${CTRL_LOG_PREFIX} CamPC: ontrack event:`, event);
        if (event.streams && event.streams[0]) {
          console.log(`${CTRL_LOG_PREFIX} CamPC: Remote stream from Camera received:`, event.streams[0]);
          remoteCamStreamRef.current = event.streams[0];
          setStatus("Controller: Camera stream received.");

          // If Monitor PC is ready, add track to it.
          if (pcMonitorRef.current && pcMonitorRef.current.signalingState === 'stable' || pcMonitorRef.current.signalingState === 'have-remote-offer' || pcMonitorRef.current.signalingState === 'have-local-pranswer') { // any state where adding track is safe
            console.log(`${CTRL_LOG_PREFIX} CamPC: Monitor PC exists, adding Camera stream tracks to Monitor PC.`);
            remoteCamStreamRef.current.getTracks().forEach(track => {
              try {
                 const sender = pcMonitorRef.current.addTrack(track, remoteCamStreamRef.current);
                 console.log(`${CTRL_LOG_PREFIX} Added ${track.kind} track from Cam to MonitorPC. Sender:`, sender);
              } catch (addTrackError) {
                 console.error(`${CTRL_LOG_PREFIX} Error adding track from Cam to MonitorPC:`, addTrackError);
                 setError(prev => `${prev} Err addTrack Cam->Mon: ${addTrackError.message}. `);
              }
            });
          } else {
            console.log(`${CTRL_LOG_PREFIX} CamPC: Monitor PC not ready or in unsuitable state (${pcMonitorRef.current?.signalingState}) to add tracks yet.`);
          }
        } else {
            console.warn(`${CTRL_LOG_PREFIX} CamPC: ontrack event but no stream[0]. Track:`, event.track);
            // Attempt to construct stream manually if only track is available
            const newStream = new MediaStream();
            newStream.addTrack(event.track);
            remoteCamStreamRef.current = newStream;
            setStatus("Controller: Camera track received (manual stream construction).");
             // Repeat logic for adding to monitor PC if needed
        }
      };

      console.log(`${CTRL_LOG_PREFIX} CamPC: Setting remote description (Camera Offer) with sdp:`, camOfferPayload.sdp);
      await pcCam.setRemoteDescription(new RTCSessionDescription(camOfferPayload.sdp));
      console.log(`${CTRL_LOG_PREFIX} CamPC: Remote description (Camera Offer) set. Current remoteDescription:`, pcCam.remoteDescription);

      if (camOfferPayload.iceCandidates && Array.isArray(camOfferPayload.iceCandidates)) {
        console.log(`${CTRL_LOG_PREFIX} CamPC: Adding ${camOfferPayload.iceCandidates.length} ICE candidates from Camera.`);
        for (const candidate of camOfferPayload.iceCandidates) {
          if (candidate) {
            console.log(`${CTRL_LOG_PREFIX} CamPC: Attempting to add ICE candidate from Camera:`, candidate);
            try {
              await pcCam.addIceCandidate(new RTCIceCandidate(candidate));
              console.log(`${CTRL_LOG_PREFIX} CamPC: Successfully added ICE candidate from Camera:`, candidate);
            } catch (addIceError) {
              console.error(`${CTRL_LOG_PREFIX} CamPC: Error adding one ICE candidate from Camera:`, candidate, addIceError);
              setError(prev => `${prev} AddICE Fail (CamOffer): ${addIceError.message}. `);
            }
          } else {
            console.warn(`${CTRL_LOG_PREFIX} CamPC: Received a null/undefined ICE candidate from Camera. Skipping.`);
          }
        }
        console.log(`${CTRL_LOG_PREFIX} CamPC: Finished processing ICE candidates from Camera.`);
      } else {
        console.log(`${CTRL_LOG_PREFIX} CamPC: No ICE candidates in Camera offer or not an array.`);
      }

      console.log(`${CTRL_LOG_PREFIX} CamPC: Creating answer for Camera...`);
      const camAnswer = await pcCam.createAnswer(); // Controller receives, so no special offerToReceive options needed here
      console.log(`${CTRL_LOG_PREFIX} CamPC: Answer for Camera created:`, camAnswer);
      await pcCam.setLocalDescription(camAnswer);
      console.log(`${CTRL_LOG_PREFIX} CamPC: Local description (Answer to Camera) set. Current localDescription:`, pcCam.localDescription);
      // Camera answer signal generation is now handled by onicegatheringstatechange complete

    } catch (err) {
      console.error(`${CTRL_LOG_PREFIX} Error in processCameraOfferAndCreateAnswer:`, err);
      setError(`Controller: Cam Offer/Answer Error: ${err.toString()}`);
      setStatus('Controller: Failed to process Camera offer.');
    }
  };

  // ---- Monitor Facing Logic ----
  const createOfferForMonitor = async () => {
    console.log(`${CTRL_LOG_PREFIX} createOfferForMonitor called.`);
    if (!remoteCamStreamRef.current) {
      console.error(`${CTRL_LOG_PREFIX} MonitorPC: Camera stream not yet available.`);
      setError("Controller: Camera stream not available. Process Camera offer first.");
      return;
    }
    if (pcMonitorRef.current && pcMonitorRef.current.signalingState !== 'stable' && pcMonitorRef.current.signalingState !== 'closed') {
        console.warn(`${CTRL_LOG_PREFIX} MonitorPC: PeerConnection already exists and is not in stable/closed state (${pcMonitorRef.current.signalingState}). Re-creating.`);
        pcMonitorRef.current.close();
        pcMonitorRef.current = null; // Allow re-initialization
    }

    try {
      setStatus("Controller: Initializing PC for Monitor...");
      setError('');
      collectedMonitorIceCandidatesRef.current = [];
      console.log(`${CTRL_LOG_PREFIX} Initializing RTCPeerConnection for Monitor. Current pcMonitorRef:`, pcMonitorRef.current);
       if(pcMonitorRef.current) { // Should be null due to above check, but defensive
        console.warn(`${CTRL_LOG_PREFIX} MonitorPC: Existing PeerConnection found unexpectedly. Closing.`);
        pcMonitorRef.current.close();
      }

      const pcMonitor = new RTCPeerConnection({ iceTransportPolicy: 'all' });
      console.log(`${CTRL_LOG_PREFIX} New RTCPeerConnection for Monitor created:`, pcMonitor);
      pcMonitorRef.current = pcMonitor;

      pcMonitor.onicecandidate = (event) => {
        console.log(`${CTRL_LOG_PREFIX} MonitorPC: onicecandidate event:`, event);
        if (event.candidate) {
          console.log(`${CTRL_LOG_PREFIX} MonitorPC: Collected ICE candidate for Monitor offer:`, event.candidate.toJSON());
          collectedMonitorIceCandidatesRef.current.push(event.candidate.toJSON());
        } else {
          console.log(`${CTRL_LOG_PREFIX} MonitorPC: All ICE candidates collected (event.candidate is null).`);
        }
      };

      pcMonitor.onicegatheringstatechange = () => {
        console.log(`${CTRL_LOG_PREFIX} MonitorPC: onicegatheringstatechange - state:`, pcMonitor.iceGatheringState);
        setStatus(`Ctrl-Mon ICE Gathering: ${pcMonitor.iceGatheringState}`);
        if (pcMonitor.iceGatheringState === 'complete') {
          console.log(`${CTRL_LOG_PREFIX} MonitorPC: ICE gathering complete.`);
          if (!pcMonitor.localDescription) {
            console.error(`${CTRL_LOG_PREFIX} MonitorPC: Local description is null at ICE complete.`);
            setError("Controller: Error: MonitorPC Local description missing during offer creation.");
            return;
          }
          const monitorOfferPayload = {
            type: 'controller_offer_to_monitor',
            sdp: pcMonitor.localDescription.toJSON(),
            iceCandidates: collectedMonitorIceCandidatesRef.current
          };
          console.log(`${CTRL_LOG_PREFIX} MonitorPC: Monitor Offer fully prepared. Signal object:`, monitorOfferPayload);
          setMonitorOfferSignal(JSON.stringify(monitorOfferPayload, null, 2));
          setStatus('Controller: Offer for Monitor created. Copy to Monitor.');
        }
      };

      pcMonitor.oniceconnectionstatechange = () => {
        console.log(`${CTRL_LOG_PREFIX} MonitorPC: oniceconnectionstatechange - state:`, pcMonitor.iceConnectionState);
        setStatus(`Ctrl-Mon ICE: ${pcMonitor.iceConnectionState}`);
      };

      pcMonitor.onconnectionstatechange = () => {
        console.log(`${CTRL_LOG_PREFIX} MonitorPC: onconnectionstatechange - state:`, pcMonitor.connectionState);
        setStatus(`Ctrl-Mon Connection: ${pcMonitor.connectionState}`);
        if (pcMonitor.connectionState === 'failed') {
          setError("Controller: Connection with Monitor FAILED.");
          console.error(`${CTRL_LOG_PREFIX} MonitorPC: Connection FAILED. Ctrl Offer SDP:`, pcMonitor.localDescription?.sdp, "Monitor Answer SDP:", pcMonitor.remoteDescription?.sdp);
        } else if (pcMonitor.connectionState === 'connected') {
          setStatus("Controller: Connected with Monitor! Streaming should start.");
          setError('');
        }
      };

      pcMonitor.onsignalingstatechange = () => {
        console.log(`${CTRL_LOG_PREFIX} MonitorPC: onsignalingstatechange - state:`, pcMonitor.signalingState);
      };

      // Add tracks from Camera to this PC (pcMonitor)
      console.log(`${CTRL_LOG_PREFIX} MonitorPC: Adding tracks from Camera stream to Monitor PC.`);
      if (remoteCamStreamRef.current) {
        remoteCamStreamRef.current.getTracks().forEach(track => {
           try {
            const sender = pcMonitor.addTrack(track, remoteCamStreamRef.current);
            console.log(`${CTRL_LOG_PREFIX} MonitorPC: Added ${track.kind} track to Monitor PC. Sender:`, sender);
           } catch (addTrackError) {
             console.error(`${CTRL_LOG_PREFIX} MonitorPC: Error adding track to MonitorPC:`, addTrackError);
             setError(prev => `${prev} Err addTrack to MonPC: ${addTrackError.message}. `);
           }
        });
      } else {
        console.warn(
          `${CTRL_LOG_PREFIX} MonitorPC: remoteCamStreamRef.current is null when trying to add tracks for Monitor offer. This may lead to no video on Monitor.`
        );
      }

      console.log(`${CTRL_LOG_PREFIX} MonitorPC: Creating offer for Monitor...`);
      const monitorOffer = await pcMonitor.createOffer({
        offerToReceiveAudio: false, // Controller is sending, not receiving from Monitor
        offerToReceiveVideo: false,
      });
      console.log(`${CTRL_LOG_PREFIX} MonitorPC: Offer for Monitor created:`, monitorOffer);
      await pcMonitor.setLocalDescription(monitorOffer);
      console.log(`${CTRL_LOG_PREFIX} MonitorPC: Local description (Offer to Monitor) set. Current localDescription:`, pcMonitor.localDescription);
      // Monitor offer signal generation is now handled by onicegatheringstatechange complete

    } catch (err) {
      console.error(`${CTRL_LOG_PREFIX} Error in createOfferForMonitor:`, err);
      setError(`Controller: Monitor Offer Error: ${err.toString()}`);
      setStatus('Controller: Failed to create Monitor offer.');
    }
  };

  const processMonitorAnswer = async () => {
    console.log(`${CTRL_LOG_PREFIX} processMonitorAnswer called with input:`, monitorAnswerSignalInput);
    const pcMon = pcMonitorRef.current;
    if (!pcMon) {
      console.error(`${CTRL_LOG_PREFIX} MonitorPC not initialized.`);
      setError("Controller: Monitor PeerConnection not ready. Create offer for Monitor first.");
      return;
    }
     console.log(`${CTRL_LOG_PREFIX} MonitorPC: Current signalingState before processing answer:`, pcMon.signalingState);
    if (pcMon.signalingState !== 'have-local-offer' && pcMon.signalingState !== 'stable') {
        console.warn(`${CTRL_LOG_PREFIX} MonitorPC: Signaling state is ${pcMon.signalingState}, usually expect have-local-offer. Proceeding cautiously.`);
    }

    if (!monitorAnswerSignalInput) {
      console.error(`${CTRL_LOG_PREFIX} Monitor answer input is empty.`);
      setError("Controller: Monitor answer input is empty.");
      return;
    }

    let monAnswerPayload;
    try {
      monAnswerPayload = JSON.parse(monitorAnswerSignalInput);
      console.log(`${CTRL_LOG_PREFIX} Parsed Monitor answer payload:`, monAnswerPayload);
    } catch (e) {
      console.error(`${CTRL_LOG_PREFIX} Invalid JSON in Monitor answer:`, e);
      setError(`Controller: Invalid JSON in Monitor answer: ${e.message}`);
      return;
    }

    if (!monAnswerPayload || typeof monAnswerPayload.sdp !== 'object' || !monAnswerPayload.sdp.type || !monAnswerPayload.sdp.sdp) {
      console.error(`${CTRL_LOG_PREFIX} Invalid Monitor answer signal structure:`, monAnswerPayload);
      setError("Controller: Invalid Monitor answer signal (missing sdp or sdp fields).");
      return;
    }
    if (monAnswerPayload.sdp.type !== 'answer') {
        console.warn(`${CTRL_LOG_PREFIX} MonitorPC: Expected SDP type 'answer' but got '${monAnswerPayload.sdp.type}'.`);
    }

    setStatus("Controller: Processing Monitor Answer...");
    try {
      console.log(`${CTRL_LOG_PREFIX} MonitorPC: Setting remote description (Monitor Answer) with sdp:`, monAnswerPayload.sdp);
      await pcMon.setRemoteDescription(new RTCSessionDescription(monAnswerPayload.sdp));
      console.log(`${CTRL_LOG_PREFIX} MonitorPC: Remote description (Monitor Answer) set. Current remoteDescription:`, pcMon.remoteDescription);
      setStatus("Controller: Monitor answer SDP set. Adding ICE candidates...");

      if (monAnswerPayload.iceCandidates && Array.isArray(monAnswerPayload.iceCandidates)) {
        console.log(`${CTRL_LOG_PREFIX} MonitorPC: Adding ${monAnswerPayload.iceCandidates.length} ICE candidates from Monitor.`);
        for (const candidate of monAnswerPayload.iceCandidates) {
          if (candidate) {
            console.log(`${CTRL_LOG_PREFIX} MonitorPC: Attempting to add ICE candidate from Monitor:`, candidate);
            try {
              await pcMon.addIceCandidate(new RTCIceCandidate(candidate));
              console.log(`${CTRL_LOG_PREFIX} MonitorPC: Successfully added ICE candidate from Monitor:`, candidate);
            } catch (addIceError) {
              console.error(`${CTRL_LOG_PREFIX} MonitorPC: Error adding one ICE candidate from Monitor:`, candidate, addIceError);
              setError(prev => `${prev} AddICE Fail (MonAnswer): ${addIceError.message}. `);
            }
          } else {
            console.warn(`${CTRL_LOG_PREFIX} MonitorPC: Received a null/undefined ICE candidate from Monitor. Skipping.`);
          }
        }
        console.log(`${CTRL_LOG_PREFIX} MonitorPC: Finished processing ICE candidates from Monitor.`);
         setStatus("Controller: Monitor Answer processed. Connecting...");
      } else {
        console.log(`${CTRL_LOG_PREFIX} MonitorPC: No ICE candidates in Monitor answer or not an array.`);
        setStatus("Controller: Monitor Answer SDP set (no ICE from Mon). Connecting...");
      }
    } catch (err) {
      console.error(`${CTRL_LOG_PREFIX} Error in processMonitorAnswer:`, err);
      setError(`Controller: Monitor Answer Error: ${err.toString()}`);
      setStatus('Controller: Failed to process Monitor answer.');
    }
  };

  const copyToClipboard = (textareaRef, type) => {
    const textToCopy = textareaRef.current?.value;
    if (!textToCopy) {
        console.warn(`${CTRL_LOG_PREFIX} copyToClipboard: No text to copy for ${type}.`);
        setError(`Controller: No ${type} text to copy.`);
        return;
    }
    console.log(`${CTRL_LOG_PREFIX} copyToClipboard called for ${type}, text:`, textToCopy.substring(0, 100) + "...");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          console.log(`${CTRL_LOG_PREFIX} Copied ${type} to clipboard successfully.`);
          setStatus(`Copied ${type} to clipboard!`);
          setTimeout(() => setStatus(prev => prev === `Copied ${type} to clipboard!` ? `Controller: ${type} ready.` : prev), 2000);
        })
        .catch(err => {
          console.error(`${CTRL_LOG_PREFIX} Failed to copy ${type} using navigator.clipboard:`, err);
          setError(`Failed to copy ${type}. Please copy manually.`);
        });
    } else {
      console.warn(`${CTRL_LOG_PREFIX} navigator.clipboard not available. Using fallback for ${type}.`);
      try {
        textareaRef.current.select();
        document.execCommand('copy');
        console.log(`${CTRL_LOG_PREFIX} Copied ${type} to clipboard using fallback.`);
        setStatus(`Copied ${type} (fallback)! Please verify.`);
         setTimeout(() => setStatus(prev => prev === `Copied ${type} (fallback)! Please verify.` ? `Controller: ${type} ready.` : prev), 2000);
      } catch (fallbackErr) {
        console.error(`${CTRL_LOG_PREFIX} Fallback copy for ${type} failed:`, fallbackErr);
        setError(`Failed to copy ${type} with fallback. Please copy manually.`);
      }
    }
  };

  // JSX Structure
  return (
    <div>
      <h2>Controller Screen</h2>
      <div>
        <strong>Status:</strong> {status}
      </div>
      {error && <div style={{ color: 'red' }}><strong>Error:</strong> {error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        {/* Camera Facing Section */}
        <div style={{ border: '1px solid green', padding: '10px', margin: '5px' }}>
          <h3>Camera Connection</h3>
          <h4>1. Paste Camera's Offer JSON</h4>
          <textarea 
            placeholder="Paste Camera's Offer JSON here" 
            value={camOfferSignalInput} 
            onChange={e => setCamOfferSignalInput(e.target.value)} 
            rows={10} 
            cols={50}
            style={{ fontFamily: 'monospace', fontSize: '10px' }}
            disabled={pcCamRef.current && pcCamRef.current.signalingState !== 'stable' && pcCamRef.current.signalingState !== 'closed'}
          />
          <br />
          <button 
            onClick={processCameraOfferAndCreateAnswer} 
            disabled={!camOfferSignalInput || (pcCamRef.current && pcCamRef.current.signalingState !== 'stable' && pcCamRef.current.signalingState !== 'closed')}
          >
            Process Cam Offer & Create Answer for Cam
          </button>
          
          {camAnswerSignal && (
            <div>
              <h4>2. Copy this Answer to Camera</h4>
              <textarea 
                ref={camAnswerTextareaRef}
                readOnly 
                value={camAnswerSignal} 
                rows={10} 
                cols={50} 
                style={{ fontFamily: 'monospace', fontSize: '10px', verticalAlign: 'top' }}
              />
              <button onClick={() => copyToClipboard(camAnswerTextareaRef, "Camera Answer")} style={{ verticalAlign: 'top', marginLeft: '5px' }}>Copy Cam Answer</button>
            </div>
          )}
        </div>

        {/* Monitor Facing Section */}
        <div style={{ border: '1px solid blue', padding: '10px', margin: '5px' }}>
          <h3>Monitor Connection</h3>
          <h4>3. Create Offer for Monitor (after Cam connected)</h4>
          <button 
            onClick={createOfferForMonitor} 
            disabled={!remoteCamStreamRef.current || (pcMonitorRef.current && pcMonitorRef.current.signalingState !== 'stable' && pcMonitorRef.current.signalingState !== 'closed')}
          >
            Create Offer for Monitor
          </button>
          {monitorOfferSignal && (
            <div>
              <h4>4. Copy this Offer to Monitor</h4>
              <textarea 
                ref={monitorOfferTextareaRef}
                readOnly 
                value={monitorOfferSignal} 
                rows={10} 
                cols={50} 
                style={{ fontFamily: 'monospace', fontSize: '10px', verticalAlign: 'top' }}
              />
              <button onClick={() => copyToClipboard(monitorOfferTextareaRef, "Monitor Offer")} style={{ verticalAlign: 'top', marginLeft: '5px' }}>Copy Mon Offer</button>
            </div>
          )}

          <h4>5. Paste Monitor's Answer JSON</h4>
          <textarea 
            placeholder="Paste Monitor's Answer JSON here" 
            value={monitorAnswerSignalInput} 
            onChange={e => setMonitorAnswerSignalInput(e.target.value)} 
            rows={10} 
            cols={50}
            style={{ fontFamily: 'monospace', fontSize: '10px' }}
            disabled={!pcMonitorRef.current || (pcMonitorRef.current.signalingState !== 'have-local-offer' && pcMonitorRef.current.signalingState !== 'stable')}
          />
          <br />
          <button 
            onClick={processMonitorAnswer} 
            disabled={!monitorAnswerSignalInput || !pcMonitorRef.current || (pcMonitorRef.current.signalingState !== 'have-local-offer' && pcMonitorRef.current.signalingState !== 'stable')}
          >
            Process Monitor Answer
          </button>
        </div>
      </div>
      {remoteCamStreamRef.current && (
          <div>
            <h4>Preview of Camera Stream (Received at Controller)</h4>
            <video 
                ref={el => { if (el) el.srcObject = remoteCamStreamRef.current; }}
                autoPlay 
                playsInline 
                muted 
                style={{ width: '320px', height: '240px', border: '1px solid orange' }}
            />
          </div>
      )}
    </div>
  );
}

export default ControllerScreen; 